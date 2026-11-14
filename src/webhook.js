const express = require('express');
const config = require('./config');
const topupService = require('./services/topupService');
const orderService = require('./services/orderService');
const userService = require('./services/userService');
const { formatPrice } = require('./utils/keyboard');

function extractPaymentSuffix(content) {
    if (!content) return null;
    
    // 1. Chuyển sang in hoa và xóa mọi dấu cách, dấu gạch ngang
    const cleanContent = content.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    // 2. Tìm chữ PAY, theo sau là đúng 6 ký tự chữ/số
    const match = cleanContent.match(/PAY([A-Z0-9]{6})/);
    
    // 3. Trả về 6 ký tự đó (VD: PAYAZOP2Y -> AZOP2Y)
    return match ? match[1] : null;
}

function setupWebhook(bot) {
    const app = express();
    app.use(express.json());

    async function processTransaction(data) {
        try {
            console.log('📩 SePay transaction:', JSON.stringify(data));

            if (data.transferType !== 'in') return;

            const amount = Number(data.transferAmount) || 0;
            const content = data.content || data.description || '';
            const suffix = extractPaymentSuffix(content);

            console.log('👉 Mã tìm kiếm (Suffix):', suffix);

            if (!suffix) {
                console.warn('⚠️ Không tìm thấy mã thanh toán trong nội dung CK:', content);
                return;
            }

            // 1. Xử lý NẠP TIỀN (Topup)
            const topup = topupService.getPendingBySuffix(suffix);
            console.log('👉 Kết quả tìm Topup trong DB:', topup);

            if (topup) {
                if (amount < topup.amount) {
                    console.warn(`⚠️ Topup #${topup.id}: số tiền chuyển (${amount}) < số tiền yêu cầu (${topup.amount})`);
                    return;
                }

                userService.addBalance(topup.telegram_id, topup.amount);
                topupService.markPaid(topup.id);
                console.log('✅ Đã cộng tiền vào Database');

                // Lấy thông tin user để báo số dư
                const user = userService.get(topup.telegram_id);
                
                try {
                    await bot.telegram.sendMessage(
                        topup.telegram_id,
                        `✅ <b>NẠP TIỀN THÀNH CÔNG</b>\n\n` +
                        `💰 Đã cộng: <b>${formatPrice(topup.amount)}</b>\n` +
                        `💳 Số dư hiện tại: <b>${formatPrice(user.balance)}</b>`,
                        { parse_mode: 'HTML' }
                    );
                    console.log('✅ Đã gửi thông báo Telegram cho khách');
                } catch (err) {
                    console.error('❌ Không gửi được thông báo nạp tiền:', err.message);
                }
                return; // Dừng xử lý sau khi xong nạp tiền
            }

            // 2. Xử lý MUA HÀNG (Order) - Tạm khóa vì orderService chưa có hàm getPendingBySuffix
            /* 
            const order = orderService.getPendingBySuffix(suffix);
            if (order) {
                if (amount < order.total_price) {
                    console.warn(`⚠️  Order #${order.id}: số tiền chuyển (${amount}) < giá trị đơn (${order.total_price})`);
                    return;
                }
                const { deliverOrder } = require('./handlers/paymentConfirm');
                const result = await deliverOrder(bot, order.id);

                if (!result.success) {
                    orderService.markPaid(order.id);
                    try {
                        await bot.telegram.sendMessage(
                            config.ADMIN_ID,
                            `💳 Đơn #${order.id} đã thanh toán qua SePay nhưng KHÔNG đủ hàng để giao tự động.\n` +
                            `Vui lòng /confirm ${order.id} và giao thủ công.`
                        );
                    } catch (err) {
                        console.error('Không gửi được thông báo cho admin:', err.message);
                    }
                }
                return;
            }
            */

            console.warn(`⚠️ Không tìm thấy đơn hàng/nạp tiền nào khớp mã: ${suffix}`);
        } catch (err) {
            console.error('❌ Lỗi xử lý transaction SePay:', err); 
        }
    }

    app.post('/webhook/sepay', (req, res) => {
        if (config.SEPAY_API_KEY) {
            const authHeader = req.headers['authorization'] || '';
            const token = authHeader.replace(/^Apikey\s+/i, '').replace(/^Bearer\s+/i, '').trim();
            if (token !== config.SEPAY_API_KEY) {
                return res.status(401).json({ success: false });
            }
        }
        res.status(200).json({ success: true });
        processTransaction(req.body || {});
    });

    app.get('/ping', (req, res) => res.json({ ok: true }));

    const PORT = process.env.PORT || config.WEBHOOK_PORT;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🌐 Webhook server đang lắng nghe tại port ${PORT}`);
    });
}

module.exports = setupWebhook;