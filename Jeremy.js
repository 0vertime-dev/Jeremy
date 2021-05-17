require('dotenv').config();
const { Jeremy_TOKEN, OWNERS, Jeremy_PREFIX, INVITE } = process.env;
const path = require('path');
const { Intents, MessageEmbed } = require('discord.js');
const Client = require('./structures/Client');
const client = new Client({
	commandPrefix: Jeremy_PREFIX,
	owner: OWNERS.split(','),
	invite: INVITE,
	disableMentions: 'everyone',
	partials: ['GUILD_MEMBER'],
});
const { formatNumber } = require('./util/Util');

client.registry
	.registerDefaultTypes()
	.registerTypesIn(path.join(__dirname, 'types'))
	.registerGroups([
		['info', 'Discord Information'],
		['random-res', 'Random Response'],
		['random-img', 'Random Image'],
		['random-seed', 'Seeded Randomizers'],
		['single', 'Single Response'],
		['edit-meme', 'Meme Generators'],
		['edit-meme-2', 'Meme Generators 2'],
		['edit-meme-3', 'Meme Generators 3'],
		['edit-meme-4', 'Meme Generators 4'],
		['voice', 'Play Audio'],
		['other', 'Other'],
		['util-public', 'Utility'],
		['util-voice', 'Utility (Voice)'],
		['util', 'Utility (Owner)']
	])
	.registerDefaultCommands({
		help: false,
		ping: false,
		prefix: false,
		commandState: false,
		unknownCommand: false
	})
	.registerCommandsIn(path.join(__dirname, 'commands'));

client.on('ready', async () => {
	client.logger.info(`[READY] Logged in as ${client.user.tag}! ID: ${client.user.id}`);

	// Register all canvas fonts
	await client.registerFontsIn(path.join(__dirname, 'assets', 'fonts'));

	// Set up existing timers
	await client.timers.fetchAll();

	// Push client-related activities
	//client.activities.push(
		//{ text: () => `${formatNumber(client.guilds.cache.size)} servers`, type: 'WATCHING' },
		//{ text: () => `with ${formatNumber(client.registry.commands.size)} commands`, type: 'PLAYING' },
		//{ text: () => `${formatNumber(client.channels.cache.size)} channels`, type: 'WATCHING' }
	//);

	// Interval to change activity every minute
	client.setInterval(() => {
		const activity = client.activities[Math.floor(Math.random() * client.activities.length)];
		const text = typeof activity.text === 'function' ? activity.text() : activity.text;
		client.user.setActivity(text, { type: activity.type });
	}, 60000);

	// Set up meme poster interval
	if (client.memePoster) {
		client.setInterval(async () => {
			try {
				const post = await client.memePoster.fetchRandomPost(false);
				await client.memePoster.post(post);
			} catch (err) {
				client.logger.error(err);
			}
		}, client.memePoster.postInterval);
	}

	// Import blacklist
	try {
		const results = client.importBlacklist();
		if (!results) client.logger.error('[BLACKLIST] blacklist.json is not formatted correctly.');
	} catch (err) {
		client.logger.error(`[BLACKLIST] Could not parse blacklist.json:\n${err.stack}`);
	}

	// Make sure bot is not in any blacklisted guilds
	for (const id of client.blacklist.guild) {
		try {
			const guild = await client.guilds.fetch(id, false);
			await guild.leave();
			client.logger.info(`[BLACKLIST] Left blacklisted guild ${id}.`);
		} catch {
			if (!client.guilds.cache.has(id)) continue;
			client.logger.info(`[BLACKLIST] Failed to leave blacklisted guild ${id}.`);
		}
	}

	// Make sure bot is not in any guilds owned by a blacklisted user
	let guildsLeft = 0;
	for (const guild of client.guilds.cache.values()) {
		if (client.blacklist.user.includes(guild.ownerID)) {
			try {
				await guild.leave();
				guildsLeft++;
			} catch {
				client.logger.info(`[BLACKLIST] Failed to leave blacklisted guild ${guild.id}.`);
			}
		}
	}
	client.logger.info(`[BLACKLIST] Left ${guildsLeft} guilds owned by blacklisted users.`);

	// Import command-leaderboard.json
	try {
		const results = client.importCommandLeaderboard();
		if (!results) client.logger.error('[LEADERBOARD] command-leaderboard.json is not formatted correctly.');
	} catch (err) {
		client.logger.error(`[LEADERBOARD] Could not parse command-leaderboard.json:\n${err.stack}`);
	}

	// Export command-last-run.json
	try {
		const results = client.importLastRun();
		if (!results) client.logger.error('[LASTRUN] command-last-run.json is not formatted correctly.');
	} catch (err) {
		client.logger.error(`[LASTRUN] Could not parse command-last-run.json:\n${err.stack}`);
	}

	// Export command-leaderboard.json and command-last-run.json every 30 minutes
	client.setInterval(() => {
		try {
			client.exportCommandLeaderboard();
		} catch (err) {
			client.logger.error(`[LEADERBOARD] Failed to export command-leaderboard.json:\n${err.stack}`);
		}
		try {
			client.exportLastRun();
		} catch (err) {
			client.logger.error(`[LASTRUN] Failed to export command-last-run.json:\n${err.stack}`);
		}
	}, 1.8e+6);
});

