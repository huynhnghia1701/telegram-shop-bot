const db = require('../database');

const userService = {
    /**
     * Find or create user
     */
    findOrCreate(telegramUser) {
        const existing = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramUser.id);
        if (existing) return existing;

        const fullName = [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ');
        db.prepare(
            'INSERT INTO users (telegram_id, username, full_name) VALUES (?, ?, ?)'
        ).run(telegramUser.id, telegramUser.username || null, fullName);

        return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramUser.id);
    },

    /**
     * Get user by telegram ID
     */
    get(telegramId) {
        return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
    },

    // Bổ sung hàm getUser để adminActions.js có thể gọi
    getUser(telegramId) {
        return this.get(telegramId);
    },

    /**
     * Update balance (Cộng tiền)
     */
    addBalance(telegramId, amount) {
        db.prepare('UPDATE users SET balance = balance + ? WHERE telegram_id = ?').run(amount, telegramId);
    },

    /**
     * Deduct balance (Trừ tiền)
     */
    deductBalance(telegramId, amount) {
        const user = this.get(telegramId);
        if (!user || user.balance < amount) return false;
        db.prepare('UPDATE users SET balance = balance - ? WHERE telegram_id = ?').run(amount, telegramId);
        return true;
    },

    // Bổ sung hàm updateBalance để adminActions.js có thể gọi
    updateBalance(telegramId, newBalance) {
        db.prepare('UPDATE users SET balance = ? WHERE telegram_id = ?').run(newBalance, telegramId);
    }
};

module.exports = userService;