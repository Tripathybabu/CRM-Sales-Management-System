const { API, api, connect, disconnect, clearDatabase, createOrg, createLead, createUser } = require('./helpers');
const { TimelineEvent } = require('../src/models');

beforeAll(connect);
afterAll(disconnect);
afterEach(clearDatabase);

describe('Leads', () => {
  test('an executive creating a lead becomes its owner and the creation is audited', async () => {
    const { exec } = await createOrg();
    const res = await api()
      .post(`${API}/leads`)
      .set(exec.auth)
      .send({ name: 'Rahul Mehta', email: 'Rahul@Acme.io', phone: '+91 98000-00001', source: 'website', priority: 'high' })
      .expect(201);

    expect(res.body.data.assignedTo._id).toBe(exec.id);
    expect(res.body.data.email).toBe('rahul@acme.io');
    expect(res.body.data.phone).toBe('+919800000001');
    expect(res.body.data.status).toBe('new');

    const actions = (await TimelineEvent.find({ lead: res.body.data._id })).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['lead_created', 'lead_assigned']));
  });

  test('server-owned fields cannot be mass-assigned', async () => {
    const { exec } = await createOrg();
    const res = await api()
      .post(`${API}/leads`)
      .set(exec.auth)
      .send({ name: 'Sneaky', email: 'sneaky@test.dev', status: 'converted' })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('validation: email or phone required, enums and ObjectIds are checked', async () => {
    const { exec } = await createOrg();
    await api().post(`${API}/leads`).set(exec.auth).send({ name: 'No Contact' }).expect(400);
    await api().post(`${API}/leads`).set(exec.auth).send({ name: 'Bad Src', email: 'a@b.io', source: 'tv' }).expect(400);
    await api().get(`${API}/leads/not-an-id`).set(exec.auth).expect(400);
  });

  test('executives only access their own leads; other records return 404', async () => {
    const { exec, teammate } = await createOrg();
    const lead = await createLead(teammate);

    await api().get(`${API}/leads/${lead._id}`).set(exec.auth).expect(404);
    await api().patch(`${API}/leads/${lead._id}`).set(exec.auth).send({ priority: 'high' }).expect(404);
    const list = await api().get(`${API}/leads`).set(exec.auth).expect(200);
    expect(list.body.data).toHaveLength(0);
  });

  test('managers see their team leads but not other teams', async () => {
    const { manager, exec, teammate, outsider } = await createOrg();
    await createLead(exec);
    await createLead(teammate);
    const foreign = await createLead(outsider);

    const res = await api().get(`${API}/leads`).set(manager.auth).expect(200);
    expect(res.body.meta.pagination.totalRecords).toBe(2);
    await api().get(`${API}/leads/${foreign._id}`).set(manager.auth).expect(404);
  });

  test('supports combined filters, search, date range, sorting and pagination', async () => {
    const { admin, exec, teammate } = await createOrg();
    await createLead(exec, { name: 'Acme Alpha', company: 'Acme Industries', priority: 'high', source: 'website' });
    await createLead(exec, { name: 'Acme Beta', company: 'Acme Industries', priority: 'high', source: 'referral' });
    await createLead(exec, { name: 'Globex', email: 'ops@globex.test', company: 'Globex', priority: 'high', source: 'website' });
    await createLead(teammate, { name: 'Acme Gamma', company: 'Acme Industries', priority: 'low', source: 'website' });

    const today = new Date().toISOString().slice(0, 10);
    const res = await api()
      .get(`${API}/leads`)
      .query({ search: 'acme', priority: 'high', source: 'website,referral', assignedTo: exec.id, createdFrom: today, createdTo: today, sort: 'name', limit: 1 })
      .set(admin.auth)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Acme Alpha');
    expect(res.body.meta.pagination).toMatchObject({ page: 1, limit: 1, totalRecords: 2, totalPages: 2 });

    await api().get(`${API}/leads?sort=password`).set(admin.auth).expect(400);
    await api().get(`${API}/leads?limit=1000`).set(admin.auth).expect(400);
  });

  test('status transitions are enforced and recorded', async () => {
    const { exec } = await createOrg();
    const lead = await createLead(exec);

    await api().patch(`${API}/leads/${lead._id}/status`).set(exec.auth).send({ status: 'converted' }).expect(400);
    await api().patch(`${API}/leads/${lead._id}/status`).set(exec.auth).send({ status: 'lost' }).expect(400);

    await api().patch(`${API}/leads/${lead._id}/status`).set(exec.auth).send({ status: 'contacted' }).expect(200);
    const invalid = await api().patch(`${API}/leads/${lead._id}/status`).set(exec.auth).send({ status: 'new' }).expect(422);
    expect(invalid.body.errors.allowedTransitions).toEqual(['qualified', 'unqualified', 'lost']);

    const event = await TimelineEvent.findOne({ lead: lead._id, action: 'lead_status_changed' });
    expect(event).toMatchObject({ previousValue: 'new', newValue: 'contacted' });
  });

  test('priority changes are recorded in the timeline', async () => {
    const { exec } = await createOrg();
    const lead = await createLead(exec, { priority: 'low' });
    await api().patch(`${API}/leads/${lead._id}`).set(exec.auth).send({ priority: 'high' }).expect(200);

    const res = await api().get(`${API}/leads/${lead._id}/timeline`).set(exec.auth).expect(200);
    expect(res.body.data[0]).toMatchObject({ action: 'lead_priority_changed', previousValue: 'low', newValue: 'high' });
  });

  describe('assignment', () => {
    test('executives cannot assign leads', async () => {
      const { exec, teammate } = await createOrg();
      const lead = await createLead(exec);
      await api().patch(`${API}/leads/${lead._id}/assign`).set(exec.auth).send({ assignedTo: teammate.id }).expect(403);
    });

    test('managers can only reassign within their own team', async () => {
      const { manager, exec, teammate, outsider } = await createOrg();
      const lead = await createLead(exec);

      await api().patch(`${API}/leads/${lead._id}/assign`).set(manager.auth).send({ assignedTo: outsider.id }).expect(403);
      const res = await api()
        .patch(`${API}/leads/${lead._id}/assign`)
        .set(manager.auth)
        .send({ assignedTo: teammate.id, note: 'Workload balancing' })
        .expect(200);
      expect(res.body.data.assignedTo._id).toBe(teammate.id);

      const event = await TimelineEvent.findOne({ lead: lead._id, action: 'lead_reassigned' });
      expect(String(event.previousValue._id)).toBe(exec.id);
      expect(String(event.newValue._id)).toBe(teammate.id);
    });

    test('inactive users and non-executives are not assignable', async () => {
      const { admin, exec, manager } = await createOrg();
      const inactive = await createUser('sales_executive', { isActive: false });
      const lead = await createLead(exec);

      await api().patch(`${API}/leads/${lead._id}/assign`).set(admin.auth).send({ assignedTo: inactive.id }).expect(422);
      await api().patch(`${API}/leads/${lead._id}/assign`).set(admin.auth).send({ assignedTo: manager.id }).expect(422);
    });
  });

  test('only admins/managers can delete leads, and converted leads cannot be deleted', async () => {
    const { manager, exec } = await createOrg();
    const lead = await createLead(exec);
    const converted = await createLead(exec, { status: 'converted' });

    await api().delete(`${API}/leads/${lead._id}`).set(exec.auth).expect(403);
    await api().delete(`${API}/leads/${converted._id}`).set(manager.auth).expect(409);
    await api().delete(`${API}/leads/${lead._id}`).set(manager.auth).expect(200);
  });
});
