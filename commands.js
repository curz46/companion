import datastore from './datastore.js';
import { groupByLength,
         isGuildConfigured,
         createWizard,
         checkWritePermission,
         partnerWithDescription,
         partnerWithGuild, 
         checkCompatible,
         QuitError} from './helpers.js';
import { create as createBar } from './progress.js';

const CHANNEL_REGEX = /<#(\d{18})>/;
const SNOWFLAKE_REGEX = /(\d{18})/;

async function handleCommand(client, db, message, subcmd, args) {
    if (subcmd == 'eval') {
        let result;
        try {
            result = eval(args.join(' '));
        } catch (e) {
            result = e;
        }
        return await message.channel.send('```' + result + '```');
    }
    if (subcmd == 'help') {
        return printHelp(message.channel);
    }
    if (subcmd == 'all') {
        return allCommand(client, db, message.channel);
    }
    if (subcmd == 'what') {
        if (args.length != 1) {
            return printBadUsage(message.channel);
        }
        const [query] = args;
        const guild = await parseGuild(client, db, query, true);
        if (!guild) {
            return message.channel.send('Error: No matching guilds for that query string.');
        }
        return whatCommand(client, db, message.channel, guild);
    }
    if (subcmd == 'add') {
        return addCommand(client, db, message);
    }
    if (subcmd == 'remove') {
        if (args.length != 1) {
            return printBadUsage(message.channel);
        }
        const [query] = args;
        const guildId = await parseGuild(client, db, query, true);
        if (!guildId) {
            return message.channel.send('Error: No matching guilds for that query string.');
        }
        return removeCommand(client, db, message.channel, guildId);
    }
    if (subcmd == 'channel') {
        if (args.length != 2) {
            return printBadUsage(message.channel);
        }
        const [guildQuery, channelQuery] = args;
        const guildId = await parseGuild(client, db, guildQuery, true);
        if (!guildId) {
            return message.channel.send('Error: No matching guilds for that query string.');
        }
        const descriptionChannelId = parseChannel(channelQuery);
        if (!descriptionChannelId) {
            return message.channel.send('Error: No matching channels for that query string.');
        }
        return setChannelCommand(client, db, message.channel, guildId, descriptionChannelId);
    }
    if (subcmd == 'partnerchannel') {
        if (args.length != 2) {
            return printBadUsage(message.channel);
        }
        const [guildQuery, channelQuery] = args;
        const guildId = await parseGuild(client, db, guildQuery, true);
        if (!guildId) {
            return message.channel.send('Error: No matching guilds for that query string.');
        }
        const partnerChannelId = parseChannel(channelQuery); 
        if (!partnerChannelId) {
            return message.channel.send('Error: No matching channels for that query string.');
        }
        return setPartnerChannelCommand(client, db, message.channel, guildId, partnerChannelId);
    }
    if (subcmd == 'kill') {
        await message.channel.send('Killing...');
        process.exit(1);
    }
    if (subcmd == 'partner') {
        if (args.length >= 1 && args[0].toLowerCase() == 'all') {
            const guilds = await datastore.getGuilds(db);
            try {
                return await partnerCommand(client, db, message, guilds);
            } catch (e) {
                if (e.constructor == QuitError) {
                    return await message.channel.send('❌ Wizard expired/cancelled, re-run `k!partner` if you still want to partner.');
                } else {
                    console.error(e);
                    return await message.channel.send('❌ An error occurred:```' + e.message + '```');
                }
            }
        }
        if (args.length == 0) {
            return await message.channel.send('Usage: `k!partner <guild1> <guild2> ...`');
        }
        const guildIds = await Promise.all(
            args.map(arg => parseGuild(client, db, arg, true))
        );
        console.log(guildIds);
        const guilds = await Promise.all(
            guildIds.map(async id => await datastore.findGuild(db, id))
        );
        try {
            return await partnerCommand(client, db, message, guilds);
        } catch (e) {
            if (e.constructor == QuitError) {
                return await message.channel.send('❌ Wizard expired/cancelled, re-run `k!partner` if you still want to partner.');
            } else {
                return await message.channel.send('❌ An error occurred:```' + e.message + '```');
            }
        }
    }
    if (subcmd == 'mincount') {
        if (args.length == 0) {
            return await message.channel.send('Usage: `k!mincount <guild> [count]`');
        }
        const guildId = await parseGuild(client, db, args[0], true);
        if (!guildId) {
            return await message.channel.send('Error: No matching guilds for that query string.');
        }
        let count = -1;
        if (args.length == 1) {
            await removeGuildMeta(db, guildId, 'mincount');
        } else {
            count = parseInt(args[1]);
            await updateGuildMeta(db, guildId, {mincount: count});
        }
        return await message.channel.send(`Updated meta \`mincount\` for \`${guildId}\` to \`${count}\``);
    }
    if (subcmd == 'tags') {
        if (args.length <= 1) {
            return await message.channel.send('Usage: `k!tags <guild> [tag1] [tag2] [tag3] ...`');
        }
        const guildId = await parseGuild(client, db, args[0], true);
        if (!guildId) {
            return await message.channel.send('Error: No matching guilds for that query string.');
        }
        const tags = args.slice(1);
        if (tags.length == 0) {
            await removeGuildMeta(db, guildId, ['tags']);
        } else {
            await updateGuildMeta(db, guildId, {tags});
        }
        return await message.channel.send(`Updated meta \`tags\` for \`${guildId}\` to \`${tags}\``);
    }
    if (subcmd == 'exclude') {
        if (args.length <= 1) {
            return await message.channel.send('Usage: `k!exclude <guild> [tag1] [tag2] [tag3] ...`');
        }
        const guildId = await parseGuild(client, db, args[0], true);
        if (!guildId) {
            return await message.channel.send('Error: No matching guilds for that query string.');
        }
        const exclude = args.slice(1);
        if (exclude.length == 0) {
            await removeGuildMeta(db, guildId, ['exclude']);
        } else {
            await updateGuildMeta(db, guildId, {exclude});
        }
        return await message.channel.send(`Updated meta \`exclude\` for \`${guildId}\` to \`${exclude}\``);
    }
    // if (subcmd == 'blacklist') {
    // }
    if (subcmd == 'filter') {
        return await filterCommand(client, db, message);
    }
    
    return message.channel.send('Unrecognised subargument. Use `k!help` for help.');
}

