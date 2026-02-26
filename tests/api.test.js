const request = require('supertest');
const { app, httpServer } = require('../server');

afterAll((done) => {
  if (httpServer && httpServer.close) return httpServer.close(done);
  done();
});

describe('API smoke tests', () => {
  test('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
  });

  test('GET /landing returns modes and status', async () => {
    const res = await request(app).get('/landing');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('modes');
    expect(Array.isArray(res.body.modes)).toBe(true);
  });

  test('GET /navigation/external returns outdoor context', async () => {
    const res = await request(app).get('/navigation/external');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('mode', 'outdoor');
    expect(res.body).toHaveProperty('activeDevices');
  });

  test('GET /navigation/internal returns indoor context', async () => {
    const res = await request(app).get('/navigation/internal');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('mode', 'indoor');
    expect(res.body).toHaveProperty('baseStations');
  });

  test('POST /navigation/external/update accepts update', async () => {
    const res = await request(app).post('/navigation/external/update').send({ test: true });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('received', true);
  });

  test('GET /dashboard returns summary and devices', async () => {
    const res = await request(app).get('/dashboard');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('summary');
    expect(res.body).toHaveProperty('devices');
  });

  test('GET /dashboard/devices returns array', async () => {
    const res = await request(app).get('/dashboard/devices');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /dashboard/alerts returns array', async () => {
    const res = await request(app).get('/dashboard/alerts');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
