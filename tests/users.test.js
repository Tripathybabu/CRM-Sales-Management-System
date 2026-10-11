const { API, api, connect, disconnect, clearDatabase, createOrg, createLead } = require('./helpers');

beforeAll(connect);
afterAll(disconnect);
afterEach(clearDatabase);

describe('User management', () => {
  test('admin creates a user; the password is never returned', async () => {
    const { admin, manager } = await createOrg();
    const res = await api()
      .post(`${API}/users`)
      .set(admin.auth)
      .send({ name: 'New Exec', email: 'new.exec@test.dev', password: 'Passw0rd!', role: 'sales_executive', manager: manager.id })
      .expect(201);

    expect(res.body.data.password).toBeUndefined();
    expect(res.body.data.role).toBe('sales_executive');
  });

  test('non-admins cannot create users', async () => {
    const { manager, exec } = await createOrg();
    const body = { name: 'X Y', email: 'x@test.dev', password: 'Passw0rd!', role: 'admin' };
    await api().post(`${API}/users`).set(manager.auth).send(body).expect(403);
    await api().post(`${API}/users`).set(exec.auth).send(body).expect(403);
  });

  test('managers only list themselves and their own team', async () => {
    const { manager, exec, teammate, outsider } = await createOrg();
    const res = await api().get(`${API}/users`).set(manager.auth).expect(200);

    const ids = res.body.data.map((u) => u._id);
    expect(ids).toEqual(expect.arrayContaining([manager.id, exec.id, teammate.id]));
    expect(ids).not.toContain(outsider.id);
    await api().get(`${API}/users/${outsider.id}`).set(manager.auth).expect(404);
  });

  test('admin can search and filter users with pagination metadata', async () => {
    const { admin } = await createOrg();
    const res = await api().get(`${API}/users?role=sales_executive&isActive=true&limit=2&sort=name`).set(admin.auth).expect(200);

    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.pagination).toMatchObject({ page: 1, limit: 2, totalRecords: 3, totalPages: 2, hasNextPage: true });
  });

  test('users with CRM records cannot be deleted, only deactivated', async () => {
    const { admin, exec } = await createOrg();
    await createLead(exec);

    const res = await api().delete(`${API}/users/${exec.id}`).set(admin.auth).expect(409);
    expect(res.body.message).toMatch(/Deactivate/);
    await api().patch(`${API}/users/${exec.id}/status`).set(admin.auth).send({ isActive: false }).expect(200);
  });

  test('admin cannot deactivate or delete their own account', async () => {
    const { admin } = await createOrg();
    await api().patch(`${API}/users/${admin.id}/status`).set(admin.auth).send({ isActive: false }).expect(422);
    await api().delete(`${API}/users/${admin.id}`).set(admin.auth).expect(422);
  });

  test('only sales managers can be set as a manager', async () => {
    const { admin, exec, teammate } = await createOrg();
    await api().patch(`${API}/users/${exec.id}`).set(admin.auth).send({ manager: teammate.id }).expect(422);
  });
});
