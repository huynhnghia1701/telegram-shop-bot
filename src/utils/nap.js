const paymentService = require('../services/paymentService');
const topupService = require('../services/topupService');
const userService = require('../services/userService');
const messages = require('../utils/messages');
const { formatPrice } = require('../utils/keyboard');

module.exports = (bot) => {
    bot.command('nap', (ctx) => {
        const text = ctx.message.text.split(' ');
        if (text.length < 2 || isNaN(text[1])) {
            return ctx.replyWithHTML(
                '💰 <b>NẠP SỐ DƯ</b>\n\n' +
                'Cách dùng: /nap [số tiền]\n' +
                'Ví dụ: /nap 50000\n\n' +
                '💡 Số tiền tối thiểu: 10.000đ'
            );
        }

        const amount = parseInt(text[1]);
        if (amount < 10000) {
            return ctx.reply('❌ Số tiền tối thiểu là 10.000đ');
        }

        userService.findOrCreate(ctx.from);

        const payment = paymentService.generatePayment(amount);
        topupService.create(ctx.from.id, amount, payment.paymentCode);

        // Send QR image
        ctx.replyWithPhoto(payment.qrUrl, {
            caption:
                `💰 <b>NẠP SỐ DƯ</b>\n\n` +
                `Quét mã QR để nạp ${formatPrice(amount)} vào tài khoản.\n\n` +
                `🏦 Quét mã QR để chuyển khoản\n` +
                `├ Số tiền: <b>${formatPrice(amount)}</b>\n` +
                `└ Nội dung CK: <code>${payment.paymentCode}</code>\n\n` +
                `⏳ Sau khi chuyển khoản, số dư sẽ được cập nhật tự động.`,
            parse_mode: 'HTML',
        });
    });
};