async function updateGuildMeta(db, guildId, meta) {
    const data    = await datastore.findGuild(db, guildId);
    const oldMeta = data.meta ? data.meta : {};
    const newMeta = Object.assign({}, oldMeta, meta);
    return await datastore.updateGuild(db, {guildId, meta: newMeta});
}

async function removeGuildMeta(db, guildId, keys) {
    const data = await datastore.findGuild(db, guildId);
    if (!data.meta) return;
    for (const key of Object.keys(data.meta)) {
        if (keys.includes(key)) {
            delete data.meta[key];
        }
    }
    return await datastore.updateGuild(db, {guildId, meta: data.meta});
}

function printBadUsage(channel) {
    return channel.send('Bad usage. Use `k!help` for help.');
}

function printHelp(channel) {
    const help = [
        '`<>` denotes required, `[]` denotes optional. omit `<>` or `[]` when specifying the arguments',
        '`k!all` - print all guilds & their configured values',
        '`k!what <channel|guild name|guild id>` - print details about a guild',
        '`k!partner <guild1> [guild2] [guild3] [...]` - begin a mass partner with these guilds',
        '`k!partner all` - begin a mass partner with all configured guilds',
        '`k!combo <guild1> [guild2] [guild3] [...]` - begin a combo partner with these guilds',
        '`k!combo all` - being a combo partner with all guilds',
        '`k!undo` - delete all messages sent in the last `k!mass` partner',
        '`k!kill` - kill the bot, immediately stopping activity',
        '`k!add` - add a guild to the database',
        '`k!remove <channel|guild name|guild id>` - remove a guild from the database',
        '`k!channel <guild name|guild id> <channel|id> - update a guild\'s channel`',
        '`k!partnerchannel <guild name|guild id> <channel|id>` - update a guild\'s partner channel'
    ];
    return channel.send('', {embed: {description: help.join('\n')}});
}

