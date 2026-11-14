const orderService = require('../services/orderService');
const productService = require('../services/productService');
const userService = require('../services/userService');
const messages = require('../utils/messages');
const config = require('../config');
const paymentService = require('../services/paymentService');
const { Markup } = require('telegraf');
const { formatPrice, postDeliveryKeyboard } = require('../utils/keyboard');

module.exports = (bot) => {
    // 1. Xử lý chọn số lượng (Hiển thị 2 nút thanh toán)
    bot.action(/^qty_(\d+)_(\d+)$/, async (ctx) => {
        const productId = parseInt(ctx.match[1]);
        const quantity = parseInt(ctx.match[2]);
        const product = productService.getById(productId);

        if (!product) return ctx.answerCbQuery('❌ Sản phẩm không tồn tại');

        const availableStock = product.display_stock || product.stock_count;
        if (availableStock < quantity) {
            return ctx.answerCbQuery(`❌ Chỉ còn ${availableStock} sản phẩm`);
        }

        const totalPrice = product.price * quantity;
        
        userService.findOrCreate(ctx.from);
        const user = userService.get(ctx.from.id);
        
        const buttons = [];
        
        // Nếu đủ tiền, hiện nút thanh toán bằng số dư
        if (user && user.balance >= totalPrice) {
            buttons.push([Markup.button.callback(`💰 Thanh toán bằng số dư (${formatPrice(user.balance)})`, `pay_balance_${productId}_${quantity}`)]);
        }
        
        // Nút thanh toán qua ngân hàng
        buttons.push([Markup.button.callback('🏦 Thanh toán qua ngân hàng', `pay_bank_${productId}_${quantity}`)]);
        buttons.push([Markup.button.callback('❌ Hủy', 'cancel_order')]);

        ctx.replyWithHTML(
            `📦 <b>${product.name}</b>\n` +
            `📊 Số lượng: ${quantity}\n` +
            `💵 Tổng tiền: <b>${formatPrice(totalPrice)}</b>\n\n` +
            `💰 Số dư của bạn: <b>${formatPrice(user ? user.balance : 0)}</b>\n\n` +
            `👇 Chọn phương thức thanh toán:`,
            Markup.inlineKeyboard(buttons)
        );
    });

    // 2. Xử lý thanh toán bằng số dư (Giao hàng ngay)
    bot.action(/^pay_balance_(\d+)_(\d+)$/, async (ctx) => {
        const productId = parseInt(ctx.match[1]);
        const quantity = parseInt(ctx.match[2]);
        const product = productService.getById(productId);
        const totalPrice = product.price * quantity;

        const user = userService.get(ctx.from.id);
        if (!user || user.balance < totalPrice) {
            return ctx.answerCbQuery('❌ Số dư không đủ!');
        }

        // Trừ tiền
        userService.deductBalance(ctx.from.id, totalPrice);

        // Tạo đơn hàng
        const order = orderService.create(ctx.from.id, product.id, quantity, totalPrice, 'BALANCE_PAY');
        
        // Đánh dấu đã thanh toán (để hàm giao hàng bên dưới chấp nhận)
        orderService.markPaid(order.id);

        ctx.answerCbQuery('✅ Đã thanh toán bằng số dư!');
       ctx.editMessageText(
            `✅ <b>THANH TOÁN THÀNH CÔNG</b>\n\n` +
            `💰 Đã trừ: <b>${formatPrice(totalPrice)}</b>\n` +
            `💵 Số dư còn lại: <b>${formatPrice(user.balance - totalPrice)}</b>\n\n` +
            `📦 Đang giao hàng cho bạn...`,
            { parse_mode: 'HTML' } // <-- Thêm dòng này để hết lỗi font
        );
        // Giao hàng
        try {
            const result = await deliverOrder(bot, order.id);
            if (!result.success) {
                ctx.reply(`❌ Lỗi giao hàng: ${result.error}`);
            }
        } catch (error) {
            ctx.reply('❌ Đã xảy ra lỗi khi giao hàng, vui lòng liên hệ Admin.');
        }
    });

    // 3. Nút thanh toán qua ngân hàng
    bot.action(/^pay_bank_(\d+)_(\d+)$/, async (ctx) => {
        const productId = parseInt(ctx.match[1]);
        const quantity = parseInt(ctx.match[2]);
        const product = productService.getById(productId);
        
        ctx.answerCbQuery('⏳ Đang tạo đơn hàng...');
        const payment = paymentService.generatePayment(product.price * quantity, 0);

        const order = orderService.create(ctx.from.id, product.id, quantity, product.price * quantity, payment.paymentCode);

        const caption =
            `⏳ <b>Đang chờ thanh toán ${formatPrice(product.price * quantity)}...</b>\n\n` +
            `Quét mã QR hoặc bấm vào link dưới đây để chuyển khoản:\n` +
            `👉 <a href="${payment.qrUrl}">BẤM VÀO ĐÂY ĐỂ LẤY MÃ QR</a>\n\n` +
            `💰 <b>THANH TOÁN ĐƠN HÀNG</b>\n\n` +
            `📦 Sản phẩm: ${product.name}\n` +
            `📊 Số lượng: ${quantity}\n` +
            `💵 Tổng tiền: <b>${formatPrice(product.price * quantity)}</b>\n\n` +
            `🏦 Quét mã QR để chuyển khoản\n` +
            `├ Số tiền: <b>${formatPrice(product.price * quantity)}</b>\n` +
            `└ Nội dung CK: <code>${payment.paymentCode}</code>\n\n` +
            `⏰ QR hiệu lực trong <b>15 phút</b>`;

        await ctx.replyWithHTML(caption, Markup.inlineKeyboard([
            [Markup.button.callback('❌ Hủy thanh toán', `cancel_order_${order.id}`)],
        ]));
    });

    // Các nút khác (Hủy, Data, Mua lại...)
    bot.action('cancel_order', (ctx) => { ctx.answerCbQuery('❌ Đã hủy'); ctx.editMessageText('❌ Đơn hàng đã bị hủy.'); });
    bot.action(/^cancel_order_(\d+)$/, (ctx) => { orderService.cancel(parseInt(ctx.match[1])); ctx.answerCbQuery('❌ Đã hủy'); ctx.reply('❌ Đơn hàng đã bị hủy.'); });
    bot.action('data_main', (ctx) => { ctx.answerCbQuery(); ctx.reply('📊 Tính năng đang phát triển...'); });
    bot.action('buy_again', (ctx) => { 
        ctx.answerCbQuery(); 
        const products = productService.getAll(); 
        const { productListKeyboard } = require('../utils/keyboard'); 
        ctx.reply(messages.productHeader, productListKeyboard(products)); 
    });
    bot.action(/^check_paid_(\d+)$/, async (ctx) => {
        ctx.answerCbQuery();
        ctx.replyWithHTML(messages.paymentPending);
    });
};

// Hàm giao hàng (Giữ nguyên)
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
        console.error(`Failed to send delivery to ${order.user_id}:`, err.message);
    }
    return result;
}
module.exports.deliverOrder = deliverOrder;