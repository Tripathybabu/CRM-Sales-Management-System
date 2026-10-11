const { API, api, connect, disconnect, clearDatabase, createOrg, createLead, pastDate } = require('./helpers');
const { Activity } = require('../src/models');

beforeAll(connect);
afterAll(disconnect);
afterEach(clearDatabase);

const inDays = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

describe('Activities', () => {
  test('dueDate is required for tasks and must not be in the past', async () => {
    const { exec } = await createOrg();
    await api().post(`${API}/activities`).set(exec.auth).send({ type: 'call', title: 'Intro call' }).expect(400);
    await api().post(`${API}/activities`).set(exec.auth).send({ type: 'call', title: 'Intro call', dueDate: pastDate(1) }).expect(422);
    await api().post(`${API}/activities`).set(exec.auth).send({ type: 'call', title: 'Intro call', dueDate: inDays(1) }).expect(201);
  });

  test('activities can only be linked to records the user can access', async () => {
    const { exec, teammate } = await createOrg();
    const foreignLead = await createLead(teammate);
    await api()
      .post(`${API}/activities`)
      .set(exec.auth)
      .send({ type: 'note', title: 'Snooping', relatedType: 'lead', relatedId: String(foreignLead._id) })
      .expect(404);
  });

  test('notes are stored as completed and appear in the lead timeline', async () => {
    const { exec } = await createOrg();
    const lead = await createLead(exec);
    const res = await api()
      .post(`${API}/activities`)
      .set(exec.auth)
      .send({ type: 'note', title: 'Prefers email contact', relatedType: 'lead', relatedId: String(lead._id) })
      .expect(201);
    expect(res.body.data.status).toBe('completed');

    const timeline = await api().get(`${API}/leads/${lead._id}/timeline`).set(exec.auth).expect(200);
    expect(timeline.body.data.map((e) => e.action)).toContain('note_added');
  });

  test('the backend derives overdue status from the due date', async () => {
    const { exec } = await createOrg();
    await Activity.create({ type: 'call', title: 'Missed call', dueDate: pastDate(2), assignedTo: exec.user._id, createdBy: exec.user._id });
    await Activity.create({ type: 'call', title: 'Upcoming call', dueDate: inDays(2), assignedTo: exec.user._id, createdBy: exec.user._id });

    const overdue = await api().get(`${API}/activities?status=overdue`).set(exec.auth).expect(200);
    expect(overdue.body.data).toHaveLength(1);
    expect(overdue.body.data[0]).toMatchObject({ title: 'Missed call', status: 'overdue', isOverdue: true });

    const pending = await api().get(`${API}/activities?status=pending`).set(exec.auth).expect(200);
    expect(pending.body.data.map((a) => a.title)).toEqual(['Upcoming call']);

    const summary = await api().get(`${API}/dashboard/summary`).set(exec.auth).expect(200);
    expect(summary.body.data.activities).toEqual({ pending: 1, overdue: 1 });
  });

  test('completing a follow-up is audited and cannot be repeated', async () => {
    const { exec } = await createOrg();
    const lead = await createLead(exec);
    const created = await api()
      .post(`${API}/activities`)
      .set(exec.auth)
      .send({ type: 'follow_up', title: 'Send pricing', dueDate: inDays(1), relatedType: 'lead', relatedId: String(lead._id) })
      .expect(201);
    const id = created.body.data._id;

    const done = await api().patch(`${API}/activities/${id}/complete`).set(exec.auth).send({ outcome: 'Sent' }).expect(200);
    expect(done.body.data).toMatchObject({ status: 'completed', outcome: 'Sent' });
    await api().patch(`${API}/activities/${id}/complete`).set(exec.auth).send({}).expect(409);
    await api().patch(`${API}/activities/${id}`).set(exec.auth).send({ title: 'Changed' }).expect(422);

    const timeline = await api().get(`${API}/leads/${lead._id}/timeline`).set(exec.auth).expect(200);
    expect(timeline.body.data.map((e) => e.action)).toEqual(expect.arrayContaining(['follow_up_created', 'follow_up_completed']));
  });

  test('executives see only their own activities; managers see their team', async () => {
    const { manager, exec, teammate, outsider } = await createOrg();
    for (const owner of [exec, teammate, outsider]) {
      await Activity.create({ type: 'email', title: `Email by ${owner.id}`, dueDate: inDays(1), assignedTo: owner.user._id, createdBy: owner.user._id });
    }

    const own = await api().get(`${API}/activities`).set(exec.auth).expect(200);
    expect(own.body.data).toHaveLength(1);
    const team = await api().get(`${API}/activities`).set(manager.auth).expect(200);
    expect(team.body.data).toHaveLength(2);
  });

  test('executives cannot assign activities to other users', async () => {
    const { exec, teammate } = await createOrg();
    await api()
      .post(`${API}/activities`)
      .set(exec.auth)
      .send({ type: 'reminder', title: 'Do this', dueDate: inDays(1), assignedTo: teammate.id })
      .expect(403);
  });
});
