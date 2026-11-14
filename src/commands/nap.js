const paymentService = require('../services/paymentService');
const topupService = require('../services/topupService');
const userService = require('../services/userService');
const { formatPrice } = require('../utils/keyboard');
const axios = require('axios'); // Cần dùng thư viện axios để tải ảnh

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

            // 4. Nội dung tin nhắn (Caption)
            const caption = 
                `💰 <b>NẠP SỐ DƯ</b>\n\n` +
                `Quét mã QR phía trên để chuyển khoản.\n\n` +
                `🏦 Số tiền: <b>${formatPrice(amount)}</b>\n` +
                `📝 Nội dung CK: <code>${payment.paymentCode}</code>\n\n` +
                `⏳ Sau khi chuyển khoản, số dư sẽ được cập nhật tự động.`;

            // 5. Tải ảnh QR về và gửi (Tránh lỗi 400)
            try {
                const response = await axios.get(payment.qrUrl, { responseType: 'arraybuffer' });
                const imageBuffer = Buffer.from(response.data, 'binary');

               // Gửi ảnh trực tiếp bằng URL có sẵn của Telegram
            await ctx.replyWithPhoto(payment.qrUrl, {
                caption: caption,
                parse_mode: 'HTML'
            });
            } catch (imgError) {
                // Nếu tải ảnh lỗi, tự động fallback gửi link
                console.error('Lỗi tải ảnh QR, chuyển sang gửi link:', imgError.message);
                await ctx.replyWithHTML(caption + `\n👉 <a href="${payment.qrUrl}">BẤM VÀO ĐÂY ĐỂ LẤY MÃ QR</a>`);
            }
            
        } catch (err) {
            console.error('❌ Lỗi /nap:', err);
            ctx.reply(`❌ Lỗi hệ thống: ${err.message}`); 
        }
    });
};