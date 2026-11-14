const config = require('../config');
const { formatPrice } = require('./keyboard');

const SHOP = config.SHOP_NAME;

const messages = {
    welcome: (name) =>
        `👋 Chào mừng <b>${name}</b> đến với <b>${SHOP}</b>!\n\n` +
        `🛒 Chuyên cung cấp tài khoản giá rẻ\n\n` +
        `📋 <b>Danh sách lệnh:</b>\n` +
        `/start — 🔄 Bắt đầu / Khởi động lại\n` +
        `/menu — 👤 Thông tin tài khoản\n` +
        `/product — 📦 Danh sách sản phẩm\n` +
        `/nap — 💰 Nạp số dư\n` +
        `/checkpay — 🔍 Kiểm tra thanh toán\n` +
        `/support — 🆘 Hỗ trợ\n` +
        `/myid — 🆔 Lấy ID của bạn`,

    accountInfo: (user) =>
        `👤 <b>Thông tin tài khoản</b>\n\n` +
        `🆔 ID: <code>${user.telegram_id}</code>\n` +
        `👤 Tên: ${user.full_name}\n` +
        `💰 Số dư: <b>${formatPrice(user.balance)}</b>\n` +
        `📅 Tham gia: ${user.created_at}`,

    productHeader:
        '👇 👇 👇  Chọn sản phẩm bạn muốn mua bên dưới:',

    selectQuantity: (product) =>
        `📦 <b>${product.name}</b>\n` +
        `💰 Giá: ${formatPrice(product.price)}/cái\n` +
        `📊 Còn lại: ${product.display_stock || product.stock_count} sản phẩm\n\n` +
        `Chọn số lượng muốn mua:`,

    contactOnly: (product) =>
        `📦 <b>${product.name}</b>\n\n` +
        `💰 Giá: ${formatPrice(product.price)}\n` +
        (product.promotion ? `📋 ${product.promotion}\n` : '') +
        `Liên hệ mua ở phía dưới để mình nâng nha các tình yêu\n\n` +
        `💬 Sản phẩm này cần liên hệ trực tiếp để mua.\n` +
        `Bấm nút bên dưới để xem thông tin liên hệ.`,

    paymentQR: (order, product, paymentCode) =>
        `⏳ <b>Đang chờ thanh toán ${formatPrice(order.total_price)}...</b>\n\n` +
        `Quét mã QR phía trên để chuyển khoản.\n\n` +
        `💰 <b>THANH TOÁN ĐƠN HÀNG</b>\n\n` +
        `📦 Sản phẩm: ${product.name}\n` +
        `📊 Số lượng: ${order.quantity}\n` +
        `💵 Tổng tiền: <b>${formatPrice(order.total_price)}</b>\n\n` +
        `━━━━━━━━━━━━━━━━━\n\n` +
        `🏦 Quét mã QR để chuyển khoản\n` +
        `├ Số tiền: <b>${formatPrice(order.total_price)}</b>\n` +
        `└ Nội dung CK: <code>${paymentCode}</code>`,

    orderSuccess: (product, quantity, accounts) => {
        let msg =
            `✅ <b>ĐƠN HÀNG THÀNH CÔNG!</b>\n\n` +
            `📦 ${product.name} × ${quantity}\n\n` +
            `🔑 <b>Thông tin tài khoản:</b>\n`;

        accounts.forEach((acc, i) => {
            msg += `${i + 1})\n<code>${acc}</code>\n`;
        });

        msg += `\n📖 <b>Hướng dẫn:</b> Khi Mua Nhớ Ghi Lại Số Điện Thoại | Liên Hệ Admin Để Lấy Code Đăng Nhập \n` ;

        return msg;
    },

    orderSuccessNotify: (quantity) =>
        `✅ Đã mua thành công ${quantity} tài khoản! Kiểm tra tin nhắn bên dưới.`,

    noStock:
        '❌ Rất tiếc, sản phẩm đã hết hàng. Vui lòng thử lại sau.',

    invalidQuantity: (available) =>
        `❌ Không đủ hàng. Hiện chỉ còn ${available} sản phẩm.`,

    napInfo: (amount, paymentCode) =>
        `💰 <b>NẠP SỐ DƯ</b>\n\n` +
        `Quét mã QR để nạp ${formatPrice(amount)} vào tài khoản.\n\n` +
        `🏦 Quét mã QR để chuyển khoản\n` +
        `├ Số tiền: <b>${formatPrice(amount)}</b>\n` +
        `└ Nội dung CK: <code>${paymentCode}</code>`,

    checkPayStatus: (order) => {
        const statusMap = {
            pending: '⏳ Đang chờ thanh toán',
            paid: '💵 Đã thanh toán',
            delivered: '✅ Đã giao hàng',
            cancelled: '❌ Đã hủy',
        };
        return (
            `🔍 <b>Trạng thái đơn hàng #${order.id}</b>\n\n` +
            `📦 Sản phẩm: ${order.product_name}\n` +
            `📊 Số lượng: ${order.quantity}\n` +
            `💵 Tổng tiền: ${formatPrice(order.total_price)}\n` +
            `📋 Trạng thái: ${statusMap[order.status] || order.status}\n` +
            `📅 Ngày tạo: ${order.created_at}`
        );
    },

    supportInfo:
        `🆘 <b>HỖ TRỢ</b>\n\n` +
        `Nếu bạn gặp vấn đề, liên hệ:\n` +
        `👉 ${config.SUPPORT_CONTACT}\n\n` +
        `⏰ Hỗ trợ 24/7`,

    myId: (id) =>
        `🆔 <b>Telegram ID của bạn:</b>\n<code>${id}</code>`,

    adminOnly: '⛔ Bạn không có quyền sử dụng lệnh này.',

    orderCancelled: '❌ Đơn hàng đã bị hủy.',

    paymentPending:
        '⏳ Chưa nhận được thanh toán. Vui lòng chờ hoặc liên hệ hỗ trợ.',
};

module.exports = messages;
