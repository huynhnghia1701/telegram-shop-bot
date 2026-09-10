const db = require('../database');

const productService = {
    /**
     * Get all active products with stock count
     */
    getAll() {
        return db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0) as stock_count,
        CASE
          WHEN (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0) > 0
          THEN (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0)
          ELSE COALESCE(p.sheet_stock, 0)
        END as display_stock
      FROM products p
      WHERE p.is_active = 1
      ORDER BY p.category_id, p.id
    `).all();
    },

    /**
     * Get single product with stock count
     */
    getById(id) {
        return db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0) as stock_count,
        CASE
          WHEN (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0) > 0
          THEN (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0)
          ELSE COALESCE(p.sheet_stock, 0)
        END as display_stock
      FROM products p
      WHERE p.id = ?
    `).get(id);
    },

    /**
     * Get products by category
     */
    getByCategory(categoryId) {
        return db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0) as stock_count
      FROM products p
      WHERE p.category_id = ? AND p.is_active = 1
      ORDER BY p.id
    `).all(categoryId);
    },

    /**
     * Get all categories
     */
    getCategories() {
        return db.prepare('SELECT * FROM categories ORDER BY sort_order').all();
    },

    /**
     * Add stock items for a product
     */
    addStock(productId, dataLines) {
        const insert = db.prepare('INSERT INTO stock (product_id, data) VALUES (?, ?)');
        const insertMany = db.transaction((lines) => {
            for (const line of lines) {
                if (line.trim()) {
                    insert.run(productId, line.trim());
                }
            }
        });
        insertMany(dataLines);
    },

    /**
     * Get available stock for a product
     */
    getAvailableStock(productId, quantity) {
        return db.prepare(
            'SELECT * FROM stock WHERE product_id = ? AND is_sold = 0 LIMIT ?'
        ).all(productId, quantity);
    },

    /**
     * Mark stock as sold
     */
    markSold(stockIds, userId) {
        const update = db.prepare(
            'UPDATE stock SET is_sold = 1, sold_to = ?, sold_at = CURRENT_TIMESTAMP WHERE id = ?'
        );
        const updateMany = db.transaction((ids) => {
            for (const id of ids) {
                update.run(userId, id);
            }
        });
        updateMany(stockIds);
    },

    /**
     * Add a new product
     */
    addProduct(categoryId, name, price, emoji = '📦', promotion = null, contactOnly = false) {
        const result = db.prepare(
            'INSERT INTO products (category_id, name, price, emoji, promotion, contact_only) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(categoryId, name, price, emoji, promotion, contactOnly ? 1 : 0);
        return result.lastInsertRowid;
    },
};

module.exports = productService;
