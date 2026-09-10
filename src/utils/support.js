const messages = require('../utils/messages');

module.exports = (bot) => {
    bot.command('support', (ctx) => {
        ctx.replyWithHTML(messages.supportInfo);
    });
};
