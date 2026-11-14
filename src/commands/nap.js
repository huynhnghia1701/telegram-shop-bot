const paymentService = require('../services/paymentService');
const topupService = require('../services/topupService');
const userService = require('../services/userService');
const { formatPrice } = require('../utils/keyboard');
const axios = require('axios');

module.exports = (bot) => {
    bot.command('nap', async (ctx) => {
        try {
            const text = ctx.message.text.split(' ');
            if (text.length < 2 || isNaN(text[1])) {
                return ctx.replyWithHTML('💰 Cách dùng: /nap [số tiền]\nVí dụ: /nap 50000');
            }

            const amount = parseInt(text[1]);
            if (amount < 10000) return ctx.reply('❌ Số tiền tối thiểu là 10.000đ');

            userService.findOrCreate(ctx.from);
            const payment = paymentService.generatePayment(amount);
            topupService.create(ctx.from.id, amount, payment.paymentCode);

            const caption = 
                `💰 <b>NẠP SỐ DƯ</b>\n\n` +
                `🏦 Số tiền: <b>${formatPrice(amount)}</b>\n` +
                `📝 Nội dung CK: <code>${payment.paymentCode}</code>\n\n` +
                `⏳ Sau khi chuyển khoản, số dư sẽ được cập nhật tự động.`;

            try {
                // Tải ảnh QR từ VietQR về dưới dạng Buffer (Mã nhị phân)
                const response = await axios.get(payment.qrUrl, { responseType: 'arraybuffer' });
                const imageBuffer = Buffer.from(response.data, 'binary');

                // Gửi ảnh từ Buffer (Telegram sẽ nhận ngay lập tức, không cần chờ mạng)
                // Chỉ gửi dạng HTML kèm link QR
            await ctx.replyWithHTML(
                caption + `\n👉 <a href="${payment.qrUrl}">BẤM VÀO ĐÂY ĐỂ LẤY MÃ QR</a>`
            );
            } catch (imgError) {
                // Nếu VietQR sập hoàn toàn, gửi link dự phòng
                console.error('Không tải được ảnh QR:', imgError.message);
                await ctx.replyWithHTML(caption + `\n👉 <a href="${payment.qrUrl}">BẤM VÀO ĐÂY ĐỂ LẤY MÃ QR</a>`);
            }
            
        } catch (err) {
            console.error('❌ Lỗi /nap:', err);
            ctx.reply(`❌ Lỗi hệ thống: ${err.message}`); 
        }
    });
};