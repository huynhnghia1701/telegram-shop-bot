const messages = require('../utils/messages');

module.exports = (bot) => {
    bot.command('myid', (ctx) => {
        ctx.replyWithHTML(messages.myId(ctx.from.id));
    });
};
