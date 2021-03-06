const Command = require('../../structures/Command');
const DIG = require("discord-image-generation");
const Discord = require("discord.js")

module.exports = class BedCommand extends Command {
	constructor(client) {
		super(client, {
			name: 'bed',
			aliases: ['bed', 'underthebed'],
			group: 'edit-meme',
			memberName: 'bed',
			description: 'theres a monster under your bed',
			throttling: {
				usages: 1,
				duration: 10
			},
			clientPermissions: ['ATTACH_FILES'],
			args: [
				{
					key: 'top',
					prompt: 'who is in the bed?',
					type: 'image-or-avatar',
					default: msg => msg.author.displayAvatarURL({ format: 'png', size: 512 })
				},
				{
					key: 'bottom',
					prompt: 'who is under the bed?',
					type: 'image-or-avatar'
				}
			]
		});
	}

	async run(msg, { top, bottom }) {
        let img = await new DIG.Bed().getImage(top, bottom)
		let attach = new Discord.MessageAttachment(img, "bed.png");;
        return msg.channel.send(attach)
	}
};
