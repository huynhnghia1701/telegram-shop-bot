const userService = require('../services/userService');
const messages = require('../utils/messages');

module.exports = (bot) => {
    bot.command('menu', (ctx) => {
        const user = userService.findOrCreate(ctx.from);
        ctx.replyWithHTML(messages.accountInfo(user));
    });
};