async function filterCommand(client, db, message) {
    const wizard = createWizard(message.member, message.channel, '`[FILTER WIZARD]:` ');
    await wizard.explain(
        'You\'ve started the filter wizard. This is a simple helper to allow you to find guilds that are compatible with a set of guild metadata.'
    );
    const type = await wizard.ask(
        'Do you want to reference a registered guild or enter values? (`guild`|`values`)',
        'You must enter either `guild` or `values`',
        choice => 'guild'.startsWith(choice) || 'values'.startsWith(choice)
    );
    let compatible;
    if ('guild'.startsWith(type)) {
        const guildData = await wizard.parse(
            'Choose a guild, specifying its name or id.',
            async content => {
                const guildId = await parseGuild(client, db, content, true);
                if (guildId == null) return null;
                return await datastore.findGuild(db, guildId);
            },
            'I can\'t find that guild, try again.',
            data => data != null && client.guilds.has(data.guildId)
        );
        await resolveData(client, message.guild, guildData);
        // compatible = (await filterByMetadata(db, count, tags, exclude)).filter(g => g.guildId != guildData.guildId);
        compatible = (await datastore.getGuilds(db))
            .filter(g => g.guildId != guildData.guildId)
            .map(async g => await resolveData(client, message.guild, g));
        compatible = await Promise.all(compatible);
        compatible = compatible
            .filter(g => checkCompatible(guildData, g));
    } else if ('values'.startsWith(type)) {
        const count   = await wizard.parse('Enter the member count:', parseInt, 'Must be an integer', c => c >= 0);
        const tags    = await wizard.parse('Enter a list of tags, space-separated:', tags => tags.split(' '));
        const exclude = await wizard.parse('Enter a list of excluded tags, space-separated:', exclude => exclude.split(' '));
        compatible = await filterByMetadata(db, count, tags, exclude);
    }

    const channelList = compatible.map(g => `<#${g.channelId}>`);
    return await message.channel.send(
        'Compatible: ' + (channelList.length ? channelList.join(' ') : '`none`')
    );
}

async function filterByMetadata(db, memberCount, tags = [], exclude = []) {
    return (await datastore.getGuilds(db))
        .filter(guild => {
            if (!isGuildConfigured(guild)) return false;
            if (!guild.meta) return true;
        
            const meta = guild.meta || {};
        
            if (meta.mincount && memberCount < meta.mincount) {
                return false;
            }
            if (meta.tags) {
                for (const tag of meta.tags) {
                    if (exclude.includes(tag)) return false;
                }
            }
            if (meta.exclude) {
                for (const tag of tags) {
                    if (meta.exclude.includes(tag)) return false;
                }
            }
            return true;
        })
}

