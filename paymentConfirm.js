const orderService = require('../services/orderService');
const productService = require('../services/productService');
const messages = require('../utils/messages');
const { postDeliveryKeyboard } = require('../utils/keyboard');

module.exports = (bot) => {
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

        // For now, show pending message (admin needs to confirm)
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
        // Trigger product listing
        const products = productService.getAll();
        const { productListKeyboard } = require('../utils/keyboard');
        ctx.reply(messages.productHeader, productListKeyboard(products));
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
