const orderService = require('../services/orderService');
const productService = require('../services/productService');
const userService = require('../services/userService');
const messages = require('../utils/messages');
const config = require('../config');
const paymentService = require('../services/paymentService');
const { Markup } = require('telegraf');
const { formatPrice, postDeliveryKeyboard } = require('../utils/keyboard');

module.exports = (bot) => {
    bot.action(/^qty_(\d+)_(\d+)$/, async (ctx) => {
        try {
            const productId = parseInt(ctx.match[1]);
            const quantity = parseInt(ctx.match[2]);
            const product = productService.getById(productId);

            if (!product) return ctx.answerCbQuery('❌ Sản phẩm không tồn tại');

            const availableStock = product.display_stock || product.stock_count;
            if (availableStock < quantity) return ctx.answerCbQuery(`❌ Chỉ còn ${availableStock} sản phẩm`);

            const totalPrice = product.price * quantity;
            userService.findOrCreate(ctx.from);
            const user = userService.get(ctx.from.id);
            
            const buttons = [];
            if (user && user.balance >= totalPrice) {
                buttons.push([Markup.button.callback(`💰 Thanh toán bằng số dư (${formatPrice(user.balance)})`, `pay_balance_${productId}_${quantity}`)]);
            }
            buttons.push([Markup.button.callback('🏦 Thanh toán qua ngân hàng', `pay_bank_${productId}_${quantity}`)]);
            buttons.push([Markup.button.callback('❌ Hủy', 'cancel_order')]);

            await ctx.replyWithHTML(
                `📦 <b>${product.name}</b>\n📊 Số lượng: ${quantity}\n💵 Tổng tiền: <b>${formatPrice(totalPrice)}</b>\n\n` +
                `💰 Số dư: <b>${formatPrice(user ? user.balance : 0)}</b>\n\n👇 Chọn phương thức thanh toán:`,
                Markup.inlineKeyboard(buttons)
            );
        } catch (error) {
            ctx.reply(`❌ Lỗi chọn số lượng: ${error.message}`);
        }
    });

    bot.action(/^pay_balance_(\d+)_(\d+)$/, async (ctx) => {
        try {
            const productId = parseInt(ctx.match[1]);
            const quantity = parseInt(ctx.match[2]);
            const product = productService.getById(productId);
            const totalPrice = product.price * quantity;
            const user = userService.get(ctx.from.id);

            if (!user || user.balance < totalPrice) return ctx.answerCbQuery('❌ Số dư không đủ!');

            userService.deductBalance(ctx.from.id, totalPrice);
            const order = orderService.create(ctx.from.id, product.id, quantity, totalPrice, 'BALANCE_' + Date.now());
            
            await ctx.answerCbQuery('✅ Đã thanh toán!');
            await ctx.editMessageText(
                `✅ <b>THANH TOÁN THÀNH CÔNG</b>\n\n💰 Đã trừ: <b>${formatPrice(totalPrice)}</b>\n💵 Còn lại: <b>${formatPrice(user.balance - totalPrice)}</b>\n\n📦 Đang giao hàng...`,
                { parse_mode: 'HTML' }
            );

            await deliverOrder(bot, order.id);
        } catch (error) {
            ctx.reply(`❌ Lỗi thanh toán: ${error.message}`);
        }
    });

    bot.action(/^pay_bank_(\d+)_(\d+)$/, async (ctx) => {
        try {
            const productId = parseInt(ctx.match[1]);
            const quantity = parseInt(ctx.match[2]);
            const product = productService.getById(productId);
            
            ctx.answerCbQuery('⏳ Đang tạo đơn...');
            const payment = paymentService.generatePayment(product.price * quantity, 0);
            const order = orderService.create(ctx.from.id, product.id, quantity, product.price * quantity, payment.paymentCode);

            const caption = `⏳ <b>Chờ thanh toán ${formatPrice(product.price * quantity)}...</b>\n\n👉 <a href="${payment.qrUrl}">BẤM VÀO ĐÂY LẤY MÃ QR</a>\n\n📦 ${product.name} × ${quantity}\n└ Nội dung CK: <code>${payment.paymentCode}</code>`;
            await ctx.replyWithHTML(caption, Markup.inlineKeyboard([[Markup.button.callback('❌ Hủy', `cancel_order_${order.id}`)]]));
        } catch (error) {
            ctx.reply(`❌ Lỗi tạo đơn: ${error.message}`);
        }
    });

    bot.action('cancel_order', (ctx) => { ctx.answerCbQuery('❌ Đã hủy'); ctx.editMessageText('❌ Đã hủy.'); });
    bot.action(/^cancel_order_(\d+)$/, (ctx) => { orderService.cancel(parseInt(ctx.match[1])); ctx.answerCbQuery('❌ Đã hủy'); ctx.reply('❌ Đã hủy đơn.'); });
};

async function deliverOrder(bot, orderId) {
    const result = orderService.confirmAndDeliver(orderId);
    if (!result.success) return result;

    const order = result.order;
    const product = productService.getById(order.product_id);

    try {
        await bot.telegram.sendMessage(order.user_id, messages.orderSuccessNotify(order.quantity), { parse_mode: 'HTML' });
        await bot.telegram.sendMessage(order.user_id, messages.orderSuccess(product, order.quantity, result.accounts), {
            parse_mode: 'HTML',
            ...postDeliveryKeyboard(),
        });
    } catch (err) {
        console.error('Lỗi gửi khách:', err.message);
    }

    try {
        const db = require('../database');
        const buyer = db.prepare('SELECT full_name, username FROM users WHERE telegram_id = ?').get(order.user_id);
        const buyerName = buyer ? buyer.full_name : 'Khách';

        const adminMsg = 
            `🔔 <b>ĐƠN HÀNG THÀNH CÔNG!</b>\n\n` +
            `👤 Khách: <b>${buyerName}</b> (<code>${order.user_id}</code>)\n` +
            `📦 Sản phẩm: <b>${product.name}</b> × ${order.quantity}\n` +
            `💰 Tổng tiền: <b>${formatPrice(order.total_price)}</b>\n` +
            `🆔 Mã đơn: <code>#${order.id}</code>`;

        await bot.telegram.sendMessage(config.ADMIN_ID, adminMsg, { parse_mode: 'HTML' });
    } catch (err) {
        console.error('Lỗi gửi Admin:', err.message);
    }

    return result;
}

// XUẤT HÀM DELIVERORDER ĐỂ WEBHOOK CÓ THỂ GỌI
module.exports.deliverOrder = deliverOrder;