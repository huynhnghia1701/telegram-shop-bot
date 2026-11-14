const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'shop.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    username TEXT,
    full_name TEXT,
    balance INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '📦',
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    description TEXT,
    emoji TEXT DEFAULT '📦',
    promotion TEXT,
    contact_only INTEGER DEFAULT 0,
    contact_url TEXT,
    sheet_stock INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    data TEXT NOT NULL,
    is_sold INTEGER DEFAULT 0,
    sold_to INTEGER,
    sold_at DATETIME,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    total_price INTEGER NOT NULL,
    payment_code TEXT UNIQUE,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    paid_at DATETIME,
    delivered_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(telegram_id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS topups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    payment_code TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    paid_at DATETIME
  );
`);

// ═══════════════════════════════════════════════════════
// SAFE MIGRATIONS: Tự động thêm cột nếu Database cũ bị thiếu
// ═══════════════════════════════════════════════════════
try { db.exec('ALTER TABLE products ADD COLUMN contact_url TEXT'); } catch (e) { }
try { db.exec('ALTER TABLE products ADD COLUMN sheet_stock INTEGER DEFAULT 0'); } catch (e) { }
// Thêm 2 dòng này để fix lỗi mua hàng:
try { db.exec('ALTER TABLE stock ADD COLUMN sold_to INTEGER'); } catch (e) { }
try { db.exec('ALTER TABLE stock ADD COLUMN sold_at DATETIME'); } catch (e) { }

// Seed data - only if categories table is empty
const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get();
if (catCount.c === 0) {
  console.log('📦 Seeding initial data...');

  // Insert categories
  const insertCat = db.prepare('INSERT INTO categories (name, emoji, sort_order) VALUES (?, ?, ?)');
  insertCat.run('Telegram', '🤖', 1);
  
  // Insert products
  const insertProd = db.prepare(`
    INSERT INTO products (category_id, name, price, emoji, promotion, contact_only)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertProd.run(1, 'TeleGram', 500000, '📦', null, 0);

  console.log('✅ Seed data created!');
}

module.exports = db;