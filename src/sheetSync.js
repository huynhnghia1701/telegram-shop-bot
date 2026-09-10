const https = require('https');
const http = require('http');
const db = require('../database');
const config = require('../config');

// Sync interval in minutes
const SYNC_INTERVAL = parseInt(process.env.SHEET_SYNC_INTERVAL) || 5;

/**
 * Fetch CSV from published Google Sheet
 */
function fetchSheetCSV(sheetId) {
    return new Promise((resolve, reject) => {
        const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;

        const request = https.get(url, { headers: { 'User-Agent': 'StorizziBot/1.0' } }, (res) => {
            // Handle redirects (Google Sheets always redirects)
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = new URL(res.headers.location);
                const mod = redirectUrl.protocol === 'https:' ? https : http;
                mod.get(res.headers.location, (res2) => {
                    let data = '';
                    res2.on('data', (chunk) => (data += chunk));
                    res2.on('end', () => resolve(data));
                    res2.on('error', reject);
                }).on('error', reject);
                return;
            }

            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }

            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => resolve(data));
            res.on('error', reject);
        });

        request.on('error', reject);
        request.setTimeout(15000, () => {
            request.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

/**
 * Parse CSV string into rows
 * Handles quoted fields with commas
 */
function parseCSV(csv) {
    const lines = csv.split('\n').filter((l) => l.trim());
    const rows = [];

    for (const line of lines) {
        const row = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                row.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        row.push(current.trim());
        rows.push(row);
    }

    return rows;
}

/**
 * Parse price string like "8.000đ" or "8000" into integer
 */
function parsePrice(priceStr) {
    if (!priceStr) return 0;
    // Remove đ, VND, dots, spaces
    const cleaned = priceStr.replace(/[đĐdD\s.VND]/gi, '').trim();
    return parseInt(cleaned) || 0;
}

/**
 * Sync Google Sheet data to database
 * Sheet columns: A=ID, B=Sản phẩm, C=Giá bán, D=Đơn vị tính, E=Số lượng trong kho, F=Tình trạng còn hàng, G=Liên hệ đặt hàng, H=Ghi chú
 */
function syncToDatabase(rows) {
    // Skip header row
    const dataRows = rows.slice(1).filter((r) => r.length >= 3 && r[0] && r[1]);

    let updated = 0;
    let added = 0;

    const getProduct = db.prepare('SELECT * FROM products WHERE id = ?');
    const updateProduct = db.prepare(`
    UPDATE products SET name = ?, price = ?, description = ?, is_active = ?,
      contact_only = ?, contact_url = ?, sheet_stock = ?, promotion = ?
    WHERE id = ?
  `);
    const insertProduct = db.prepare(`
    INSERT OR REPLACE INTO products (id, category_id, name, price, emoji, description,
      contact_only, contact_url, sheet_stock, promotion, is_active)
    VALUES (?, 1, ?, ?, '📦', ?, ?, ?, ?, ?, ?)
  `);

    // Count real stock (from stock table) per product
    const getRealStock = db.prepare(
        'SELECT COUNT(*) as c FROM stock WHERE product_id = ? AND is_sold = 0'
    );

    const syncAll = db.transaction(() => {
        for (const row of dataRows) {
            const id = parseInt(row[0]);
            const name = row[1] || '';
            const price = parsePrice(row[2]);
            const unit = row[3] || '';
            const sheetStock = parseInt(row[4]) || 0;
            const inStock = row[5] ? (row[5].toUpperCase() === 'TRUE' || row[5] === '✓' || row[5] === '☑') : false;
            const contactUrl = (row[6] || '').trim() || null;
            const notes = row[7] || '';

            if (!name || !id) continue;

            // Build description from unit + notes
            const desc = [unit, notes].filter(Boolean).join(' | ');

            // Determine contact_only: no sheet stock AND no real stock = contact-only
            const realStock = getRealStock.get(id);
            const hasRealStock = realStock && realStock.c > 0;
            const contactOnly = (!hasRealStock && sheetStock === 0) ? 1 : 0;

            // Use notes as promotion if it looks like a promo
            const promotion = notes || null;

            // Check if product exists
            const existing = getProduct.get(id);

            if (existing) {
                updateProduct.run(name, price, desc, inStock ? 1 : 0,
                    contactOnly, contactUrl, sheetStock, promotion, id);
                updated++;
            } else {
                insertProduct.run(id, name, price, desc,
                    contactOnly, contactUrl, sheetStock, promotion, inStock ? 1 : 0);
                added++;
            }
        }
    });

    syncAll();

    return { updated, added, total: dataRows.length };
}

/**
 * Run full sync from Google Sheet
 */
async function syncFromSheet() {
    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!sheetId) {
        console.log('⚠️ GOOGLE_SHEET_ID not set, skipping sync');
        return null;
    }

    try {
        console.log('🔄 Syncing from Google Sheet...');
        const csv = await fetchSheetCSV(sheetId);
        const rows = parseCSV(csv);
        const result = syncToDatabase(rows);
        console.log(`✅ Sheet sync done: ${result.updated} updated, ${result.added} added (${result.total} total)`);
        return result;
    } catch (err) {
        console.error('❌ Sheet sync failed:', err.message);
        return { error: err.message };
    }
}

/**
 * Start auto-sync interval
 */
function startAutoSync() {
    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!sheetId) {
        console.log('⚠️ Google Sheet sync disabled (no GOOGLE_SHEET_ID)');
        return;
    }

    console.log(`📊 Google Sheet auto-sync enabled (every ${SYNC_INTERVAL} min)`);

    // Initial sync after 5 seconds
    setTimeout(() => syncFromSheet(), 5000);

    // Then sync every N minutes
    setInterval(() => syncFromSheet(), SYNC_INTERVAL * 60 * 1000);
}

module.exports = {
    syncFromSheet,
    startAutoSync,
    fetchSheetCSV,
    parseCSV,
    SYNC_INTERVAL,
};