client.on('message', async msg => {
	const hasText = Boolean(msg.content);
	const hasImage = msg.attachments.size !== 0;
	const hasEmbed = msg.embeds.length !== 0;
	if (msg.author.bot || (!hasText && !hasImage && !hasEmbed)) return;
	if (client.blacklist.user.includes(msg.author.id)) return;
	const origin = client.phone.find(call => call.origin.id === msg.channel.id);
	const recipient = client.phone.find(call => call.recipient.id === msg.channel.id);
	if (!origin && !recipient) return;
	const call = origin || recipient;
	if (call.originDM && call.startUser.id !== msg.author.id) return;
	if (!call.adminCall && (msg.guild && (!msg.channel.topic || !msg.channel.topic.includes('<Jeremy:phone>')))) return;
	if (!call.active) return;
	if (call.adminCall && msg.guild.id === call.origin.guild.id && !client.isOwner(msg.author)) return;
	try {
		await call.send(origin ? call.recipient : call.origin, msg, hasText, hasImage, hasEmbed);
	} catch {
		return; // eslint-disable-line no-useless-return
	}
});

client.on('guildCreate', async guild => {
	if (client.blacklist.guild.includes(guild.id) || client.blacklist.user.includes(guild.ownerID)) {
		try {
			await guild.leave();
			return;
		} catch {
			return;
		}
	}
	if (guild.systemChannel && guild.systemChannel.permissionsFor(client.user).has('SEND_MESSAGES')) {
		try {
			const usage = client.registry.commands.get('help').usage();
			await guild.systemChannel.send(`Sup, I'm Jeremy, you can use ${usage} to see all I can do, also im a racoon`);
		} catch {
			// Nothing!
		}
	}
	const joinLeaveChannel = await client.fetchJoinLeaveChannel();
	if (joinLeaveChannel) {
		if (!guild.members.cache.has(guild.ownerID)) await guild.members.fetch(guild.ownerID);
		const embed = new MessageEmbed()
			.setColor(0x7CFC00)
			.setThumbnail(guild.iconURL({ format: 'png' }))
			.setTitle(`Joined ${guild.name}!`)
			.setFooter(`ID: ${guild.id}`)
			.setTimestamp()
			.addField('❯ Members', formatNumber(guild.memberCount))
			.addField('❯ Owner', guild.owner.user.tag);
		await joinLeaveChannel.send({ embed });
	}
});

client.on('guildDelete', async guild => {
	const joinLeaveChannel = await client.fetchJoinLeaveChannel();
	if (joinLeaveChannel) {
		const embed = new MessageEmbed()
			.setColor(0xFF0000)
			.setThumbnail(guild.iconURL({ format: 'png' }))
			.setTitle(`Left ${guild.name}...`)
			.setFooter(`ID: ${guild.id}`)
			.setTimestamp()
			.addField('❯ Members', formatNumber(guild.memberCount))
			.addField('❯ Owner', guild.ownerID);
		await joinLeaveChannel.send({ embed });
	}
});

client.on('guildMemberRemove', async member => {
	if (member.id === client.user.id) return null;
	const channel = member.guild.systemChannel;
	if (!channel || !channel.permissionsFor(client.user).has('SEND_MESSAGES')) return null;
	if (channel.topic && channel.topic.includes('<Jeremy:disable-leave>')) return null;
	try {
		const leaveMessage = client.leaveMessages[Math.floor(Math.random() * client.leaveMessages.length)];
		await channel.send(leaveMessage.replaceAll('{{user}}', `**${member.user.tag}**`));
		return null;
	} catch {
		return null;
	}
});

client.on('voiceStateUpdate', (oldState, newState) => {
	if (newState.id !== client.user.id || oldState.id !== client.user.id) return;
	if (newState.channel) return;
	const dispatcher = client.dispatchers.get(oldState.guild.id);
	if (!dispatcher) return;
	dispatcher.end();
	client.dispatchers.delete(oldState.guild.id);
});

client.on('disconnect', event => {
	client.logger.error(`[DISCONNECT] Disconnected with code ${event.code}.`);
	client.exportCommandLeaderboard();
	client.exportLastRun();
	process.exit(0);
});

client.on('error', err => client.logger.error(err.stack));

client.on('warn', warn => client.logger.warn(warn));

client.on('commandRun', command => {
	if (command.uses === undefined) return;
	command.uses++;
	if (command.lastRun === undefined) return;
	command.lastRun = new Date();
});

client.dispatcher.addInhibitor(msg => {
	if (client.blacklist.user.includes(msg.author.id)) return 'blacklisted';
	if (msg.guild && client.blacklist.guild.includes(msg.guild.id)) return 'blacklisted';
	return false;
});

client.on('commandError', (command, err) => client.logger.error(`[COMMAND:${command.name}]\n${err.stack}`));

client.login(Jeremy_TOKEN);
