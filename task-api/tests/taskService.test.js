const taskService = require('../src/services/taskService');

// The service keeps tasks in a module-level array, so every test starts from
// an empty store plus a known seed to avoid order-dependent results.
const seed = () => [
  taskService.create({ title: 'Task 1', status: 'todo', priority: 'high' }),
  taskService.create({ title: 'Task 2', status: 'in_progress', priority: 'low' }),
  taskService.create({ title: 'Task 3', status: 'done' }),
  taskService.create({ title: 'Task 4', status: 'todo' }),
  taskService.create({ title: 'Task 5', status: 'todo' }),
];

const titles = (tasks) => tasks.map((t) => t.title);

let seeded;

beforeEach(() => {
  taskService._reset();
  seeded = seed();
});

describe('getAll', () => {
  it('returns every task in insertion order', () => {
    expect(titles(taskService.getAll())).toEqual(['Task 1', 'Task 2', 'Task 3', 'Task 4', 'Task 5']);
  });

  it('returns an empty array when the store is empty', () => {
    taskService._reset();
    expect(taskService.getAll()).toEqual([]);
  });

  it('returns a copy, so mutating the result does not change the store', () => {
    taskService.getAll().pop();
    expect(taskService.getAll()).toHaveLength(5);
  });
});

describe('findById', () => {
  it('returns the matching task', () => {
    expect(taskService.findById(seeded[1].id)).toEqual(seeded[1]);
  });

  it('returns undefined for an unknown id', () => {
    expect(taskService.findById('does-not-exist')).toBeUndefined();
  });
});

describe('getByStatus', () => {
  it('returns only tasks with the requested status', () => {
    const result = taskService.getByStatus('todo');
    expect(titles(result)).toEqual(['Task 1', 'Task 4', 'Task 5']);
    result.forEach((t) => expect(t.status).toBe('todo'));
  });

  it('returns an empty array when nothing matches', () => {
    taskService._reset();
    taskService.create({ title: 'Only todo' });
    expect(taskService.getByStatus('done')).toEqual([]);
  });

  // Regression: BUGS.md #2 — substring matching let "do" match "todo" and "done".
  it('uses exact matching, not substring matching', () => {
    expect(taskService.getByStatus('do')).toEqual([]);
    expect(taskService.getByStatus('in')).toEqual([]);
    expect(taskService.getByStatus('TODO')).toEqual([]);
  });
});

describe('getPaginated', () => {
  // Regression: BUGS.md #1 — page=1 used to skip the first `limit` tasks.
  it('returns the first `limit` tasks for page 1', () => {
    expect(titles(taskService.getPaginated(1, 2))).toEqual(['Task 1', 'Task 2']);
  });

  it('returns the next `limit` tasks for page 2', () => {
    expect(titles(taskService.getPaginated(2, 2))).toEqual(['Task 3', 'Task 4']);
  });

  it('returns a partial final page', () => {
    expect(titles(taskService.getPaginated(3, 2))).toEqual(['Task 5']);
  });

  it('returns an empty array for a page beyond the data', () => {
    expect(taskService.getPaginated(4, 2)).toEqual([]);
  });

  it('returns everything when limit exceeds the number of tasks', () => {
    expect(taskService.getPaginated(1, 100)).toHaveLength(5);
  });

  it('returns an empty array when the store is empty', () => {
    taskService._reset();
    expect(taskService.getPaginated(1, 10)).toEqual([]);
  });

  // Regression: BUGS.md #7 — status and pagination could not be combined.
  it('paginates within a status filter when one is given', () => {
    expect(titles(taskService.getPaginated(1, 2, 'todo'))).toEqual(['Task 1', 'Task 4']);
    expect(titles(taskService.getPaginated(2, 2, 'todo'))).toEqual(['Task 5']);
  });
});

describe('getStats', () => {
  it('counts tasks by status', () => {
    expect(taskService.getStats()).toEqual({ todo: 3, in_progress: 1, done: 1, overdue: 0 });
  });

  it('returns zeroed counts for an empty store', () => {
    taskService._reset();
    expect(taskService.getStats()).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });

  it('counts past-due tasks that are not done as overdue', () => {
    taskService._reset();
    taskService.create({ title: 'Late todo', dueDate: '2000-01-01T00:00:00.000Z' });
    taskService.create({ title: 'Late in progress', status: 'in_progress', dueDate: '2000-01-01T00:00:00.000Z' });
    taskService.create({ title: 'Late but done', status: 'done', dueDate: '2000-01-01T00:00:00.000Z' });
    taskService.create({ title: 'Future', dueDate: '2999-01-01T00:00:00.000Z' });
    taskService.create({ title: 'No due date' });

    expect(taskService.getStats().overdue).toBe(2);
  });
});

