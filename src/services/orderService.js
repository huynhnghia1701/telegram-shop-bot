const db = require('../database');
const productService = require('./productService');

const orderService = {
  create(userId, productId, quantity, totalPrice, paymentCode) {
    const result = db.prepare(`
      INSERT INTO orders (user_id, product_id, quantity, total_price, payment_code, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(userId, productId, quantity, totalPrice, paymentCode);

    return this.getById(result.lastInsertRowid);
  },

  getById(id) {
    return db.prepare(`
      SELECT o.*, p.name as product_name
      FROM orders o
      JOIN products p ON o.product_id = p.id
      WHERE o.id = ?
    `).get(id);
  },

  // FIX LỖI CHÍNH TẠI ĐÂY: Bỏ điều kiện status = 'pending' để tìm được đơn hàng dù nội dung CK có bị ngân hàng sửa đổi
  getPendingBySuffix(suffix) {
    return db.prepare(`
      SELECT * FROM orders 
      WHERE payment_code LIKE ?
      ORDER BY created_at DESC LIMIT 1
    `).get(`%${suffix}%`);
  },

  getByPaymentCode(code) {
    return db.prepare(`
      SELECT o.*, p.name as product_name
      FROM orders o
      JOIN products p ON o.product_id = p.id
      WHERE o.payment_code = ?
    `).get(code);
  },

  getPendingByUser(userId) {
    return db.prepare(`
      SELECT o.*, p.name as product_name
      FROM orders o
      JOIN products p ON o.product_id = p.id
      WHERE o.user_id = ? AND o.status = 'pending'
      ORDER BY o.created_at DESC
    `).all(userId);
  },

  getRecentByUser(userId, limit = 5) {
    return db.prepare(`
      SELECT o.*, p.name as product_name
      FROM orders o
      JOIN products p ON o.product_id = p.id
      WHERE o.user_id = ?
      ORDER BY o.created_at DESC
      LIMIT ?
    `).all(userId, limit);
  },

  confirmAndDeliver(orderId) {
    const order = this.getById(orderId);
    if (!order) return { success: false, error: 'Đơn hàng không tồn tại' };
    
    // Nới lỏng điều kiện: Cho phép giao hàng nếu đơn đang pending hoặc paid
    if (order.status !== 'pending' && order.status !== 'paid') {
      return { success: false, error: 'Đơn hàng đã được xử lý' };
    }

    const stock = productService.getAvailableStock(order.product_id, order.quantity);
    if (stock.length < order.quantity) {
      return { success: false, error: `Không đủ hàng. Chỉ còn ${stock.length} sản phẩm.` };
    }

    const stockIds = stock.map((s) => s.id);
    productService.markSold(stockIds, order.user_id);

    db.prepare(`
      UPDATE orders SET status = 'delivered', paid_at = CURRENT_TIMESTAMP, delivered_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(orderId);

    const accounts = stock.map((s) => s.data);

    return { success: true, accounts, order };
  },

  markPaid(orderId) {
    const order = this.getById(orderId);
    if (!order) return { success: false, error: 'Đơn hàng không tồn tại' };
    if (order.status !== 'pending') return { success: false, error: 'Đơn hàng đã được xử lý' };

    db.prepare(`
      UPDATE orders SET status = 'paid', paid_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(orderId);

    return { success: true, order };
  },

  manualDeliver(orderId) {
    db.prepare(`
      UPDATE orders SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(orderId);
  },

  cancel(orderId) {
    db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ? AND status = 'pending'").run(orderId);
  },

  getAllPending() {
    return db.prepare(`
      SELECT o.*, p.name as product_name, u.full_name as user_name
      FROM orders o
      JOIN products p ON o.product_id = p.id
      JOIN users u ON o.user_id = u.telegram_id
      WHERE o.status = 'pending'
      ORDER BY o.created_at ASC
    `).all();
  },

  getStats() {
    const totalOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'delivered'").get().c;
    const totalRevenue = db.prepare("SELECT COALESCE(SUM(total_price), 0) as s FROM orders WHERE status = 'delivered'").get().s;
    const pendingOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'pending'").get().c;
    const totalStock = db.prepare('SELECT COUNT(*) as c FROM stock WHERE is_sold = 0').get().c;
    const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;

    return { totalOrders, totalRevenue, pendingOrders, totalStock, totalUsers };
  },
};

module.exports = orderService;