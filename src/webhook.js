const express = require('express');
const config = require('./config');
const topupService = require('./services/topupService');
const orderService = require('./services/orderService');
const userService = require('./services/userService');
const { formatPrice } = require('./utils/keyboard');

/**
 * Extract the 6-char payment suffix (e.g. "AB12CD") from a bank transfer
 * content string. Banks often strip spaces/hyphens or change casing,
 * so we search loosely for "PAY" followed by 6 alphanumeric characters.
 */
function extractPaymentSuffix(content) {
    if (!content) return null;
    const match = content.toUpperCase().match(/PAY[-\s]?([A-Z0-9]{6})/);
    return match ? match[1] : null;
}

function setupWebhook(bot) {
    const app = express();
    app.use(express.json());

    /**
     * Process a SePay transaction in the background.
     * Runs AFTER the HTTP response has already been sent, so SePay
     * never waits on Telegram API calls or DB writes.
     */
    async function processTransaction(data) {
        try {
            console.log('📩 SePay transaction:', JSON.stringify(data));

            // Only process incoming money
            if (data.transferType !== 'in') return;

            const amount = Number(data.transferAmount) || 0;
            const content = data.content || data.description || '';
            const suffix = extractPaymentSuffix(content);

            if (!suffix) {
                console.warn('⚠️  Không tìm thấy mã thanh toán trong nội dung CK:', content);
                return;
            }

            // 1. Try match a pending TOPUP (nạp số dư) first
            const topup = topupService.getPendingBySuffix(suffix);
            if (topup) {
                if (amount < topup.amount) {
                    console.warn(`⚠️  Topup #${topup.id}: số tiền chuyển (${amount}) < số tiền yêu cầu (${topup.amount})`);
                    return;
                }

                userService.addBalance(topup.telegram_id, topup.amount);
                topupService.markPaid(topup.id);

                const user = userService.get(topup.telegram_id);
                try {
                    await bot.telegram.sendMessage(
                        topup.telegram_id,
                        `✅ <b>NẠP TIỀN THÀNH CÔNG</b>\n\n` +
                        `💰 Đã cộng: <b>${formatPrice(topup.amount)}</b>\n` +
                        `💳 Số dư hiện tại: <b>${formatPrice(user.balance)}</b>`,
                        { parse_mode: 'HTML' }
                    );
                } catch (err) {
                    console.error('Không gửi được thông báo nạp tiền:', err.message);
                }

                console.log(`✅ Topup #${topup.id} đã cộng ${amount}đ cho user ${topup.telegram_id}`);
                return;
            }

            // 2. Otherwise try match a pending ORDER (mua sản phẩm)
            const order = orderService.getPendingBySuffix(suffix);
            if (order) {
                if (amount < order.total_price) {
                    console.warn(`⚠️  Order #${order.id}: số tiền chuyển (${amount}) < giá trị đơn (${order.total_price})`);
                    return;
                }

                const { deliverOrder } = require('./handlers/paymentConfirm');
                const result = await deliverOrder(bot, order.id);

                if (!result.success) {
                    // No stock available for auto-delivery → mark paid, notify admin for manual delivery
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

            // 3. No match found
            console.warn(`⚠️  Không tìm thấy đơn hàng/nạp tiền nào khớp mã: ${suffix}`);
        } catch (err) {
            console.error('❌ Lỗi xử lý transaction SePay:', err);
        }
    }

    app.post('/webhook/sepay', (req, res) => {
        // 1. Verify SePay API Key (set the same key in SePay dashboard → Webhook → Authentication)
        if (config.SEPAY_API_KEY) {
            const authHeader = req.headers['authorization'] || '';
            const token = authHeader.replace(/^Apikey\s+/i, '').replace(/^Bearer\s+/i, '').trim();
            if (token !== config.SEPAY_API_KEY) {
                console.warn('⚠️  SePay webhook: sai API key, từ chối request');
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }
        }

        // 2. Respond 200 IMMEDIATELY (SePay expects fast ack, retries on timeout)
        res.status(200).json({ success: true });

        // 3. Process the transaction in the background — doesn't block the response
        processTransaction(req.body || {});
    });

    // Simple health check endpoint (useful for uptime pings)
    app.get('/ping', (req, res) => res.json({ ok: true }));

    app.listen(config.WEBHOOK_PORT, () => {
        console.log(`🌐 Webhook server đang lắng nghe tại port ${config.WEBHOOK_PORT}`);
        console.log(`🔗 SePay webhook URL: http://<your-domain>:${config.WEBHOOK_PORT}/webhook/sepay`);
    });
}

module.exports = setupWebhook;
