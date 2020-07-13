import datastore from './datastore.js';
import { groupByLength } from './helpers.js';

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
        let guild;
        if (message.mentions.channels.size) {
            const descriptionChannel = message.guild.channels.get(query);
            if (!descriptionChannel) {
                return message.channel.send('Error: No matching channels for that query string.');
            }
            const [found] = await datastore.queryGuilds(db, {channelId: query});
            if (found) guild = found.guildId;
        } else {
            guild = await parseGuild(client, db, query, true);
        }
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
        const descriptionChannel = message.guild.channels.get(channelQuery); 
        if (!descriptionChannel) {
            return message.channel.send('Error: No matching channels for that query string.');
        }
        return setChannelCommand(client, db, message.channel, guildId, channelQuery);
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
        const partnerChannel = message.guild.channels.get(channelQuery); 
        if (!partnerChannel) {
            return message.channel.send('Error: No matching channels for that query string.');
        }
        return setPartnerChannelCommand(client, db, message.channel, guildId, channelQuery);
    }
    if (subcmd == 'kill') {
        await message.channel.send('Killing...');
        process.exit(1);
    }
    
    return message.channel.send('Unrecognised subargument. Use `k!help` for help.');
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
    const prefix = '`[ADD WIZARD]` ';
    const filter = m => m.author.id == message.author.id && m.channel.id == message.channel.id;
    let response, matches;

    const checkQuit = m => m == null || m.content.toLowerCase().includes('quit');
    const getResponse = async () => (await channel.awaitMessages(filter, {maxMatches: 1})).array();

    try {
        await channel.send(prefix + 'You\'re using the add wizard. Type `quit` at any point to cancel.');
        
        await channel.send(prefix + 'Choose a guild. You can use the name or its id.');
        let [response] = await getResponse();
        if (checkQuit(response)) return await channel.send(prefix + "Wizard cancelled.");
        
        const guildId = await parseGuild(client, db, response.content);
        const guild = client.guilds.get(guildId);
        if (!guild) return await channel.send(prefix + 'Cannot find that guild.');

        await channel.send(`${prefix} guildId = \`${guildId} (${guild.name})\``);
        await channel.send(prefix + 'Pick a description channel. Can use #channel or id.');
        [response] = await getResponse();
        if (checkQuit(response)) return await channel.send(prefix + 'Wizard cancelled.');

        const descriptionChannelId = parseChannel(response.content);
        console.log(descriptionChannelId);
        const descriptionChannel = message.guild.channels.get(descriptionChannelId);
        if (!descriptionChannel) return await channel.send(prefix + 'Cannot find that channel.');
        
        await channel.send(prefix + 'channelId = `' + descriptionChannelId + '`');
        await channel.send(prefix + 'Pick a partner channel. Can use #channel or id.');
        [response] = await getResponse();
        if (checkQuit(response)) return await channel.send(prefix + 'Wizard cancelled.');

        const partnerChannelId = parseChannel(response.content);
        const partnerChannel = guild.channels.get(partnerChannelId);
        if (!partnerChannel) return await channel.send(prefix + 'Cannot find that channel.');

        await channel.send(`${prefix}partnerChannelId = \`${partnerChannelId} (${partnerChannel.name})\``);
        await datastore.addGuild(db, {guildId, channelId: descriptionChannelId, partnerChannelId});
        return await channel.send(prefix + 'Added guild to database.');
    } catch (e) {
        throw e;
        return await channel.send('Add wizard expired, re-run `k!add` if you still want to add a guild.');
    }
}

async function allCommand(client, db, channel) {
    const guilds = await datastore.getGuilds(db);
    if (!guilds.length) {
        return await channel.send('There are no guilds in the database.');
    }
    let descriptors = guilds.map(guildData => getGuildDescriptor(client, guildData));
    descriptors.push('Note: description is omitted when using `k!all`. use `k!what` to see description.');
    for (const content of groupByLength(descriptors, '\n', 2000)) {
        await channel.send(content)
    }
}

async function whatCommand(client, db, channel, guildId) {
    const guildData = await datastore.findGuild(db, guildId);
    if (!guildData) {
        return await channel.send('This guild doesn\'t exist in the database.');
    }

    const guild = client.guilds.get(guildId);
    
    const descriptionChannelId = guildData.channelId || '0';
    const descriptionChannel = client.channels.get(descriptionChannelId);

    const partnerChannelId = guildData.partnerChannelId || '0';
    const partnerChannel = client.channels.get(partnerChannelId);
    if (!partnerChannel) {
        return await channel.send(guildDescriptor, {embed: {description: "`[no description]`"}});
    }

    const guildIdentifier = `\`• ${guild.id} (${guild.name})\``;
    const guildDescriptor = `${guildIdentifier}\n` +
        `Channel: <#${descriptionChannelId}>\n` +
        `Partner Channel: <#${partnerChannelId}> (${partnerChannel.name})\n`;

    const [partnerDescription, createdAt] = await findDescription(descriptionChannel) || '`[no description]`';
    const footer = `Description | Sent ${createdAt.toLocaleDateString("en-US")}`
    return await channel.send(guildDescriptor, {embed: {description: partnerDescription, footer: {text: footer}}});
}

async function findDescription(channel) {
    const messages = (await channel.fetchMessages({limit: 50})).array();
    for (const message of messages) {
        if (message.reactions.size != 0) return [message.content, message.createdAt];
    }
    return null;
}

function getGuildDescriptor(client, guildData) {
    if (guildData == null) {
        return '`undefined`';
    }

    const guildId = guildData.guildId || '0';
    const guild = client.guilds.get(guildId);

    if (guild == null) {
        return '`not in guild`';
    }
    
    const channelId = guildData.channelId || '0';

    const partnerChannelId = guildData.partnerChannelId || '0';
    const partnerChannel = guild.channels.get(partnerChannelId);
    const partnerChannelName = partnerChannel ? partnerChannel.name : 'not cached';

    const guildIdentifier = `\`• ${guild.id} (${guild.name})\``;

    return `${guildIdentifier}\n` +
        `Channel: <#${channelId}>\n` +
        `Partner Channel: <#${partnerChannelId}> (${partnerChannelName})\n`;
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
            const found = db.queryGuilds(db, {channelId});
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