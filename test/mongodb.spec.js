// TODO: Remove it later
const dotevn = require('dotenv');
const { expect } = require('chai');
const connectToMongoDb = require('../lib/test/connectToMongoDb');

dotevn.config();

connectToMongoDb.setUrl(process.env.STORAGE_MONGODB_URL)
  .setDbName(process.env.STORAGE_MONGODB_DB);

describe('MongoDB', () => {
  let mongoDb;
  connectToMongoDb().then((db) => {
    mongoDb = db;
  });

  it('should ', async () => {
    const expectedData = { test: 1 };

    const collection = mongoDb.collection('testCollection');

    await collection.insertOne(expectedData);
    const [actualData] = await collection.find({}).toArray();

    expect(actualData).to.be.deep.equal(expectedData);
  });
});
