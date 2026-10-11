const { API, api, connect, disconnect, clearDatabase, createOrg, createLead, createCustomer, futureDate } = require('./helpers');
const { Deal } = require('../src/models');

beforeAll(connect);
afterAll(disconnect);
afterEach(clearDatabase);

async function seed() {
  const org = await createOrg();
  const { exec, teammate, outsider } = org;

  await createLead(exec, { status: 'new' });
  await createLead(exec, { status: 'qualified' });
  await createLead(exec, { status: 'converted' });
  await createLead(exec, { status: 'lost' });
  await createLead(teammate, { status: 'converted' });
  await createLead(outsider, { status: 'new' });

  const customer = await createCustomer(exec);
  const base = { customer: customer._id, createdBy: exec.user._id, expectedCloseDate: futureDate(20) };
  await Deal.create({ ...base, name: 'Open', value: 10000, probability: 50, stage: 'proposal', assignedTo: exec.user._id });
  await Deal.create({ ...base, name: 'Won', value: 30000, probability: 100, stage: 'won', closedAt: new Date(), assignedTo: exec.user._id });
  await Deal.create({ ...base, name: 'Lost', value: 5000, probability: 0, stage: 'lost', assignedTo: teammate.user._id });
  return org;
}

describe('Dashboard', () => {
  test('admin summary covers the whole company', async () => {
    const { admin } = await seed();
    const res = await api().get(`${API}/dashboard/summary`).set(admin.auth).expect(200);

    expect(res.body.data.leads).toMatchObject({ total: 6, new: 2, qualified: 1, converted: 2, lost: 1, conversionRate: 33.33 });
    expect(res.body.data.customers.total).toBe(1);
    expect(res.body.data.deals).toMatchObject({ total: 3, open: 1, won: 1, lost: 1, winRate: 50 });
    expect(res.body.data.revenue).toEqual({ totalRevenue: 30000, expectedRevenue: 5000, pipelineValue: 10000 });
  });

  test('executive summary is limited to their own records', async () => {
    const { exec } = await seed();
    const res = await api().get(`${API}/dashboard/summary`).set(exec.auth).expect(200);
    expect(res.body.data.leads).toMatchObject({ total: 4, converted: 1, conversionRate: 25 });
    expect(res.body.data.deals.total).toBe(2);
  });

  test('team performance is available to managers (own team only) and not to executives', async () => {
    const { manager, exec, outsider, otherManager } = await seed();

    await api().get(`${API}/dashboard/team-performance`).set(exec.auth).expect(403);
    await api().get(`${API}/dashboard/team-performance?manager=${otherManager.id}`).set(manager.auth).expect(403);

    const res = await api().get(`${API}/dashboard/team-performance`).set(manager.auth).expect(200);
    expect(res.body.data.teamSize).toBe(2);
    const memberIds = res.body.data.members.map((m) => m.user._id);
    expect(memberIds).not.toContain(outsider.id);

    const top = res.body.data.members[0];
    expect(top.user._id).toBe(exec.id);
    expect(top.revenue.totalRevenue).toBe(30000);
    expect(top.leads.conversionRate).toBe(25);
  });

  test('revenue trend returns zero-filled months', async () => {
    const { admin } = await seed();
    const res = await api().get(`${API}/dashboard/revenue-trend?months=3`).set(admin.auth).expect(200);
    expect(res.body.data.months).toHaveLength(3);
    expect(res.body.data.totalRevenue).toBe(30000);
  });
});
