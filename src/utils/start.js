const userService = require('../services/userService');
const messages = require('../utils/messages');

module.exports = (bot) => {
    bot.start((ctx) => {
        const user = userService.findOrCreate(ctx.from);
        ctx.replyWithHTML(messages.welcome(user.full_name));
    });
};