describe('create', () => {
  it('applies defaults for optional fields', () => {
    const task = taskService.create({ title: 'Minimal' });
    expect(task).toEqual({
      id: expect.any(String),
      title: 'Minimal',
      description: '',
      status: 'todo',
      priority: 'medium',
      dueDate: null,
      assignee: null,
      completedAt: null,
      createdAt: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(task.createdAt))).toBe(false);
  });

  it('keeps the provided fields', () => {
    const task = taskService.create({
      title: 'Full',
      description: 'desc',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2030-01-01T00:00:00.000Z',
    });
    expect(task).toMatchObject({
      title: 'Full',
      description: 'desc',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2030-01-01T00:00:00.000Z',
    });
  });

  it('generates a unique id per task and stores the task', () => {
    const a = taskService.create({ title: 'A' });
    const b = taskService.create({ title: 'B' });
    expect(a.id).not.toBe(b.id);
    expect(taskService.findById(a.id)).toEqual(a);
  });
});

describe('update', () => {
  it('merges the given fields and keeps unrelated ones', () => {
    const original = seeded[0];
    const updated = taskService.update(original.id, { title: 'Renamed', status: 'in_progress' });

    expect(updated).toEqual({ ...original, title: 'Renamed', status: 'in_progress' });
    expect(taskService.findById(original.id)).toEqual(updated);
  });

  it('returns null for an unknown id', () => {
    expect(taskService.update('does-not-exist', { title: 'x' })).toBeNull();
  });

  // Regression: BUGS.md #4 — the body could overwrite server-managed fields.
  it('ignores attempts to change id or createdAt', () => {
    const original = seeded[0];
    const updated = taskService.update(original.id, {
      id: 'hijacked',
      createdAt: '1999-01-01T00:00:00.000Z',
      title: 'Still updated',
    });

    expect(updated.id).toBe(original.id);
    expect(updated.createdAt).toBe(original.createdAt);
    expect(updated.title).toBe('Still updated');
    expect(taskService.findById(original.id)).toBeDefined();
    expect(taskService.findById('hijacked')).toBeUndefined();
  });
});

describe('remove', () => {
  it('deletes an existing task and returns true', () => {
    expect(taskService.remove(seeded[2].id)).toBe(true);
    expect(taskService.findById(seeded[2].id)).toBeUndefined();
    expect(taskService.getAll()).toHaveLength(4);
  });

  it('returns false for an unknown id and leaves the store untouched', () => {
    expect(taskService.remove('does-not-exist')).toBe(false);
    expect(taskService.getAll()).toHaveLength(5);
  });
});

describe('completeTask', () => {
  it('marks the task done and sets completedAt', () => {
    const completed = taskService.completeTask(seeded[0].id);
    expect(completed.status).toBe('done');
    expect(Number.isNaN(Date.parse(completed.completedAt))).toBe(false);
    expect(taskService.findById(seeded[0].id)).toEqual(completed);
  });

  // Regression: BUGS.md #3 — completing used to reset priority to "medium".
  it('preserves priority and every other unrelated field', () => {
    const original = seeded[0];
    const completed = taskService.completeTask(original.id);
    const { status, completedAt, ...rest } = completed;
    const { status: _s, completedAt: _c, ...originalRest } = original;

    expect(completed.priority).toBe('high');
    expect(rest).toEqual(originalRest);
  });

  it('returns null for an unknown id', () => {
    expect(taskService.completeTask('does-not-exist')).toBeNull();
  });
});

describe('assignTask', () => {
  it('sets the assignee and keeps every other field', () => {
    const original = seeded[1];
    const assigned = taskService.assignTask(original.id, 'Mukund');

    expect(assigned).toEqual({ ...original, assignee: 'Mukund' });
    expect(taskService.findById(original.id)).toEqual(assigned);
  });

  it('allows reassigning an already assigned task', () => {
    taskService.assignTask(seeded[0].id, 'Alice');
    const reassigned = taskService.assignTask(seeded[0].id, 'Bob');
    expect(reassigned.assignee).toBe('Bob');
  });

  it('trims surrounding whitespace from the assignee', () => {
    expect(taskService.assignTask(seeded[0].id, '  Alice  ').assignee).toBe('Alice');
  });

  it('returns null for an unknown id', () => {
    expect(taskService.assignTask('does-not-exist', 'Alice')).toBeNull();
  });
});
