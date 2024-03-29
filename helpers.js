import EventEmitter from 'events';

export function groupByLength(array, joiner, maxLength) {
    if (array == null || !array.length) return [];
    const newArray = [array[0]];
    array.shift();
    for (let i = 0; i < array.length; i++) {
    	const index = newArray.length - 1;
        const element = array[i];
    	const existingContent = newArray[index];
        if ((existingContent.length + element.length) > maxLength) {
            newArray.push(element);
        } else {
            newArray[index] = existingContent + joiner + element;
        }
    }
    console.log(newArray.map(content => content.length));
    return newArray;
}

export class QuitError extends Error {
    constructor(message) {
        super(message);
    }
}

export function createWizard(member, channel, prefix) {
    return {
        send: async content => {
            return await channel.send(prefix + content);
        },
        ask: async (question, errorMessage = 'The value given isn\'t valid, try again.', filter = r => true) => {
            await channel.send(prefix + question);
            let response = null;
            while (response == null || !filter(response.content)) {
                if (response != null) {
                    await channel.send(prefix + errorMessage);
                }
                [response] = (await channel.awaitMessages(
                    m => m.member.id == member.id && m.channel.id == channel.id,
                    {maxMatches: 1}
                )).array();
                if (response.content.startsWith(prefix)) {
                    response = null;
                    continue;
                }
                if (response.content == 'quit' || response.content.startsWith('k!')) {
                    throw new QuitError('The user quiz the wizard');
                }
            }
            return response.content;
        },
        parse: async (question, parser, errorMessage = 'The value given isn\'t valid, try again.', filter = parsed => true) => {
            await channel.send(prefix + question);
            let response = null;
            let parsed   = null;
            while (parsed == null || !filter(parsed)) {
                if (response != null) {
                    await channel.send(prefix + errorMessage);
                }
                [response] = (await channel.awaitMessages(
                    m => m.member.id == member.id && m.channel.id == channel.id,
                    {maxMatches: 1}
                )).array();
                if (response.content.startsWith(prefix)) {
                    response = null;
                    continue;
                }
                if (response.content == 'quit' || response.content.startsWith('k!')) {
                    throw new QuitError('The user quit the wizard');
                }
                try {
                    parsed = await Promise.resolve( parser(response.content) );
                } catch (e) {}
            }
            return parsed;
        },
        explain: async content => {
            await channel.send(prefix + content + '\nNote: You can type `quit` at any point to cancel the wizard.');
        },
        react: async (content, options) => {
            const message = await channel.send(prefix + content);
            for (const option of options) {
                await message.react(option);
            }
            const [reaction] = (await message.awaitReactions((r, u) => options.includes(r.emoji.name) && u.id == member.user.id, {max: 1})).array();
            return reaction.emoji.name;
        }
    };
}

export function isGuildConfigured(guildData) {
    return guildData.guildId && guildData.channelId && guildData.partnerChannelId;
}

const MESSAGE_INTERVAL = 3;
const MESSAGE_INTERVAL_RANGE = 1;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function partnerWithDescription(client, guilds, subjectDescription) {
    const emitter = new EventEmitter();

    let cancelled = false;
    emitter.on('cancel', () => cancelled = true);

    (async function () {
        for (const data of guilds) {
            await delay((MESSAGE_INTERVAL + Math.random() * MESSAGE_INTERVAL_RANGE) * 1000);

            if (cancelled) {
                emitter.emit('cancelled');
                return;
            }

            if (!data.guild || !data.partnerChannel || !data.description) {
                // should never happen
                emitter.emit('failed', [data, 'Guild is improperly configured.']);
                continue;
            }

            if (!checkWritePermission(data)) {
                emitter.emit('failed', [data, 'I don\'t have permission to post in the partners channel.'])
                continue;
            }
    
            try {
                const message = await data.partnerChannel.send(subjectDescription);
                emitter.emit('success', [data, [message]]);
            } catch (e) {
                emitter.emit('failed', [data, 'An error occurred while sending the partner message.']);
            }
        }
        emitter.emit('finished');
    })();

    return emitter;
}

export function partnerWithGuild(client, guilds, subjectGuild) {
    if (!subjectGuild.guild || !subjectGuild.partnerChannel || !subjectGuild.description) {
        throw new Error('Subject is improperly configured.');
    }

    if (!checkWritePermission(subjectGuild)) {
        throw new Error('I don\'t have permission to post in the Subject\'s partners channel.');
    }

    const emitter = new EventEmitter();

    let cancelled = false;
    emitter.on('cancel', () => cancelled = true);

    (async function () {
        for (const data of guilds) {
            await delay((MESSAGE_INTERVAL + Math.random() * MESSAGE_INTERVAL_RANGE) * 1000);

            if (cancelled) {
                emitter.emit('cancelled');
                return;
            }

            if (!data.guild || !data.partnerChannel || !data.description) {
                // should never happen
                emitter.emit('failed', [data, 'Guild is improperly configured.']);
                continue;
            }
    
            if (!checkCompatible(data, subjectGuild)) {
                // should also never happen
                emitter.emit('failed', [data, 'The guild is not compatible with the subject.']);
                continue;
            }
    
            if (!checkWritePermission(data)) {
                emitter.emit('failed', [data, 'I don\'t have permission to post in the partners channel.'])
                continue;
            }
    
            let message;
            try {
                message = await data.partnerChannel.send(subjectGuild.description);
            } catch (e) {
                emitter.emit('failed', [data, 'An error occurred while sending the partner message.']);
                continue;
            }

            try {
                const otherMessage = await subjectGuild.partnerChannel.send(data.description);
                emitter.emit('success', [data, [message, otherMessage]]);
            } catch (e) {
                emitter.emit('failed', [subject, 'An error occurred while sending the partner message to the subject. The other partner message will be deleted.']);
                await message.delete();
            }
        }
        emitter.emit('finished');
    })();

    return emitter;
}

export function checkCompatible(guildA, guildB) {
    console.log('checking compatible: ' + guildA.guild.name + ', ' + guildB.guild.name);

    if (!isGuildConfigured(guildA) || !isGuildConfigured(guildB)) return false;
    if (!guildA.meta && !guildB.meta) return true;

    const metaA = guildA.meta || {};
    const metaB = guildB.meta || {};

    if (metaA.mincount && guildB.guild.memberCount < metaA.mincount) {
        console.log('guildB memberCount too small');
        return false;
    }
    if (metaB.mincount && guildA.guild.memberCount < metaB.mincount) {
        console.log('guildA memberCount too small');
        return false;
    }
    if (metaA.tags && metaB.exclude) {
        for (const tag of metaA.tags) {
            if (metaB.exclude.includes(tag)) {
                console.log('metaB excludes tag: ' + tag);
                return false;
            }
        }
    }
    if (metaB.tags && metaA.exclude) {
        for (const tag of metaB.tags) {
            if (metaA.exclude.includes(tag)) {
                console.log('metaA excludes tag: ' + tag);
                return false;
            }
        }
    }
    return true;
}

export function checkWritePermission(guildData) {
    if (!guildData.guild || !guildData.partnerChannel) return false;
    return guildData.guild.me.permissionsIn(guildData.partnerChannel).has('SEND_MESSAGES');
}