async function partnerCommand(client, db, message, guilds) {
    const wizard = createWizard(message.member, message.channel, '`[PARTNER WIZARD]:` ');
    await wizard.explain(
        'You\'ve started the mass partner wizard. A mass partner is a one-to-many partner, like so:\n\n' +
        '`guild1, guild2, guild3` partnered with subject `guild4` would result in: ' +
        '`guild1 x guild4`, `guild2 x guild4`, `guild3 x guild4` (where `x` denotes a partner)\n\n' +
        `You've selected ${guilds.length} guilds: ` + guilds.map(data => `<#${data.channelId}>`).join(' ') + '\n' +
        'Checking that guild partner channels have correct permissions...'
    );
    const amendments = [];
    guilds = guilds.filter(data => {
        if (!isGuildConfigured(data)) {
            amendments.push(`Removed ${data.guildId} (<#${data.channelId}>) because it is improperly configured.`);
            return false;
        }
        return true;
    });
    // fill resolved guild/channels into data
    for (const data of guilds) {
        await resolveData(client, message.guild, data);
    }
    guilds = guilds.filter(data => {
        if (!data.guild || !data.channel || !data.partnerChannel || !data.description) {
            amendments.push(`Removed \`${data.guildId}\` (<#${data.channelId}>) because its configured values are missing.`);
            return false;
        }
        if (!checkWritePermission(data)) {
            amendments.push(`Removed ${data.guildId} (<#${data.channelId}>) because <#${data.partnerChannelId}> has bad permissions.`)
            return false;
        }
        return true;
    });
    // if there were changes to the array
    if (amendments.length) {
        amendments.push(`This leaves \`${guilds.length}\` guilds: ` + guilds.map(data => `<#${data.channelId}>`).join(' '));
    }
    for (const amendment of groupByLength(amendments, '\n', 2000)) {
        await wizard.send(amendment);
    }
    if (guilds.length == 0) {
        return await wizard.send('There are no guilds to partner with, exiting wizard...');
    }
    const type = await wizard.ask(
        'Do you want to give a description or a registered guild? (`description`|`guild`)',
        'The subject type must be `description` or `guild`',
        choice => 'description'.startsWith(choice) || 'guild'.startsWith(choice)
    );
    let emitter;
    if ('description'.startsWith(type)) {
        const subjectDescription = await wizard.ask('Paste the description (without a codeblock):');
        await wizard.send('Creating partner execution plan...');
        const posts = guilds.map(data => {
            return `• Post \`1\` message in \`${data.guild.name} #${data.partnerChannel.name}\` (<#${data.partnerChannelId}>)`
        });
        plan = plan.concat(posts);

        for (const msg of groupByLength(plan, '\n', 1900)) {
            await channel.send(msg);
        }
        const reaction = await wizard.react('Should I go ahead with the mass partner?', ['✅']);
        if (reaction != '✅') return;
        emitter = partnerWithDescription(client, guilds, subjectDescription);
    } else if ('guild'.startsWith(type)) {
        const subject = await wizard.parse(
            'Choose a guild, specifying its name or id.',
            async content => {
                const guildId = await parseGuild(client, db, content, true);
                if (guildId == null) return null;
                return await datastore.findGuild(db, guildId);
            },
            'I can\'t find that guild, try again.',
            data => data != null && client.guilds.has(data.guildId)
        );
        await resolveData(client, message.guild, subject);

        // check compatible
        const guildAmendments = [];
        guilds = guilds.filter(data => {
            if (!checkCompatible(data, subject)) {
                guildAmendments.push(`Removed ${data.guildId} (<${data.channelId}>) because it is incompatible with the subject.`)
                return false;
            }
            return true;
        });

        await wizard.send('Creating partner execution plan...');
        const posts = guilds.map(data => {
            return `• Post \`1\` message in \`${data.guild.name} #${data.partnerChannel.name}\` (<#${data.partnerChannelId}>)`
        });
        posts.push(`• Post \`${guilds.length}\` messages in \`${subject.guild.name} #${subject.partnerChannel.name}\` (<#${subject.partnerChannelId}>)`);
        for (const msg of groupByLength(posts, '\n', 1900)) {
            await channel.send(msg);
        }
        const reaction = await wizard.react('Should I go ahead with the mass partner?', ['✅']);
        if (reaction != '✅') return;
        emitter = partnerWithGuild(client, guilds, subject);
    } else {
        return;
    }

    const bar = createBar(guilds.length);
    const progress = await message.channel.send('', {embed: {description: bar.draw('STARTING')}});
    emitter.on('failed', ([data, reason]) => {
        bar.tick();
        progress.edit('', {embed: {description: bar.draw('IN PROGRESS')}});
        message.channel.send(`Partner with \`${data.guild.name}\` (<#${data.channelId}>) failed, reason: \`${reason}\``);
    });
    emitter.on('success', ([data, _messages]) => {
        bar.tick();
        progress.edit('', {embed: {description: bar.draw('IN PROGRESS')}});
    });
    emitter.on('finished', () => {
        message.reply('All done :)');
        progress.edit('', {embed: {description: bar.draw('COMPLETED')}})
    });
    emitter.on('cancelled', () => {
        progress.edit('', {embed: {description: bar.draw('CANCELLED')}});
    });

    progress
        .awaitReactions((reaction, user) => reaction.emoji.name == '❌' && user.id == message.author.id, {max: 1})
        .then(reaction => { emitter.emit('cancel'); });
}

