const COLLECTION = 'companion_guilds';

function getCollection(db) {
    return db.collection(COLLECTION);
}

async function getGuilds(db) {
    return await getCollection(db).find({}).toArray();
}

async function findGuild(db, guildId) {
    const found = await getCollection(db).find({guildId: {$eq: guildId}}).toArray();
    return found.length ? found[0] : null;
}

async function queryGuilds(db, query) {
    return await getCollection(db).find(query).toArray();
}

async function addGuild(db, guildData) {
    const {guildId} = guildData;
    const existingData = await findGuild(db, guildId);
    if (existingData) {
        throw new Error('A guild for that id already has an entry!');
    }
    return await getCollection(db).insert(guildData);
}

async function updateGuild(db, guildData) {
    const {guildId} = guildData;
    return await getCollection(db).updateOne({guildId}, {$set: guildData});
}

async function removeGuild(db, guildId) {
    return await getCollection(db).deleteOne({guildId});
}

export default {
    getCollection,
    getGuilds,
    findGuild,
    queryGuilds,
    addGuild,
    updateGuild,
    removeGuild
};