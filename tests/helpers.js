const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/app');
const { User, Lead, Customer } = require('../src/models');
const tokenService = require('../src/services/token.service');
const configService = require('../src/services/config.service');

const API = '/api/v1';
let counter = 0;

async function connect() {
  const dbName = `crm_test_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  await mongoose.connect(process.env.MONGODB_URI, { dbName });
  // Build indexes up front: unique constraints are part of the behaviour under test.
  await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()));
}

async function disconnect() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

async function clearDatabase() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
  configService.clearCache();
}

/** Creates a user directly and returns it with a valid access token. */
async function createUser(role, overrides = {}) {
  counter += 1;
  const user = await User.create({
    name: `${role.replace('_', ' ')} ${counter}`,
    email: `${role}.${counter}@test.dev`,
    password: 'Passw0rd!',
    role,
    ...overrides,
  });
  const token = tokenService.generateAccessToken(user);
  return { user, id: String(user._id), token, auth: { Authorization: `Bearer ${token}` } };
}

/** admin, two managers, executives in each team and one without a manager. */
async function createOrg() {
  const admin = await createUser('admin');
  const manager = await createUser('sales_manager');
  const otherManager = await createUser('sales_manager');
  const exec = await createUser('sales_executive', { manager: manager.user._id });
  const teammate = await createUser('sales_executive', { manager: manager.user._id });
  const outsider = await createUser('sales_executive', { manager: otherManager.user._id });
  return { admin, manager, otherManager, exec, teammate, outsider };
}

async function createLead(owner, overrides = {}) {
  counter += 1;
  return Lead.create({
    name: `Lead ${counter}`,
    email: `lead.${counter}@acme.test`,
    company: 'Acme',
    source: 'website',
    assignedTo: owner.user._id,
    createdBy: owner.user._id,
    ...overrides,
  });
}

async function createCustomer(owner, overrides = {}) {
  counter += 1;
  return Customer.create({
    name: `Customer ${counter}`,
    email: `customer.${counter}@globex.test`,
    assignedTo: owner.user._id,
    createdBy: owner.user._id,
    ...overrides,
  });
}

const futureDate = (days = 30) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const pastDate = (days = 2) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const api = () => request(app);

module.exports = {
  API,
  app,
  api,
  connect,
  disconnect,
  clearDatabase,
  createUser,
  createOrg,
  createLead,
  createCustomer,
  futureDate,
  pastDate,
};
