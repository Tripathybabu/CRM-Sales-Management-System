const { API, api, connect, disconnect, clearDatabase, createOrg, createCustomer, futureDate, pastDate } = require('./helpers');
const { TimelineEvent } = require('../src/models');

beforeAll(connect);
afterAll(disconnect);
afterEach(clearDatabase);

async function setup() {
  const org = await createOrg();
  const customer = await createCustomer(org.exec);
  const createDeal = (overrides = {}) =>
    api()
      .post(`${API}/deals`)
      .set(org.exec.auth)
      .send({ name: 'Annual licence', customer: String(customer._id), value: 20000, expectedCloseDate: futureDate(30), stage: 'proposal', ...overrides });
  return { ...org, customer, createDeal };
}

describe('Deals', () => {
  test('value must be > 0, probability within 0–100 and expectedRevenue cannot be supplied', async () => {
    const { createDeal } = await setup();
    await createDeal({ value: 0 }).expect(400);
    await createDeal({ value: -5 }).expect(400);
    await createDeal({ probability: 150 }).expect(400);
    await createDeal({ expectedRevenue: 999999 }).expect(400);
  });

  test('expected revenue is computed by the server and stage probability defaults apply', async () => {
    const { createDeal, customer, exec } = await setup();
    const res = await createDeal().expect(201);

    expect(res.body.data.probability).toBe(50);
    expect(res.body.data.expectedRevenue).toBe(10000);
    expect(res.body.data.status).toBe('open');
    expect(res.body.data.customer._id).toBe(String(customer._id));

    const updated = await api().patch(`${API}/deals/${res.body.data._id}`).set(exec.auth).send({ probability: 80 }).expect(200);
    expect(updated.body.data.expectedRevenue).toBe(16000);
  });

  test('expected close date cannot be in the past', async () => {
    const { createDeal } = await setup();
    const res = await createDeal({ expectedCloseDate: pastDate(1) }).expect(422);
    expect(res.body.errors[0].field).toBe('expectedCloseDate');
  });

  test('deals cannot be created in a closed stage', async () => {
    const { createDeal } = await setup();
    await createDeal({ stage: 'won' }).expect(400);
  });

  test('a lost deal requires a reason', async () => {
    const { createDeal, exec } = await setup();
    const deal = (await createDeal().expect(201)).body.data;

    await api().patch(`${API}/deals/${deal._id}/stage`).set(exec.auth).send({ stage: 'lost' }).expect(400);
    const res = await api()
      .patch(`${API}/deals/${deal._id}/stage`)
      .set(exec.auth)
      .send({ stage: 'lost', lostReason: 'Budget cut' })
      .expect(200);

    expect(res.body.data).toMatchObject({ stage: 'lost', status: 'lost', probability: 0, expectedRevenue: 0, lostReason: 'Budget cut' });
    expect(await TimelineEvent.exists({ deal: deal._id, action: 'deal_lost' })).toBeTruthy();
  });

  test('closed deals cannot move freely: won→lost is blocked and reopening needs a manager and a reason', async () => {
    const { createDeal, exec, manager } = await setup();
    const deal = (await createDeal().expect(201)).body.data;

    const won = await api().patch(`${API}/deals/${deal._id}/stage`).set(exec.auth).send({ stage: 'won', finalValue: 21000 }).expect(200);
    expect(won.body.data).toMatchObject({ stage: 'won', probability: 100, value: 21000, expectedRevenue: 21000 });
    expect(won.body.data.closedAt).toBeTruthy();

    await api().patch(`${API}/deals/${deal._id}/stage`).set(exec.auth).send({ stage: 'lost', lostReason: 'Oops' }).expect(422);
    await api().patch(`${API}/deals/${deal._id}/stage`).set(exec.auth).send({ stage: 'negotiation', reopenReason: 'Please' }).expect(403);
    await api().patch(`${API}/deals/${deal._id}/stage`).set(manager.auth).send({ stage: 'negotiation' }).expect(422);

    const reopened = await api()
      .patch(`${API}/deals/${deal._id}/stage`)
      .set(manager.auth)
      .send({ stage: 'negotiation', reopenReason: 'Customer renegotiating scope' })
      .expect(200);
    expect(reopened.body.data).toMatchObject({ stage: 'negotiation', status: 'open', probability: 75, closedAt: null });
    expect(await TimelineEvent.exists({ deal: deal._id, action: 'deal_reopened' })).toBeTruthy();
  });

  test('closed deals only allow description changes', async () => {
    const { createDeal, exec } = await setup();
    const deal = (await createDeal().expect(201)).body.data;
    await api().patch(`${API}/deals/${deal._id}/stage`).set(exec.auth).send({ stage: 'won' }).expect(200);

    await api().patch(`${API}/deals/${deal._id}`).set(exec.auth).send({ value: 1 }).expect(422);
    await api().patch(`${API}/deals/${deal._id}`).set(exec.auth).send({ description: 'Signed on 1 Nov' }).expect(200);
  });

  test('users cannot modify deals outside their scope', async () => {
    const { createDeal, teammate, outsider, manager, otherManager } = await setup();
    const deal = (await createDeal().expect(201)).body.data;

    await api().patch(`${API}/deals/${deal._id}`).set(teammate.auth).send({ value: 1 }).expect(404);
    await api().patch(`${API}/deals/${deal._id}/stage`).set(outsider.auth).send({ stage: 'won' }).expect(404);
    await api().patch(`${API}/deals/${deal._id}/stage`).set(otherManager.auth).send({ stage: 'won' }).expect(404);
    await api().patch(`${API}/deals/${deal._id}/stage`).set(manager.auth).send({ stage: 'negotiation' }).expect(200);
  });

  test('list supports stage, status and amount range filters', async () => {
    const { createDeal, exec } = await setup();
    await createDeal({ name: 'Small', value: 1000 }).expect(201);
    await createDeal({ name: 'Medium', value: 5000, stage: 'negotiation' }).expect(201);
    await createDeal({ name: 'Large', value: 90000 }).expect(201);

    const res = await api().get(`${API}/deals?minAmount=2000&maxAmount=100000&stage=proposal,negotiation&status=open&sort=-value`).set(exec.auth).expect(200);
    expect(res.body.data.map((d) => d.name)).toEqual(['Large', 'Medium']);

    await api().get(`${API}/deals?minAmount=500&maxAmount=100`).set(exec.auth).expect(400);
  });

  test('pipeline returns count and value for every stage', async () => {
    const { createDeal, exec } = await setup();
    await createDeal({ value: 1000, stage: 'qualification' }).expect(201);
    await createDeal({ value: 3000, stage: 'qualification' }).expect(201);
    const toWin = (await createDeal({ value: 5000 }).expect(201)).body.data;
    await api().patch(`${API}/deals/${toWin._id}/stage`).set(exec.auth).send({ stage: 'won' }).expect(200);

    const res = await api().get(`${API}/dashboard/pipeline`).set(exec.auth).expect(200);
    const stages = Object.fromEntries(res.body.data.stages.map((s) => [s.stage, s]));
    expect(res.body.data.stages.map((s) => s.stage)).toEqual(['qualification', 'discovery', 'proposal', 'negotiation', 'won', 'lost']);
    expect(stages.qualification).toMatchObject({ count: 2, totalValue: 4000, weightedValue: 400 });
    expect(stages.won).toMatchObject({ count: 1, totalValue: 5000 });
    expect(stages.lost.count).toBe(0);
  });
});
