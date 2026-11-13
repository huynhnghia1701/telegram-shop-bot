const db = require('../database');

const userService = {
    findOrCreate(telegramUser) {
        const existing = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramUser.id);
        if (existing) return existing;

        const fullName = [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ');
        db.prepare(
            'INSERT INTO users (telegram_id, username, full_name) VALUES (?, ?, ?)'
        ).run(telegramUser.id, telegramUser.username || null, fullName);

        return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramUser.id);
    },

    get(telegramId) {
        return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
    },
    
    getUser(telegramId) {
        return this.get(telegramId);
    },

    addBalance(telegramId, amount) {
        db.prepare('UPDATE users SET balance = balance + ? WHERE telegram_id = ?').run(amount, telegramId);
    },

    deductBalance(telegramId, amount) {
        const user = this.get(telegramId);
        if (!user || user.balance < amount) return false;
        db.prepare('UPDATE users SET balance = balance - ? WHERE telegram_id = ?').run(amount, telegramId);
        return true;
    },

    updateBalance(telegramId, newBalance) {
        db.prepare('UPDATE users SET balance = ? WHERE telegram_id = ?').run(newBalance, telegramId);
    }
};

module.exports = userService;