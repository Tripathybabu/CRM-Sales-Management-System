/* eslint-disable no-console */
/**
 * Seeds a demo organisation through the service layer, so every record gets the same
 * validation, business rules and timeline entries as data created through the API.
 *
 *   npm run seed          -> seed only if the database has no users
 *   npm run seed:fresh    -> wipe all CRM collections first
 */
const mongoose = require('mongoose');
const env = require('../src/config/env');
const { connectDatabase } = require('../src/config/database');
const models = require('../src/models');
const leadService = require('../src/services/lead.service');
const conversionService = require('../src/services/conversion.service');
const dealService = require('../src/services/deal.service');
const activityService = require('../src/services/activity.service');
const configService = require('../src/services/config.service');

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@crm.dev';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || 'Passw0rd!';

const daysFromNow = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);
const actorOf = (user) => ({ _id: user._id, id: String(user._id), name: user.name, email: user.email, role: user.role });

async function createUsers() {
  const { User } = models;
  const admin = await User.create({ name: 'Ada Admin', email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'admin', phone: '+919900000001' });
  const [north, south] = await User.create([
    { name: 'Maya Manager', email: 'maya.manager@crm.dev', password: DEFAULT_PASSWORD, role: 'sales_manager', phone: '+919900000002' },
    { name: 'Sam Manager', email: 'sam.manager@crm.dev', password: DEFAULT_PASSWORD, role: 'sales_manager', phone: '+919900000003' },
  ]);
  const execs = await User.create([
    { name: 'Esha Executive', email: 'esha.exec@crm.dev', password: DEFAULT_PASSWORD, role: 'sales_executive', manager: north._id },
    { name: 'Arjun Executive', email: 'arjun.exec@crm.dev', password: DEFAULT_PASSWORD, role: 'sales_executive', manager: north._id },
    { name: 'Nina Executive', email: 'nina.exec@crm.dev', password: DEFAULT_PASSWORD, role: 'sales_executive', manager: south._id },
    { name: 'Omar Executive', email: 'omar.exec@crm.dev', password: DEFAULT_PASSWORD, role: 'sales_executive', manager: south._id },
  ]);
  return { admin, managers: [north, south], execs };
}

const LEADS = [
  { name: 'Rahul Mehta', company: 'Acme Corp', source: 'website', priority: 'high', status: 'qualified', convert: { value: 48000, stage: 'negotiation', close: 20, outcome: 'won' } },
  { name: 'Priya Nair', company: 'Globex', source: 'referral', priority: 'high', status: 'qualified', convert: { value: 32000, stage: 'proposal', close: 35 } },
  { name: 'Karan Shah', company: 'Initech', source: 'social_media', priority: 'medium', status: 'qualified', convert: { value: 15000, stage: 'discovery', close: 50, outcome: 'lost' } },
  { name: 'Meera Iyer', company: 'Umbrella Ltd', source: 'email', priority: 'medium', status: 'qualified', convert: { value: 27000, stage: 'qualification', close: 60 } },
  { name: 'Dev Patel', company: 'Hooli', source: 'website', priority: 'high', status: 'qualified', convert: { value: 61000, stage: 'negotiation', close: 15, outcome: 'won' } },
  { name: 'Ananya Rao', company: 'Stark Industries', source: 'phone', priority: 'low', status: 'qualified' },
  { name: 'Vivek Kumar', company: 'Wayne Enterprises', source: 'referral', priority: 'medium', status: 'contacted' },
  { name: 'Sara Thomas', company: 'Wonka Inc', source: 'website', priority: 'low', status: 'new' },
  { name: 'Imran Ali', company: 'Cyberdyne', source: 'other', priority: 'medium', status: 'unqualified' },
  { name: 'Lea Martin', company: 'Soylent', source: 'email', priority: 'high', status: 'lost', reason: 'No budget this year' },
  { name: 'Tom Becker', company: 'Tyrell Corp', source: 'social_media', priority: 'medium', status: 'new' },
  { name: 'Zoya Khan', company: 'Massive Dynamic', source: 'website', priority: 'high', status: 'contacted' },
];

const STATUS_PATH = {
  new: [],
  contacted: ['contacted'],
  qualified: ['contacted', 'qualified'],
  unqualified: ['contacted', 'unqualified'],
  lost: ['contacted', 'lost'],
};