async function setPartnerChannelCommand(client, db, channel, guildId, channelId) {
    await datastore.updateGuild(db, {guildId, partnerChannelId: channelId});
    return await channel.send('Set `partnerChannelId` to `' + channelId + '` for guild `' + guildId + '`');
}

async function setChannelCommand(client, db, channel, guildId, channelId) {
    await datastore.updateGuild(db, {guildId, channelId});
    return await channel.send('Set `channelId` to `' + channelId + '` for guild `' + guildId + '`');
}

async function removeCommand(client, db, channel, guildId) {
    await datastore.removeGuild(db, guildId);
    return await channel.send('Removed guild from database.');
}

async function addCommand(client, db, message) {
    const {channel} = message;
    // start guild add helper
    const wizard = createWizard(message.member, message.channel, '`[ADD WIZARD]:` ');

    try {
        await wizard.explain('You started the add wizard.');
        const guildId = await wizard.parse(
            'Choose a guild, specifying its name or id.',
            async content => await parseGuild(client, db, content),
            'I can\'t find that guild, try again.',
            guildId => guildId != null && client.guilds.has(guildId)
        );
        const guild = client.guilds.get(guildId);

        await wizard.send(`guildId = \`${guildId} (${guild.name})\``);
        const descriptionChannelId = await wizard.parse(
            'Pick a description channel. Can use #channel or id.',
            parseChannel,
            'I can\'t find that channel, try again.',
            channelId => channelId != null && message.guild.channels.has(channelId)
        );

        await wizard.send('channelId = `' + descriptionChannelId + '`');
        const partnerChannelId = await wizard.parse(
            'Pick a partner channel. Can use #channel or id.',
            parseChannel,
            'I can\'t find that channel, try again.',
            channelId => channelId != null && guild.channels.has(channelId)
        );
        const partnerChannel = guild.channels.get(partnerChannelId);

        await wizard.send(`partnerChannelId = \`${partnerChannelId} (${partnerChannel.name})\``);
        await datastore.addGuild(db, {guildId, channelId: descriptionChannelId, partnerChannelId});
        return await channel.send('✅ Added guild to database');
    } catch (e) {
        console.log(e);
        return await channel.send('❌ Wizard expired/cancelled, re-run `k!add` if you still want to add a guild');
    }
}

async function allCommand(client, db, channel) {
    const guilds = await datastore.getGuilds(db);
    if (!guilds.length) {
        return await channel.send('There are no guilds in the database.');
    }
    let descriptors = guilds.map(guildData => getGuildDescriptor(client, guildData));
    descriptors.push('Note: description is omitted when using `k!all`. use `k!what` to see description.');
    for (const content of groupByLength(descriptors, '\n', 1900)) {
        await channel.send(content)
    }
}

