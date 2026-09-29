const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('unknown routes', () => {
  it('returns 404', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('error handler', () => {
  // Regression: BUGS.md #5 — malformed JSON was reported as a 500 server error.
  it('returns 400 with the standard error shape for malformed JSON', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Content-Type', 'application/json')
      .send('{"title": "unterminated');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid request body' });
  });

  it('returns 500 without leaking details when a handler throws', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(taskService, 'getAll').mockImplementation(() => {
      throw new Error('store exploded');
    });

    const res = await request(app).get('/tasks');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(console.error).toHaveBeenCalled();
  });
});
