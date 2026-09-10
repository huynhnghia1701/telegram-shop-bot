const db = require('../database');

const topupService = {
    /**
     * Create a pending topup request
     */
    create(telegramId, amount, paymentCode) {
        const result = db.prepare(`
      INSERT INTO topups (telegram_id, amount, payment_code, status)
      VALUES (?, ?, ?, 'pending')
    `).run(telegramId, amount, paymentCode);

        return this.getById(result.lastInsertRowid);
    },

    getById(id) {
        return db.prepare('SELECT * FROM topups WHERE id = ?').get(id);
    },

    getByCode(code) {
        return db.prepare('SELECT * FROM topups WHERE payment_code = ?').get(code);
    },

    /**
     * Find a PENDING topup whose payment_code contains the given suffix
     * (used because bank transfer content may mangle spaces/hyphens)
     */
    getPendingBySuffix(suffix) {
        return db.prepare(`
      SELECT * FROM topups
      WHERE status = 'pending' AND payment_code LIKE ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(`%${suffix}%`);
    },

    markPaid(id) {
        db.prepare(`
      UPDATE topups SET status = 'paid', paid_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);
    },

    getRecentByUser(telegramId, limit = 5) {
        return db.prepare(`
      SELECT * FROM topups WHERE telegram_id = ? ORDER BY created_at DESC LIMIT ?
    `).all(telegramId, limit);
    },
};

module.exports = topupService;
