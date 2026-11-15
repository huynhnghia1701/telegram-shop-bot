const express = require('express');
const config = require('./config');
const topupService = require('./services/topupService');
const orderService = require('./services/orderService');
const userService = require('./services/userService');
const { formatPrice } = require('./utils/keyboard');

function extractPaymentSuffix(content) {
    if (!content) return null;
    const cleanContent = content.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const match = cleanContent.match(/PAY([A-Z0-9]{6})/);
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
                return;
            }

            // 2. Xử lý MUA HÀNG (Order) - Phần này đang bị thiếu hoặc lỗi
            const order = orderService.getPendingBySuffix(suffix);
            console.log('👉 Kết quả tìm Order trong DB:', order);

            if (order) {
                if (amount < order.total_price) {
                    console.warn(`⚠️ Order #${order.id}: số tiền chuyển (${amount}) < giá trị đơn (${order.total_price})`);
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

                console.log(`✅ Order #${order.id} đã được xác nhận thanh toán qua SePay`);
                return;
            }

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