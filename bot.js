import dotenv from 'dotenv';
dotenv.config();

import Discord from 'discord.js';
import MongoClient from 'mongodb';

import datastore from './datastore.js';
import { handleCommand } from './commands.js';

const client = new Discord.Client();

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

const COMMAND_PREFIX = 'k!';
  
start();

async function start() {
    const db = await getDatabase(process.env);

    client.on('message', async message => {
        if (!message.content.startsWith(COMMAND_PREFIX)) {
            return;
        }
    
        const substring = message.content.substring(COMMAND_PREFIX.length);
        const segments = substring.match(/[^ "]+|"[^"]+"/g);
        const [subarg, ...args] = segments;
        try {
            await handleCommand(client, db, message, subarg, args);
        } catch (e) {
            message.channel.send('An error occurred while processing this command: ```' + e.message + "```");
            throw e;
        }
    });

    try {
        await client.login(process.env.DISCORD_TOKEN);
    } catch (e) {
        print('Couldn\'t authenticate with Discord:', e);
        process.exit(1);
    }
}

async function getDatabase(config) {
    const {
        MONGO_HOST,
        MONGO_PORT,
        MONGO_USER,
        MONGO_DB,
        MONGO_PASS
    } = config;
    const mongoClient = await MongoClient.connect(
        `mongodb://${MONGO_HOST}:${MONGO_PORT}`,
        {
            auth: {
                user: MONGO_USER,
                password: MONGO_PASS
            }
        }
    );
    return mongoClient.db(MONGO_DB);
}