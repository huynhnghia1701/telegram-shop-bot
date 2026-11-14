const productService = require('../services/productService');
const orderService = require('../services/orderService');
const paymentService = require('../services/paymentService');
const userService = require('../services/userService');
const messages = require('../utils/messages');
const config = require('../config');
const { Markup } = require('telegraf');
const { formatPrice } = require('../utils/keyboard');

module.exports = (bot) => {
    // Handle quantity selection: qty_{productId}_{quantity}
    bot.action(/^qty_(\d+)_(\d+)$/, async (ctx) => {
        const productId = parseInt(ctx.match[1]);
        const quantity = parseInt(ctx.match[2]);
        const product = productService.getById(productId);

        if (!product) {
            return ctx.answerCbQuery('❌ Sản phẩm không tồn tại');
        }

        const availableStock = product.display_stock || product.stock_count;
        if (availableStock < quantity) {
            return ctx.answerCbQuery(`❌ Chỉ còn ${availableStock} sản phẩm`);
        }

        const totalPrice = product.price * quantity;
        
        // Đảm bảo user đã tồn tại trong DB để lấy số dư
        userService.findOrCreate(ctx.from);
        const user = userService.get(ctx.from.id);
        
        const buttons = [];
        
        // Nếu khách có đủ tiền, hiện nút "Thanh toán bằng số dư"
        if (user && user.balance >= totalPrice) {
            buttons.push([Markup.button.callback(`💰 Thanh toán bằng số dư (${formatPrice(user.balance)})`, `pay_balance_${productId}_${quantity}`)]);
        }
        
        // Nút thanh toán qua ngân hàng (chuyển khoản)
        buttons.push([Markup.button.callback('🏦 Thanh toán qua ngân hàng', `pay_bank_${productId}_${quantity}`)]);
        buttons.push([Markup.button.callback('❌ Hủy', 'cancel_order')]);

        ctx.replyWithHTML(
            `📦 <b>${product.name}</b>\n` +
            `📊 Số lượng: ${quantity}\n` +
            `💵 Tổng tiền: <b>${formatPrice(totalPrice)}</b>\n\n` +
            `💰 Số dư của bạn: <b>${formatPrice(user ? user.balance : 0)}</b>\n\n` +
            `👇 Chọn phương thức thanh toán:`,
            Markup.inlineKeyboard(buttons)
        );
    });

    // Xử lý thanh toán bằng số dư
    bot.action(/^pay_balance_(\d+)_(\d+)$/, async (ctx) => {
        const productId = parseInt(ctx.match[1]);
        const quantity = parseInt(ctx.match[2]);
        const product = productService.getById(productId);
        const totalPrice = product.price * quantity;

        const user = userService.get(ctx.from.id);

        if (user.balance < totalPrice) {
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
        
        // Đánh dấu đã thanh toán luôn
        orderService.markPaid(order.id);

        ctx.answerCbQuery('✅ Đã thanh toán bằng số dư!');
        ctx.editMessageText(
            `✅ <b>THANH TOÁN THÀNH CÔNG</b>\n\n` +
            `💰 Đã trừ: <b>${formatPrice(totalPrice)}</b>\n` +
            `💵 Số dư còn lại: <b>${formatPrice(user.balance - totalPrice)}</b>\n\n` +
            `📦 Đang giao hàng cho bạn...`
        );

        // Giao hàng tự động
        const { deliverOrder } = require('./paymentConfirm');
        const result = await deliverOrder(bot, order.id);

        if (!result.success) {
            ctx.reply(`❌ Lỗi giao hàng: ${result.error}`);
        }
    });

    // Xử lý thanh toán qua ngân hàng (nút bấm mới)
    bot.action(/^pay_bank_(\d+)_(\d+)$/, async (ctx) => {
        const productId = parseInt(ctx.match[1]);
        const quantity = parseInt(ctx.match[2]);
        const product = productService.getById(productId);
        
        ctx.answerCbQuery('⏳ Đang tạo đơn hàng...');
        await createOrderAndPay(ctx, bot, product, quantity, 0);
    });

    // ════════════════════════════════════
    // Shared: Create order + send QR + notify admin
    // ════════════════════════════════════
    async function createOrderAndPay(ctx, bot, product, quantity, bankIndex) {
        try {
            userService.findOrCreate(ctx.from);
        } catch (err) {
            console.error('❌ Lỗi tạo user:', err.message);
            return ctx.reply('❌ Có lỗi xảy ra khi tạo tài khoản. Vui lòng thử lại sau.');
        }

        const totalPrice = product.price * quantity;
        const payment = paymentService.generatePayment(totalPrice, bankIndex);

        const order = orderService.create(
            ctx.from.id,
            product.id,
            quantity,
            totalPrice,
            payment.paymentCode
        );

        const caption =
            `⏳ <b>Đang chờ thanh toán ${formatPrice(totalPrice)}...</b>\n\n` +
            `Quét mã QR hoặc bấm vào link dưới đây để chuyển khoản:\n` +
            `👉 <a href="${payment.qrUrl}">BẤM VÀO ĐÂY ĐỂ LẤY MÃ QR</a>\n\n` +
            `💰 <b>THANH TOÁN ĐƠN HÀNG</b>\n\n` +
            `📦 Sản phẩm: ${product.name}\n` +
            `📊 Số lượng: ${quantity}\n` +
            `💵 Tổng tiền: <b>${formatPrice(totalPrice)}</b>\n\n` +
            `━━━━━━━━━━━━━━━━━\n\n` +
            `🏦 Quét mã QR để chuyển khoản\n` +
            `├ Số tiền: <b>${formatPrice(totalPrice)}</b>\n` +
            `└ Nội dung CK: <code>${payment.paymentCode}</code>\n\n` +
            `⏰ QR hiệu lực trong <b>15 phút</b>\n` +
            `🚫 <b>KHÔNG</b> thay đổi nội dung chuyển khoản\n` +
            `✅ Sau khi CK thành công, hàng sẽ được giao <b>tự động</b> trong vòng dưới 60 giây`;

        await ctx.replyWithHTML(caption, Markup.inlineKeyboard([
            [Markup.button.callback('❌ Hủy thanh toán', `cancel_order_${order.id}`)],
        ]));

        const userName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ');
        const adminMsg =
            `🔔 <b>ĐƠN HÀNG MỚI #${order.id}</b>\n\n` +
            `👤 Khách: <b>${userName}</b> (<code>${ctx.from.id}</code>)\n` +
            (ctx.from.username ? `📱 @${ctx.from.username}\n` : '') +
            `\n` +
            `📦 Sản phẩm: <b>${product.name}</b>\n` +
            `📊 Số lượng: ${quantity}\n` +
            `💰 Tổng tiền: <b>${formatPrice(totalPrice)}</b>\n` +
            `🏦 Bank: <b>${payment.bankName}</b>\n` +
            `🔑 Mã CK: <code>${payment.paymentCode}</code>\n\n` +
            `━━━━━━━━━━━━━━━━━\n` +
            `✅ Xác nhận & giao hàng:\n` +
            `<code>/confirm ${order.id}</code>`;

        try {
            await bot.telegram.sendMessage(config.ADMIN_ID, adminMsg, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback(`✅ Xác nhận #${order.id}`, `admin_confirm_${order.id}`),
                        Markup.button.callback(`❌ Hủy #${order.id}`, `admin_cancel_${order.id}`),
                    ],
                ]),
            });
        } catch (err) {
            console.error('Failed to notify admin:', err.message);
        }
    }

    // ════════════════════════════════════
    // Admin quick-action buttons on order notification
    // ════════════════════════════════════
    bot.action(/^admin_confirm_(\d+)$/, async (ctx) => {
        if (ctx.from.id !== config.ADMIN_ID) return ctx.answerCbQuery('⛔');

        const orderId = parseInt(ctx.match[1]);
        const order = orderService.getById(orderId);
        if (!order) return ctx.answerCbQuery('❌ Đơn hàng không tồn tại');
        if (order.status !== 'pending') return ctx.answerCbQuery('⚠️ Đơn đã xử lý');

        const product = productService.getById(order.product_id);
        const realStock = productService.getAvailableStock(order.product_id, order.quantity);

        if (realStock.length >= order.quantity) {
            ctx.answerCbQuery('⏳ Đang xử lý...');
            const { deliverOrder } = require('./paymentConfirm');
            const result = await deliverOrder(bot, orderId);

            if (result.success) {
                ctx.editMessageText(
                    ctx.callbackQuery.message.text + '\n\n✅ ĐÃ XÁC NHẬN & GIAO HÀNG TỰ ĐỘNG!',
                    { parse_mode: 'HTML' }
                );
            } else {
                ctx.reply(`❌ Lỗi đơn #${orderId}: ${result.error}`);
            }
        } else {
            ctx.answerCbQuery('📝 Cần cung cấp tài khoản...');
            orderService.markPaid(orderId);

            const { setAdminState } = require('./adminActions');
            setAdminState(ctx.from.id, {
                action: 'deliver_order',
                orderId: orderId,
                userId: order.user_id,
                productName: product.name,
                quantity: order.quantity,
            });

            ctx.editMessageText(
                ctx.callbackQuery.message.text + '\n\n💳 ĐÃ XÁC NHẬN THANH TOÁN',
                { parse_mode: 'HTML' }
            );

            ctx.replyWithHTML(
                `📝 <b>GIAO HÀNG THỦ CÔNG — Đơn #${orderId}</b>\n\n` +
                `📦 SP: <b>${product.name}</b>\n` +
                `📊 SL: ${order.quantity}\n\n` +
                `👇 Gửi thông tin tài khoản ngay bây giờ:\n\n` +
                `<i>Ví dụ:</i>\n` +
                `<code>email@outlook.com|passmail|passchatgpt</code>\n\n` +
                `Bot sẽ tự động chuyển cho khách.\n` +
                `Gõ /cancel để hủy.`
            );
        }
    });

    bot.action(/^admin_cancel_(\d+)$/, (ctx) => {
        if (ctx.from.id !== config.ADMIN_ID) return ctx.answerCbQuery('⛔');

        const orderId = parseInt(ctx.match[1]);
        orderService.cancel(orderId);
        ctx.answerCbQuery('❌ Đã hủy');
        ctx.editMessageText(
            ctx.callbackQuery.message.text + '\n\n❌ ĐÃ HỦY ĐƠN HÀNG',
            { parse_mode: 'HTML' }
        );

        const order = orderService.getById(orderId);
        if (order) {
            bot.telegram.sendMessage(order.user_id, '❌ Đơn hàng của bạn đã bị hủy. Liên hệ hỗ trợ nếu cần.').catch(() => { });
        }
    });

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