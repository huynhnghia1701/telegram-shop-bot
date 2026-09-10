const orderService = require('../services/orderService');
const messages = require('../utils/messages');

module.exports = (bot) => {
    bot.command('checkpay', (ctx) => {
        const orders = orderService.getRecentByUser(ctx.from.id, 5);

        if (orders.length === 0) {
            return ctx.reply('📋 Bạn chưa có đơn hàng nào.');
        }

        let text = '🔍 <b>ĐƠN HÀNG GẦN ĐÂY</b>\n\n';
        orders.forEach((order) => {
            text += messages.checkPayStatus(order) + '\n\n━━━━━━━━━━━━━━━━━\n\n';
        });

        ctx.replyWithHTML(text);
    });
};
