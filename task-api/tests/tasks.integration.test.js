const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

// The app and the tests share the same in-memory store (same module instance),
// so each test resets it and seeds known data before running.
let tasks;

beforeEach(() => {
  taskService._reset();
  tasks = [
    taskService.create({ title: 'Task 1', status: 'todo', priority: 'high' }),
    taskService.create({ title: 'Task 2', status: 'in_progress' }),
    taskService.create({ title: 'Task 3', status: 'done', priority: 'low' }),
    taskService.create({ title: 'Task 4', status: 'todo' }),
    taskService.create({ title: 'Task 5', status: 'todo', dueDate: '2000-01-01T00:00:00.000Z' }),
  ];
});

const titles = (res) => res.body.map((t) => t.title);

describe('GET /tasks', () => {
  it('returns all tasks with the expected shape', async () => {
    const res = await request(app).get('/tasks');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(5);
    expect(Object.keys(res.body[0]).sort()).toEqual(
      ['assignee', 'completedAt', 'createdAt', 'description', 'dueDate', 'id', 'priority', 'status', 'title'].sort()
    );
  });

  it('returns an empty array when there are no tasks', async () => {
    taskService._reset();
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /tasks?status=', () => {
  it('returns only tasks with that exact status', async () => {
    const res = await request(app).get('/tasks?status=todo');

    expect(res.status).toBe(200);
    expect(titles(res)).toEqual(['Task 1', 'Task 4', 'Task 5']);
    res.body.forEach((t) => expect(t.status).toBe('todo'));
  });

  // Regression: BUGS.md #2
  it('does not match partial status strings', async () => {
    const res = await request(app).get('/tasks?status=do');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns an empty array for an unknown status', async () => {
    const res = await request(app).get('/tasks?status=archived');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /tasks?page=&limit=', () => {
  // Regression: BUGS.md #1
  it('returns the first two tasks for page=1&limit=2', async () => {
    const res = await request(app).get('/tasks?page=1&limit=2');
    expect(res.status).toBe(200);
    expect(titles(res)).toEqual(['Task 1', 'Task 2']);
  });

  it('returns the next two tasks for page=2&limit=2', async () => {
    const res = await request(app).get('/tasks?page=2&limit=2');
    expect(titles(res)).toEqual(['Task 3', 'Task 4']);
  });

  it('returns an empty array for a page beyond the data', async () => {
    const res = await request(app).get('/tasks?page=10&limit=2');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('defaults limit to 10 when only page is given', async () => {
    const res = await request(app).get('/tasks?page=1');
    expect(res.body).toHaveLength(5);
  });

  it('defaults page to 1 when only limit is given', async () => {
    const res = await request(app).get('/tasks?limit=3');
    expect(titles(res)).toEqual(['Task 1', 'Task 2', 'Task 3']);
  });

  // Regression: BUGS.md #8 — negative values produced negative slice offsets.
  it.each([
    ['page=-1&limit=2', ['Task 1', 'Task 2']],
    ['page=0&limit=2', ['Task 1', 'Task 2']],
    ['page=abc&limit=2', ['Task 1', 'Task 2']],
    ['page=1&limit=-2', ['Task 1', 'Task 2', 'Task 3', 'Task 4', 'Task 5']],
    ['page=1&limit=0', ['Task 1', 'Task 2', 'Task 3', 'Task 4', 'Task 5']],
  ])('falls back to defaults for invalid values (%s)', async (query, expected) => {
    const res = await request(app).get(`/tasks?${query}`);
    expect(res.status).toBe(200);
    expect(titles(res)).toEqual(expected);
  });

  // Regression: BUGS.md #7 — status used to silently disable pagination.
  it('combines status filtering with pagination', async () => {
    const page1 = await request(app).get('/tasks?status=todo&page=1&limit=2');
    const page2 = await request(app).get('/tasks?status=todo&page=2&limit=2');

    expect(titles(page1)).toEqual(['Task 1', 'Task 4']);
    expect(titles(page2)).toEqual(['Task 5']);
  });
});

describe('GET /tasks/stats', () => {
  it('returns counts by status and the overdue count', async () => {
    const res = await request(app).get('/tasks/stats');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ todo: 3, in_progress: 1, done: 1, overdue: 1 });
  });

  it('reflects changes made through the API', async () => {
    await request(app).patch(`/tasks/${tasks[4].id}/complete`);
    const res = await request(app).get('/tasks/stats');
    expect(res.body).toEqual({ todo: 2, in_progress: 1, done: 2, overdue: 0 });
  });
});

describe('POST /tasks', () => {
  it('creates a task and returns 201', async () => {
    const body = {
      title: 'Write tests',
      description: 'Add comprehensive coverage',
      status: 'todo',
      priority: 'high',
    };
    const res = await request(app).post('/tasks').send(body);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject(body);
    expect(res.body.id).toEqual(expect.any(String));

    const list = await request(app).get('/tasks');
    expect(list.body).toHaveLength(6);
  });

  it('applies defaults when only title is provided', async () => {
    const res = await request(app).post('/tasks').send({ title: 'Just a title' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'todo',
      priority: 'medium',
      description: '',
      dueDate: null,
      assignee: null,
      completedAt: null,
    });
  });

  it.each([
    ['missing title', { description: 'no title' }],
    ['empty title', { title: '' }],
    ['whitespace title', { title: '   ' }],
    ['non-string title', { title: 123 }],
    ['invalid status', { title: 't', status: 'pending' }],
    ['empty status', { title: 't', status: '' }],
    ['invalid priority', { title: 't', priority: 'urgent' }],
    ['invalid dueDate', { title: 't', dueDate: 'not-a-date' }],
  ])('returns 400 for %s', async (_, body) => {
    const res = await request(app).post('/tasks').send(body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: expect.any(String) });
    const list = await request(app).get('/tasks');
    expect(list.body).toHaveLength(5);
  });

  it('returns 400 when the body is not a JSON object', async () => {
    const res = await request(app).post('/tasks').send(['not', 'an', 'object']);
    expect(res.status).toBe(400);
  });
});

describe('PUT /tasks/:id', () => {
  it('updates the task and returns it', async () => {
    const res = await request(app)
      .put(`/tasks/${tasks[0].id}`)
      .send({ title: 'Updated', status: 'in_progress' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...tasks[0], title: 'Updated', status: 'in_progress' });
  });

  it('returns 404 for an unknown task', async () => {
    const res = await request(app).put('/tasks/nonexistent-id').send({ title: 'x' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Task not found' });
  });

  it.each([
    ['empty title', { title: '' }],
    ['invalid status', { status: 'finished' }],
    ['invalid priority', { priority: 'critical' }],
    ['invalid dueDate', { dueDate: 'soon' }],
  ])('returns 400 for %s and leaves the task unchanged', async (_, body) => {
    const res = await request(app).put(`/tasks/${tasks[0].id}`).send(body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: expect.any(String) });
    expect(taskService.findById(tasks[0].id)).toEqual(tasks[0]);
  });

  // Regression: BUGS.md #4
  it('does not allow the id to be changed', async () => {
    const res = await request(app).put(`/tasks/${tasks[0].id}`).send({ id: 'hijacked' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(tasks[0].id);
    const again = await request(app).put(`/tasks/${tasks[0].id}`).send({ title: 'Still reachable' });
    expect(again.status).toBe(200);
  });
});

describe('DELETE /tasks/:id', () => {
  it('deletes the task and returns 204 with no body', async () => {
    const res = await request(app).delete(`/tasks/${tasks[1].id}`);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});

    const list = await request(app).get('/tasks');
    expect(list.body.map((t) => t.id)).not.toContain(tasks[1].id);
    expect(list.body).toHaveLength(4);
  });

  it('returns 404 for an unknown task', async () => {
    const res = await request(app).delete('/tasks/nonexistent-id');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Task not found' });
  });

  it('returns 404 when deleting the same task twice', async () => {
    await request(app).delete(`/tasks/${tasks[1].id}`);
    const res = await request(app).delete(`/tasks/${tasks[1].id}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /tasks/:id/complete', () => {
  it('marks the task done and sets completedAt', async () => {
    const res = await request(app).patch(`/tasks/${tasks[0].id}/complete`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(Number.isNaN(Date.parse(res.body.completedAt))).toBe(false);
  });

  // Regression: BUGS.md #3
  it('preserves the priority of the task', async () => {
    const high = await request(app).patch(`/tasks/${tasks[0].id}/complete`);
    const low = await request(app).patch(`/tasks/${tasks[2].id}/complete`);

    expect(high.body.priority).toBe('high');
    expect(low.body.priority).toBe('low');
  });

  it('returns 404 for an unknown task', async () => {
    const res = await request(app).patch('/tasks/nonexistent-id/complete');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Task not found' });
  });

  it('keeps an already completed task done', async () => {
    const res = await request(app).patch(`/tasks/${tasks[2].id}/complete`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
  });
});

describe('PATCH /tasks/:id/assign', () => {
  it('assigns the task and returns the updated task', async () => {
    const res = await request(app).patch(`/tasks/${tasks[0].id}/assign`).send({ assignee: 'Mukund' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...tasks[0], assignee: 'Mukund' });
    expect(taskService.findById(tasks[0].id).assignee).toBe('Mukund');
  });

  it('trims whitespace around the assignee name', async () => {
    const res = await request(app).patch(`/tasks/${tasks[0].id}/assign`).send({ assignee: '  Mukund ' });
    expect(res.body.assignee).toBe('Mukund');
  });

  it('allows reassignment and preserves unrelated fields', async () => {
    await request(app).patch(`/tasks/${tasks[0].id}/assign`).send({ assignee: 'Alice' });
    const res = await request(app).patch(`/tasks/${tasks[0].id}/assign`).send({ assignee: 'Bob' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...tasks[0], assignee: 'Bob' });
  });

  it.each([
    ['missing assignee', {}],
    ['empty string', { assignee: '' }],
    ['whitespace-only', { assignee: '   ' }],
    ['a number', { assignee: 123 }],
    ['null', { assignee: null }],
    ['a boolean', { assignee: true }],
  ])('returns 400 for %s and does not modify the task', async (_, body) => {
    const res = await request(app).patch(`/tasks/${tasks[0].id}/assign`).send(body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'assignee is required and must be a non-empty string' });
    expect(taskService.findById(tasks[0].id)).toEqual(tasks[0]);
  });

  it('returns 400 when no body is sent', async () => {
    const res = await request(app).patch(`/tasks/${tasks[0].id}/assign`);
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown task', async () => {
    const res = await request(app).patch('/tasks/nonexistent-id/assign').send({ assignee: 'Mukund' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Task not found' });
  });

  it('returns 404 for a task that was deleted', async () => {
    await request(app).delete(`/tasks/${tasks[0].id}`);
    const res = await request(app).patch(`/tasks/${tasks[0].id}/assign`).send({ assignee: 'Mukund' });
    expect(res.status).toBe(404);
  });

  it('keeps the assignee when the task is later completed', async () => {
    await request(app).patch(`/tasks/${tasks[0].id}/assign`).send({ assignee: 'Alice' });
    const res = await request(app).patch(`/tasks/${tasks[0].id}/complete`);
    expect(res.body).toMatchObject({ assignee: 'Alice', status: 'done', priority: 'high' });
  });
});
