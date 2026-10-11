const { MongoMemoryReplSet } = require('mongodb-memory-server');

// A single-node replica set: transactions are part of the system under test.
module.exports = async () => {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  globalThis.__MONGO_REPLSET__ = replSet;
  process.env.TEST_MONGODB_URI = replSet.getUri();
};
