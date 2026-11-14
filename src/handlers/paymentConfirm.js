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
        
        ctx.answerCbQuery('✅ Đã thanh toán bằng số dư!');
        
        // Sửa lỗi font: Thêm parse_mode
        ctx.editMessageText(
            `✅ <b>THANH TOÁN THÀNH CÔNG</b>\n\n` +
            `💰 Đã trừ: <b>${formatPrice(totalPrice)}</b>\n` +
            `💵 Số dư còn lại: <b>${formatPrice(user.balance - totalPrice)}</b>\n\n` +
            `📦 Đang giao hàng cho bạn...`,
            { parse_mode: 'HTML' }
        );

        // Giao hàng và IN LỖI TRỰC TIẾP (nếu có)
        try {
            const result = await deliverOrder(bot, order.id);
            if (!result.success) {
                ctx.reply(`❌ Lỗi giao hàng (1): ${result.error}`);
            }
        } catch (error) {
            // In thẳng lỗi ra màn hình Telegram
            ctx.reply(`❌ Lỗi giao hàng (2): ${error.message}`); 
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
/**
 * Deliver order (called by admin confirm or webhook)
 */
async function deliverOrder(bot, orderId) {
    const result = orderService.confirmAndDeliver(orderId);

    if (!result.success) {
        return result;
    }

    const order = result.order;
    const product = productService.getById(order.product_id);

    // 1. Gửi tin nhắn cho khách
    try {
        await bot.telegram.sendMessage(
            order.user_id,
            messages.orderSuccessNotify(order.quantity),
            { parse_mode: 'HTML' }
        );

        await bot.telegram.sendMessage(
            order.user_id,
            messages.orderSuccess(product, order.quantity, result.accounts),
            {
                parse_mode: 'HTML',
                ...postDeliveryKeyboard(),
            }
        );
    } catch (err) {
        console.error(`Lỗi gửi tin nhắn cho khách ${order.user_id}:`, err.message);
    }

    // 2. Gửi tin nhắn thông báo cho Admin (bọc try/catch riêng để không ảnh hưởng khách)
    try {
        const db = require('../database');
        const buyer = db.prepare('SELECT full_name, username FROM users WHERE telegram_id = ?').get(order.user_id);
        
        const buyerName = buyer ? buyer.full_name : 'Khách';
        const buyerUsername = (buyer && buyer.username) ? ` (@${buyer.username})` : '';

        const adminMsg = 
            `🔔 <b>CÓ ĐƠN HÀNG MỚI THÀNH CÔNG!</b>\n\n` +
            `👤 Khách: <b>${buyerName}</b>${buyerUsername} (<code>${order.user_id}</code>)\n` +
            `📦 Sản phẩm: <b>${product.name}</b> × ${order.quantity}\n` +
            `💰 Tổng tiền: <b>${formatPrice(order.total_price)}</b>\n` +
            `🆔 Mã đơn: <code>#${order.id}</code>\n\n` +
            `✅ (Hệ thống đã tự động trừ tiền/giao hàng)`;

        await bot.telegram.sendMessage(config.ADMIN_ID, adminMsg, { parse_mode: 'HTML' });
    } catch (err) {
        console.error('Lỗi gửi tin nhắn cho Admin:', err.message);
    }

    return result;
}