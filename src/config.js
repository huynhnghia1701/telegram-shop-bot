require('dotenv').config();

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    ADMIN_ID: parseInt(process.env.ADMIN_ID) || 0,

    // Bank config for VietQR
    BANK: {
        BIN: process.env.BANK_BIN || '970422',
        ACCOUNT: process.env.BANK_ACCOUNT || '',
        ACCOUNT_NAME: process.env.BANK_ACCOUNT_NAME || '',
        NAME: process.env.BANK_NAME || 'MB',
    },

    BANK2: process.env.BANK2_ACCOUNT ? {
        BIN: process.env.BANK2_BIN || '970436',
        ACCOUNT: process.env.BANK2_ACCOUNT,
        ACCOUNT_NAME: process.env.BANK2_ACCOUNT_NAME || '',
        NAME: process.env.BANK2_NAME || 'VCB',
    } : null,

    // Payment
    WEBHOOK_PORT: parseInt(process.env.WEBHOOK_PORT) || 3000,
    SEPAY_API_KEY: process.env.SEPAY_API_KEY || '',

    // Shop
    SHOP_NAME: process.env.SHOP_NAME || 'Telegram Bot',
    SUPPORT_CONTACT: process.env.SUPPORT_CONTACT || '@kcdmd2',
};
