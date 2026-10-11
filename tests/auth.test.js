const request = require('supertest');
const { API, app, api, connect, disconnect, clearDatabase, createUser } = require('./helpers');

const REFRESH_COOKIE = 'crm_refresh_token';
const cookieValue = (res) =>
  (res.headers['set-cookie'] || []).find((c) => c.startsWith(`${REFRESH_COOKIE}=`))?.split(';')[0];

beforeAll(connect);
afterAll(disconnect);
afterEach(clearDatabase);

describe('Auth', () => {
  const credentials = { name: 'Asha Verma', email: 'asha@test.dev', password: 'Passw0rd!' };

  test('register creates a sales executive, hides secrets and sets an httpOnly refresh cookie', async () => {
    const res = await api().post(`${API}/auth/register`).send(credentials).expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user.role).toBe('sales_executive');
    expect(res.body.data.user.password).toBeUndefined();
    expect(res.body.data.user.tokenVersion).toBeUndefined();
    expect(res.body.data.accessToken).toEqual(expect.any(String));

    const cookie = res.headers['set-cookie'].find((c) => c.startsWith(REFRESH_COOKIE));
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  });

  test('register rejects attempts to self-assign a role', async () => {
    const res = await api().post(`${API}/auth/register`).send({ ...credentials, role: 'admin' }).expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('register validates email and password strength', async () => {
    const res = await api()
      .post(`${API}/auth/register`)
      .send({ name: 'X Y', email: 'not-an-email', password: 'weak' })
      .expect(400);
    const fields = res.body.errors.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['email', 'password']));
  });

  test('duplicate email returns 409', async () => {
    await api().post(`${API}/auth/register`).send(credentials).expect(201);
    const res = await api().post(`${API}/auth/register`).send(credentials).expect(409);
    expect(res.body.code).toBe('DUPLICATE_RESOURCE');
  });

  test('login succeeds with valid credentials and /me returns the profile', async () => {
    await api().post(`${API}/auth/register`).send(credentials);
    const login = await api()
      .post(`${API}/auth/login`)
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);

    const me = await api()
      .get(`${API}/auth/me`)
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .expect(200);
    expect(me.body.data.email).toBe(credentials.email);
  });

  test('login with a wrong password is rejected and the account locks after repeated failures', async () => {
    await api().post(`${API}/auth/register`).send(credentials);
    const bad = { email: credentials.email, password: 'WrongPass1' };

    for (let i = 0; i < 3; i += 1) {
      const res = await api().post(`${API}/auth/login`).send(bad).expect(401);
      expect(res.body.message).toBe('Invalid email or password');
    }
    const locked = await api().post(`${API}/auth/login`).send({ email: credentials.email, password: credentials.password });
    expect(locked.status).toBe(423);
  });

  test('protected routes require a valid bearer token', async () => {
    await api().get(`${API}/leads`).expect(401);
    const res = await api().get(`${API}/leads`).set('Authorization', 'Bearer not-a-jwt').expect(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  test('refresh rotates the token and re-use of an old token revokes the session family', async () => {
    await api().post(`${API}/auth/register`).send(credentials);
    const login = await api().post(`${API}/auth/login`).send({ email: credentials.email, password: credentials.password });
    const original = cookieValue(login);

    const first = await request(app).post(`${API}/auth/refresh`).set('Cookie', original).expect(200);
    const rotated = cookieValue(first);
    expect(rotated).toBeDefined();
    expect(rotated).not.toEqual(original);

    // Replaying the original (already rotated) token is treated as theft.
    const replay = await request(app).post(`${API}/auth/refresh`).set('Cookie', original).expect(401);
    expect(replay.body.code).toBe('REFRESH_TOKEN_REUSED');

    // ...which also kills the legitimately rotated token.
    await request(app).post(`${API}/auth/refresh`).set('Cookie', rotated).expect(401);
  });

  test('logout revokes the refresh token', async () => {
    await api().post(`${API}/auth/register`).send(credentials);
    const login = await api().post(`${API}/auth/login`).send({ email: credentials.email, password: credentials.password });
    const cookie = cookieValue(login);

    await request(app).post(`${API}/auth/logout`).set('Cookie', cookie).expect(200);
    await request(app).post(`${API}/auth/refresh`).set('Cookie', cookie).expect(401);
  });

  test('deactivating a user immediately invalidates their access token', async () => {
    const admin = await createUser('admin');
    const exec = await createUser('sales_executive');

    await api().get(`${API}/auth/me`).set(exec.auth).expect(200);
    await api().patch(`${API}/users/${exec.id}/status`).set(admin.auth).send({ isActive: false }).expect(200);

    const res = await api().get(`${API}/auth/me`).set(exec.auth).expect(401);
    expect(res.body.code).toBe('ACCOUNT_INACTIVE');
  });

  test('changing the password revokes previously issued access tokens', async () => {
    const exec = await createUser('sales_executive');
    const res = await api()
      .patch(`${API}/auth/me/password`)
      .set(exec.auth)
      .send({ currentPassword: 'Passw0rd!', newPassword: 'N3wPassw0rd!' })
      .expect(200);

    await api().get(`${API}/auth/me`).set(exec.auth).expect(401);
    await api().get(`${API}/auth/me`).set('Authorization', `Bearer ${res.body.data.accessToken}`).expect(200);
  });
});
