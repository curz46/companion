import EventEmitter from 'events';

export function groupByLength(array, joiner, maxLength) {
    if (array == null || !array.length) return [];
    const newArray = [array[0]];
    array.shift();
    for (let i = 0; i < array.length; i++) {
        const currentLength = newArray
            .map(content => content.length)
            .reduce((a, b) => a + b, 0);
        const element = array[i];
        if ((currentLength + element.length) > maxLength) {
            newArray.push(array);
        } else {
            const index = newArray.length - 1;
            const existingContent = newArray[index];
            newArray[index] = existingContent + joiner + element;
        }
    }
    return newArray;
}

class QuitError extends Error {
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
                if (response.content == 'quit') {
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
                if (response.content == 'quit' || response.content == 'k!add') {
                    throw new QuitError('The user quit the wizard');
                }
                parsed = await Promise.resolve( parser(response.content) );
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
    return true; // check member counts etc
}

export function checkWritePermission(guildData) {
    if (!guildData.guild || !guildData.partnerChannel) return false;
    return guildData.guild.me.permissionsIn(guildData.partnerChannel).has('SEND_MESSAGES');
}