async function seedPipeline({ admin, managers, execs }) {
  const counts = { leads: 0, customers: 0, deals: 0, activities: 0 };

  for (const [index, spec] of LEADS.entries()) {
    const owner = execs[index % execs.length];
    const ownerActor = actorOf(owner);
    const manager = actorOf(managers.find((m) => String(m._id) === String(owner.manager)));
    const slug = spec.name.toLowerCase().replace(/\s+/g, '.');

    const lead = await leadService.createLead(
      {
        name: spec.name,
        email: `${slug}@${spec.company.toLowerCase().replace(/\s+/g, '')}.example`,
        phone: `+9198${String(10000000 + index * 7919).slice(0, 8)}`,
        company: spec.company,
        source: spec.source,
        priority: spec.priority,
        description: `Interested in the ${spec.priority === 'high' ? 'enterprise' : 'growth'} plan`,
      },
      ownerActor,
    );
    counts.leads += 1;

    for (const status of STATUS_PATH[spec.status]) {
      await leadService.updateLeadStatus(lead._id, { status, reason: spec.reason }, ownerActor);
    }

    await activityService.createActivity(
      { type: 'note', title: 'Discovery notes', description: 'Main pain point: manual pipeline reporting.', relatedType: 'lead', relatedId: lead._id },
      ownerActor,
    );
    await activityService.createActivity(
      { type: 'follow_up', title: `Follow up with ${spec.name}`, dueDate: daysFromNow(2 + index), relatedType: 'lead', relatedId: lead._id },
      ownerActor,
    );
    counts.activities += 2;

    if (!spec.convert) continue;

    const { deal } = await conversionService.convertLead(
      lead._id,
      {
        customer: { address: { city: ['Bengaluru', 'Mumbai', 'Pune', 'Delhi'][index % 4], country: 'India' } },
        deal: { name: `${spec.company} - CRM licence`, value: spec.convert.value, expectedCloseDate: daysFromNow(spec.convert.close), stage: spec.convert.stage },
      },
      ownerActor,
    );
    counts.customers += 1;
    counts.deals += 1;

    await activityService.createActivity(
      { type: 'meeting', title: 'Proposal walkthrough', dueDate: daysFromNow(5 + index), relatedType: 'deal', relatedId: deal._id },
      ownerActor,
    );
    counts.activities += 1;

    if (spec.convert.outcome === 'won') {
      await dealService.changeStage(deal._id, { stage: 'won' }, manager);
    } else if (spec.convert.outcome === 'lost') {
      await dealService.changeStage(deal._id, { stage: 'lost', lostReason: 'Chose a competitor on price' }, ownerActor);
    }
  }

  // One overdue task (inserted directly because the API rightly refuses past due dates).
  await models.Activity.create({
    type: 'call',
    title: 'Call back about pricing (overdue)',
    dueDate: daysFromNow(-2),
    assignedTo: execs[0]._id,
    createdBy: admin._id,
  });
  counts.activities += 1;

  return counts;
}

async function main() {
  const fresh = process.argv.includes('--fresh');
  await connectDatabase();

  if (env.isProduction && fresh) {
    throw new Error('Refusing to wipe a production database');
  }

  // Ensure indexes exist (autoIndex is disabled in production).
  await Promise.all(Object.values(models).map((model) => model.syncIndexes()));

  if (fresh) {
    await Promise.all(Object.values(models).map((model) => model.deleteMany({})));
    configService.clearCache();
    console.log('Cleared existing data');
  } else if (await models.User.exists({})) {
    console.log('Database already contains users; run "npm run seed:fresh" to reset it.');
    return;
  }

  await configService.getConfig();
  const users = await createUsers();
  const counts = await seedPipeline(users);

  console.log('\nSeed complete:', counts);
  console.log('\nLogin credentials');
  console.table([
    { role: 'admin', email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    { role: 'sales_manager', email: 'maya.manager@crm.dev', password: DEFAULT_PASSWORD },
    { role: 'sales_manager', email: 'sam.manager@crm.dev', password: DEFAULT_PASSWORD },
    { role: 'sales_executive', email: 'esha.exec@crm.dev', password: DEFAULT_PASSWORD },
    { role: 'sales_executive', email: 'arjun.exec@crm.dev', password: DEFAULT_PASSWORD },
    { role: 'sales_executive', email: 'nina.exec@crm.dev', password: DEFAULT_PASSWORD },
    { role: 'sales_executive', email: 'omar.exec@crm.dev', password: DEFAULT_PASSWORD },
  ]);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
