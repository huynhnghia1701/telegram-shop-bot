const orderService = require('../services/orderService');
const productService = require('../services/productService');
const userService = require('../services/userService');
const messages = require('../utils/messages');
const config = require('../config');
const paymentService = require('../services/paymentService');
const { Markup } = require('telegraf');
const { formatPrice, postDeliveryKeyboard } = require('../utils/keyboard');

module.exports = (bot) => {
    // Handle quantity selection: qty_{productId}_{quantity}
    // Xử lý thanh toán bằng số dư
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
        const order = orderService.create(
            ctx.from.id,
            product.id,
            quantity,
            totalPrice,
            'BALANCE_PAY'
        );
        
        // TUYỆT ĐỐI KHÔNG GỌI orderService.markPaid() Ở ĐÂY

        ctx.answerCbQuery('✅ Đã thanh toán bằng số dư!');
        
        ctx.editMessageText(
            `✅ <b>THANH TOÁN THÀNH CÔNG</b>\n\n` +
            `💰 Đã trừ: <b>${formatPrice(totalPrice)}</b>\n` +
            `💵 Số dư còn lại: <b>${formatPrice(user.balance - totalPrice)}</b>\n\n` +
            `📦 Đang giao hàng cho bạn...`,
            { parse_mode: 'HTML' }
        );

        // Giao hàng tự động
        try {
            const result = await deliverOrder(bot, order.id);
            if (!result.success) {
                ctx.reply(`❌ Lỗi giao hàng: ${result.error}`);
            }
        } catch (error) {
            console.error('Lỗi giao hàng:', error);
            ctx.reply('❌ Đã xảy ra lỗi khi giao hàng, vui lòng liên hệ Admin.');
        }
    });

        // Giao hàng tự động (Gọi trực tiếp hàm deliverOrder ở dưới)
        try {
            const result = await deliverOrder(bot, order.id);
            if (!result.success) {
                ctx.reply(`❌ Lỗi giao hàng: ${result.error}`);
            }
        } catch (error) {
            console.error('Lỗi giao hàng:', error);
            ctx.reply('❌ Đã xảy ra lỗi khi giao hàng, vui lòng liên hệ Admin.');
        }
    });

    // Nút thanh toán qua ngân hàng
    bot.action(/^pay_bank_(\d+)_(\d+)$/, async (ctx) => {
        const productId = parseInt(ctx.match[1]);
        const quantity = parseInt(ctx.match[2]);
        const product = productService.getById(productId);
        
        ctx.answerCbQuery('⏳ Đang tạo đơn hàng...');
        const payment = paymentService.generatePayment(product.price * quantity, 0);

        const order = orderService.create(
            ctx.from.id,
            product.id,
            quantity,
            product.price * quantity,
            payment.paymentCode
        );

        const caption =
            `⏳ <b>Đang chờ thanh toán ${formatPrice(product.price * quantity)}...</b>\n\n` +
            `Quét mã QR hoặc bấm vào link dưới đây để chuyển khoản:\n` +
            `👉 <a href="${payment.qrUrl}">BẤM VÀO ĐÂY ĐỂ LẤY MÃ QR</a>\n\n` +
            `💰 <b>THANH TOÁN ĐƠN HÀNG</b>\n\n` +
            `📦 Sản phẩm: ${product.name}\n` +
            `📊 Số lượng: ${quantity}\n` +
            `💵 Tổng tiền: <b>${formatPrice(product.price * quantity)}</b>\n\n` +
            `━━━━━━━━━━━━━━━━━\n\n` +
            `🏦 Quét mã QR để chuyển khoản\n` +
            `├ Số tiền: <b>${formatPrice(product.price * quantity)}</b>\n` +
            `└ Nội dung CK: <code>${payment.paymentCode}</code>\n\n` +
            `⏰ QR hiệu lực trong <b>15 phút</b>\n` +
            `🚫 <b>KHÔNG</b> thay đổi nội dung chuyển khoản`;

        await ctx.replyWithHTML(caption, Markup.inlineKeyboard([
            [Markup.button.callback('❌ Hủy thanh toán', `cancel_order_${order.id}`)],
        ]));
    });

    // User clicks "Đã thanh toán" button
    bot.action(/^check_paid_(\d+)$/, async (ctx) => {
        const orderId = parseInt(ctx.match[1]);
        const order = orderService.getById(orderId);

        if (!order) {
            return ctx.answerCbQuery('❌ Đơn hàng không tồn tại');
        }

        if (order.status === 'delivered') {
            return ctx.answerCbQuery('✅ Đơn hàng đã được giao');
        }

        if (order.status === 'cancelled') {
            return ctx.answerCbQuery('❌ Đơn hàng đã bị hủy');
        }

        ctx.answerCbQuery();
        ctx.replyWithHTML(messages.paymentPending);
    });

    // Data main callback
    bot.action('data_main', (ctx) => {
        ctx.answerCbQuery();
        ctx.reply('📊 Tính năng đang phát triển...');
    });

    // Buy again callback
    bot.action('buy_again', (ctx) => {
        ctx.answerCbQuery();
        const products = productService.getAll();
        const { productListKeyboard } = require('../utils/keyboard');
        ctx.reply(messages.productHeader, productListKeyboard(products));
    });

    // Handle cancel order
    bot.action('cancel_order', (ctx) => {
        ctx.answerCbQuery('❌ Đã hủy');
        ctx.editMessageText('❌ Đơn hàng đã bị hủy.');
    });

    bot.action(/^cancel_order_(\d+)$/, (ctx) => {
        const orderId = parseInt(ctx.match[1]);
        orderService.cancel(orderId);
        ctx.answerCbQuery('❌ Đã hủy đơn hàng');
        ctx.reply('❌ Đơn hàng đã bị hủy.');
    });
};

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

    try {
        // Send success notification
        await bot.telegram.sendMessage(
            order.user_id,
            messages.orderSuccessNotify(order.quantity),
            { parse_mode: 'HTML' }
        );

        // Send account details
        await bot.telegram.sendMessage(
            order.user_id,
            messages.orderSuccess(product, order.quantity, result.accounts),
            {
                parse_mode: 'HTML',
                ...postDeliveryKeyboard(),
            }
        );
    } catch (err) {
        console.error(`Failed to send delivery to ${order.user_id}:`, err.message);
    }

    return result;
}

module.exports.deliverOrder = deliverOrder;