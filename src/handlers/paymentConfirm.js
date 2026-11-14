const orderService = require('../services/orderService');
const productService = require('../services/productService');
const messages = require('../utils/messages');
const { postDeliveryKeyboard } = require('../utils/keyboard');

module.exports = (bot) => {
    // User clicks "Đã thanh toán" button
   // Handle quantity selection: qty_{productId}_{quantity}
    bot.action(/^qty_(\d+)_(\d+)$/, async (ctx) => {
        const productId = parseInt(ctx.match[1]);
        const quantity = parseInt(ctx.match[2]);
        const product = productService.getById(productId);

        if (!product) {
            return ctx.answerCbQuery('❌ Sản phẩm không tồn tại');
        }

        // Check stock availability (display_stock includes sheet_stock fallback)
        const availableStock = product.display_stock || product.stock_count;
        if (availableStock < quantity) {
            return ctx.answerCbQuery(`❌ Chỉ còn ${availableStock} sản phẩm`);
        }

        const totalPrice = product.price * quantity;
        
        // Lấy thông tin user để kiểm tra số dư
        const user = userService.get(ctx.from.id);
        
        // Tạo nút bấm
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

        // Tạo đơn hàng (trạng thái đã thanh toán)
        const order = orderService.create(
            ctx.from.id,
            product.id,
            quantity,
            totalPrice,
            'BALANCE_PAY'
        );
        orderService.markPaid(order.id);

        ctx.answerCbQuery('✅ Đã thanh toán bằng số dư!');
        ctx.editMessageText(
            `✅ <b>THANH TOÁN THÀNH CÔNG</b>\n\n` +
            `💰 Đã trừ: <b>${formatPrice(totalPrice)}</b>\n` +
            `💵 Số dư còn lại: <b>${formatPrice(user.balance - totalPrice)}</b>\n\n` +
            `📦 Đang giao hàng cho bạn...`
        );

        // Tự động giao hàng
        const { deliverOrder } = require('./paymentConfirm');
        const result = await deliverOrder(bot, order.id);

        if (!result.success) {
            ctx.reply(`❌ Lỗi giao hàng: ${result.error}`);
        }
    }); {
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
