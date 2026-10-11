const { API, api, connect, disconnect, clearDatabase, createOrg, createLead, createCustomer, futureDate, pastDate } = require('./helpers');
const { Lead, Customer, Deal, TimelineEvent } = require('../src/models');

beforeAll(connect);
afterAll(disconnect);
afterEach(clearDatabase);

const dealPayload = () => ({ name: 'Enterprise plan', value: 48000, expectedCloseDate: futureDate(45), stage: 'discovery' });

describe('Lead conversion', () => {
  test('only qualified leads can be converted', async () => {
    const { exec } = await createOrg();
    const lead = await createLead(exec, { status: 'contacted' });

    const res = await api().post(`${API}/leads/${lead._id}/convert`).set(exec.auth).send({}).expect(422);
    expect(res.body.message).toMatch(/Only qualified leads/);
  });

  test('converts a qualified lead into a customer and a deal with full lineage', async () => {
    const { exec } = await createOrg();
    const lead = await createLead(exec, { status: 'qualified', company: 'Acme Corp' });

    const res = await api()
      .post(`${API}/leads/${lead._id}/convert`)
      .set(exec.auth)
      .send({ customer: { address: { city: 'Pune', country: 'India' } }, deal: dealPayload() })
      .expect(201);

    const { lead: convertedLead, customer, deal } = res.body.data;
    expect(convertedLead.status).toBe('converted');
    expect(convertedLead.customer._id).toBe(customer._id);
    expect(convertedLead.deal._id).toBe(deal._id);

    expect(customer.lead._id).toBe(String(lead._id));
    expect(customer.company).toBe('Acme Corp');
    expect(customer.assignedTo._id).toBe(exec.id);

    expect(deal.lead._id).toBe(String(lead._id));
    expect(deal.customer._id).toBe(customer._id);
    expect(deal.probability).toBe(25); // configured default for "discovery"
    expect(deal.expectedRevenue).toBe(12000);

    const actions = (await TimelineEvent.find({ lead: lead._id })).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['lead_status_changed', 'customer_created', 'deal_created', 'lead_converted']));
  });

  test('a converted lead cannot be converted again', async () => {
    const { exec } = await createOrg();
    const lead = await createLead(exec, { status: 'qualified' });

    await api().post(`${API}/leads/${lead._id}/convert`).set(exec.auth).send({}).expect(201);
    const res = await api().post(`${API}/leads/${lead._id}/convert`).set(exec.auth).send({}).expect(409);
    expect(res.body.message).toBe('Lead has already been converted');
  });

  test('concurrent conversions of the same lead produce exactly one customer', async () => {
    const { exec } = await createOrg();
    const lead = await createLead(exec, { status: 'qualified' });

    const results = await Promise.all(
      Array.from({ length: 4 }, () => api().post(`${API}/leads/${lead._id}/convert`).set(exec.auth).send({ deal: dealPayload() })),
    );

    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(3);
    expect(await Customer.countDocuments({ lead: lead._id })).toBe(1);
    expect(await Deal.countDocuments({ lead: lead._id })).toBe(1);
  });

  test('a failure during conversion rolls back every write', async () => {
    const { exec } = await createOrg();
    const lead = await createLead(exec, { status: 'qualified', email: 'taken@acme.test' });
    await createCustomer(exec, { email: 'taken@acme.test' }); // forces a duplicate-key error mid-transaction

    const res = await api().post(`${API}/leads/${lead._id}/convert`).set(exec.auth).send({ deal: dealPayload() }).expect(409);
    expect(res.body.code).toBe('DUPLICATE_RESOURCE');

    const reloaded = await Lead.findById(lead._id);
    expect(reloaded.status).toBe('qualified');
    expect(reloaded.customer).toBeNull();
    expect(await Deal.countDocuments({})).toBe(0);
    expect(await TimelineEvent.countDocuments({ action: 'lead_converted' })).toBe(0);
  });

  test('deal rules are validated before anything is written', async () => {
    const { exec } = await createOrg();
    const lead = await createLead(exec, { status: 'qualified' });

    await api()
      .post(`${API}/leads/${lead._id}/convert`)
      .set(exec.auth)
      .send({ deal: { ...dealPayload(), expectedCloseDate: pastDate(3) } })
      .expect(422);
    await api()
      .post(`${API}/leads/${lead._id}/convert`)
      .set(exec.auth)
      .send({ deal: { ...dealPayload(), value: 0 } })
      .expect(400);

    expect((await Lead.findById(lead._id)).status).toBe('qualified');
    expect(await Customer.countDocuments({})).toBe(0);
  });

  test('executives cannot convert leads that are not theirs', async () => {
    const { exec, teammate } = await createOrg();
    const lead = await createLead(teammate, { status: 'qualified' });
    await api().post(`${API}/leads/${lead._id}/convert`).set(exec.auth).send({}).expect(404);
  });
});
