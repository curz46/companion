export function groupByLength(array, joiner, maxLength) {
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

export function createWizard(member, channel, prefix) {
    return {
        send: async content => {
            return await channel.send(prefix + content);
        },
        ask: async (question, filter = r => true) => {
            await channel.send(prefix + question);
            let response = null;
            while (response == null || !filter(response)) {
                response = await channel.awaitMessages(
                    m => filter(m) && m.member.id == member.id && m.channel.id == channel.id,
                    {maxMatches: 1}
                );
                if (response.content == 'quit') {
                    throw new Error('The user quiz the wizard');
                }
            }
            return response;
        },
        parse: async (question, parser, errorMessage = 'The value given isn\'t valid - try again.', filter = parsed => true) => {
            await channel.send(prefix + question);
            let response = null;
            let parsed   = null;
            while (parsed == null || !filter(parsed)) {
                if (response != null) {
                    channel.send(prefix + (errorMessage || 'The value you gave isn\'t valid, try again.'));
                }
                [response] = (await channel.awaitMessages(
                    m => m.member.id == member.id && m.channel.id == channel.id,
                    {maxMatches: 1}
                )).array();
                if (response.content == 'quit' || response.content == 'k!add') {
                    throw new Error('The user quit the wizard');
                }
                parsed = await Promise.resolve( parser(response.content) );
            }
            return parsed;
        },
        explain: async content => {
            await channel.send(prefix + content + '\nNote: You can type `quit` at any point to cancel the wizard.');
        }
    };
}

export function isGuildConfigured(guildData) {
    return guildData.guildId && guildData.channelId && guildData.partnerChannelId;
}

export async function partnerWithDescription(client, guilds, subjectDescription) {
    const succeeded = [];
    const failed    = [];

    for (const data of guilds) {
        if (!data.guild || !data.partnerChannel || !data.description) {
            throw new Error('Partner guild is improperly configured.');
        }

        if (!checkCompatible(data, subjectGuild)) {
            failed.add([data, 'The guild is not compatible with the subject.']);
            continue;
        }

        if (!checkWritePermission(data)) {
            failed.add([data, 'I don\'t have permission to post in the partners channel.'])
            continue;
        }

        try {
            const message = await data.partnerChannel.send(subjectDescription);
            succeeded.push([data, message]);
        } catch (e) {
            failed.add([data, 'An error occurred while sending the partner message.']);
            continue;
        }
    }

    return [succeeded, failed];
}

export async function partnerWithGuild(client, guilds, subjectGuild) {
    if (!subjectGuild.guild || !subjectGuild.partnerChannel || !subjectGuild.description) {
        throw new Error('Subject guild is improperly configured.');
    }

    const succeeded = [];
    const failed    = [];

    for (const data of guilds) {
        if (!data.guild || !data.partnerChannel || !data.description) {
            throw new Error('Partner guild is improperly configured.');
        }

        if (!checkCompatible(data, subjectGuild)) {
            failed.add([data, 'The guild is not compatible with the subject.']);
            continue;
        }

        if (!checkWritePermission(data)) {
            failed.add([data, 'I don\'t have permission to post in the partners channel.'])
            continue;
        }

        try {
            const message = await data.partnerChannel.send(subjectGuild.description);
            succeeded.push([data, message]);
        } catch (e) {
            failed.add([data, 'An error occurred while sending the partner message.']);
            continue;
        }
    }

    return [succeeded, failed];
}

export function checkCompatible(guildA, guildB) {
    return true; // check member counts etc
}

export function checkWritePermission(guildData) {
    if (!guildData.guild || !guildData.partnerChannel) return false;
    return guildData.guild.me.permissionsIn(guildData.partnerChannel).has('SEND_MESSAGES');
}