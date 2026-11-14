const paymentService = require('../services/paymentService');
const topupService = require('../services/topupService');
const userService = require('../services/userService');
const { formatPrice } = require('../utils/keyboard');

module.exports = (bot) => {
    bot.command('nap', async (ctx) => {
        try {
            const text = ctx.message.text.split(' ');
            if (text.length < 2 || isNaN(text[1])) {
                return ctx.replyWithHTML('💰 Cách dùng: /nap [số tiền]\nVí dụ: /nap 50000');
            }

            const amount = parseInt(text[1]);
            if (amount < 10000) return ctx.reply('❌ Số tiền tối thiểu là 10.000đ');

            // 1. Tạo user
            userService.findOrCreate(ctx.from);
            
            // 2. Tạo mã QR
            const payment = paymentService.generatePayment(amount);
            
            // 3. Lưu Database
            topupService.create(ctx.from.id, amount, payment.paymentCode);

            // 4. Gửi tin nhắn HTML
            const caption = 
                `💰 <b>NẠP SỐ DƯ</b>\n\n` +
                `👉 <a href="${payment.qrUrl}">BẤM VÀO ĐÂY ĐỂ LẤY MÃ QR</a>\n\n` +
                `🏦 Số tiền: <b>${formatPrice(amount)}</b>\n` +
                `📝 Nội dung CK: <code>${payment.paymentCode}</code>`;

            await ctx.replyWithHTML(caption);
            
        } catch (err) {
            console.error('❌ Lỗi /nap:', err);
            ctx.reply(`❌ Lỗi hệ thống: ${err.message}`); // In lỗi ra Telegram nếu có
        }
    });
};