async function whatCommand(client, db, channel, guildId) {
    const guildData = await datastore.findGuild(db, guildId);
    if (!guildData) {
        return await channel.send('This guild doesn\'t exist in the database.');
    }

    const guild = client.guilds.get(guildId);

    if (!guild) {
        return `\`${guildId}: Not in guild\``;
    }
    
    const descriptionChannelId = guildData.channelId || '0';
    const descriptionChannel = client.channels.get(descriptionChannelId);
    if (!descriptionChannel) {
        return await channel.send(guildDescriptor, {embed: {description: "`[no description defined]`"}});
    }

    const partnerChannelId = guildData.partnerChannelId || '0';
    const partnerChannel = client.channels.get(partnerChannelId);

    const mincount = guildData.meta ? (guildData.meta.mincount || 'not set') : 'not set';
    const tags     = guildData.meta ? (guildData.meta.tags || ['not set']).join(' ') : 'not set';
    const exclude  = guildData.meta ? (guildData.meta.exclude || ['not set']).join(' ') : 'not set';

    const guildIdentifier = `\`• ${guild.id} (${guild.name})\``;
    const guildDescriptor = `${guildIdentifier}\n` +
        `Channel: <#${descriptionChannelId}>\n` +
        `Partner Channel: <#${partnerChannelId}> (${partnerChannel.name})\n` +
        `Minimum Member Count: \`${mincount}\`\n` +
        `Tags: \`${tags}\`\n` +
        `Exclude: \`${exclude}\``;

    const [partnerDescription, createdAt] = await findDescription(descriptionChannel) || '`[no description]`';
    const embedText   = partnerDescription ? partnerDescription : `React to a message in <#${descriptionChannelId}> to set the description.`;
    const embedFooter = `Description | Sent ${createdAt ? createdAt.toLocaleDateString("en-US") : '???'}`;
    
    return await channel.send(guildDescriptor, {embed: {description: embedText, footer: {text: embedFooter}}});
}

async function resolveData(client, currentGuild, guildData) {
    guildData.guild = client.guilds.get(guildData.guildId);
    guildData.channel = currentGuild.channels.get(guildData.channelId);
    guildData.partnerChannel = guildData.guild.channels.get(guildData.partnerChannelId);
    [guildData.description] = await findDescription(guildData.channel);
    return guildData;
}

async function findDescription(channel) {
    const messages = (await channel.fetchMessages({limit: 50})).array();
    for (const message of messages) {
        if (message.reactions.size != 0) return [message.content, message.createdAt];
    }
    return [null, null];
}

function getGuildDescriptor(client, guildData) {
    if (guildData == null) {
        return '`undefined`';
    }

    const guildId = guildData.guildId || '0';
    const guild = client.guilds.get(guildId);

    if (guild == null) {
        return `\`${guildId}: Not in guild\``;
    }
    
    const descriptionChannelId = guildData.channelId || '0';

    const partnerChannelId = guildData.partnerChannelId || '0';
    const partnerChannel = guild.channels.get(partnerChannelId);
    const partnerChannelName = partnerChannel ? partnerChannel.name : 'not cached';

    const guildIdentifier = `\`• ${guild.id} (${guild.name})\``;

    const mincount = guildData.meta ? (guildData.meta.mincount || 'not set') : 'not set';
    const tags     = guildData.meta ? (guildData.meta.tags || ['not set']).join(' ') : 'not set';
    const exclude  = guildData.meta ? (guildData.meta.exclude || ['not set']).join(' ') : 'not set';

    return `${guildIdentifier}\n` +
        `Channel: <#${descriptionChannelId}>\n` +
        `Partner Channel: <#${partnerChannelId}> (${partnerChannelName})\n` +
        `Minimum Member Count: \`${mincount}\`\n` +
        `Tags: \`${tags}\`\n` +
        `Exclude: \`${exclude}\`\n`;
}

function parseChannel(string) {
    let matches;
    matches = CHANNEL_REGEX.exec(string);
    if (matches != null && matches.length == 2) return matches[1];
    matches = SNOWFLAKE_REGEX.exec(string);
    if (matches != null && matches.length == 2) return matches[1];
    return null;
}

async function parseGuild(client, db, string, checkChannel=false) {
    if (string == null) return null;
    let matches;
    if (checkChannel) {
        matches = CHANNEL_REGEX.exec(string);
        if (matches != null && matches.length == 2) {
            const channelId = matches[1];
            const found = await datastore.queryGuilds(db, {channelId});
            if (found.length) return found[0].guildId;
        }
    }
    matches = SNOWFLAKE_REGEX.exec(string);
    if (matches != null && matches.length == 2) {
        return matches[1];
    }
    // try to find guild by name
    string = string.toLowerCase();
    for (const guild of client.guilds.array()) {
        if (guild.name.toLowerCase().startsWith(string)) return guild.id;
    }
    return null;
}

export {handleCommand};
