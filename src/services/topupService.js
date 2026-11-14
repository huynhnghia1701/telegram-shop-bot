const db = require('../database');

const topupService = {
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
    getPendingBySuffix(suffix) {
        return db.prepare(`
      SELECT * FROM topups
      WHERE status = 'pending' AND payment_code LIKE ?
      ORDER BY created_at DESC LIMIT 1
    `).get(`%${suffix}%`);
    },
    markPaid(id) {
        db.prepare(`UPDATE topups SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
    },
};

module.exports = topupService;