const db = require('../database');
const productService = require('./productService');

const orderService = {
  /**
   * Create a new order
   */
  create(userId, productId, quantity, totalPrice, paymentCode) {
    const result = db.prepare(`
      INSERT INTO orders (user_id, product_id, quantity, total_price, payment_code, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(userId, productId, quantity, totalPrice, paymentCode);

    return this.getById(result.lastInsertRowid);
  },

  /**
   * Get order by ID
   */
  getById(id) {
    return db.prepare(`
      SELECT o.*, p.name as product_name
      FROM orders o
      JOIN products p ON o.product_id = p.id
      WHERE o.id = ?
    `).get(id);
  },

  /**
   * Get order by payment code
   */
  getByPaymentCode(code) {
    return db.prepare(`
      SELECT o.*, p.name as product_name
      FROM orders o
      JOIN products p ON o.product_id = p.id
      WHERE o.payment_code = ?
    `).get(code);
  },

  /**
   * Find a PENDING order whose payment_code contains the given suffix
   * (used because bank transfer content may mangle spaces/hyphens)
   */
  getPendingBySuffix(suffix) {
    return db.prepare(`
      SELECT o.*, p.name as product_name
      FROM orders o
      JOIN products p ON o.product_id = p.id
      WHERE o.status = 'pending' AND o.payment_code LIKE ?
      ORDER BY o.created_at DESC
      LIMIT 1
    `).get(`%${suffix}%`);
  },

  /**
   * Get user's pending orders
   */
  getPendingByUser(userId) {
    return db.prepare(`
      SELECT o.*, p.name as product_name
      FROM orders o
      JOIN products p ON o.product_id = p.id
      WHERE o.user_id = ? AND o.status = 'pending'
      ORDER BY o.created_at DESC
    `).all(userId);
  },

  /**
   * Get user's recent orders
   */
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

  /**
   * Confirm payment and deliver products
   * Returns { success, accounts, error }
   */
  confirmAndDeliver(orderId) {
    const order = this.getById(orderId);
    if (!order) return { success: false, error: 'Đơn hàng không tồn tại' };
    if (order.status !== 'pending') return { success: false, error: 'Đơn hàng đã được xử lý' };

    // Get available stock
    const stock = productService.getAvailableStock(order.product_id, order.quantity);
    if (stock.length < order.quantity) {
      return { success: false, error: `Không đủ hàng. Chỉ còn ${stock.length} sản phẩm.` };
    }

    // Mark stock as sold
    const stockIds = stock.map((s) => s.id);
    productService.markSold(stockIds, order.user_id);

    // Update order status
    db.prepare(`
      UPDATE orders SET status = 'delivered', paid_at = CURRENT_TIMESTAMP, delivered_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(orderId);

    // Get account data
    const accounts = stock.map((s) => s.data);

    return { success: true, accounts, order };
  },

  /**
   * Mark order as paid (waiting for admin to provide account info)
   */
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

  /**
   * Manual deliver: admin provides account data as text
   */
  manualDeliver(orderId) {
    db.prepare(`
      UPDATE orders SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(orderId);
  },

  /**
   * Cancel order
   */
  cancel(orderId) {
    db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ? AND status = 'pending'").run(orderId);
  },

  /**
   * Get all pending orders (for admin)
   */
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

  /**
   * Get stats
   */
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
