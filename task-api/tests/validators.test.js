const {
  validateCreateTask,
  validateUpdateTask,
  validateAssignTask,
} = require('../src/utils/validators');

describe('validateCreateTask', () => {
  it('accepts a minimal valid body', () => {
    expect(validateCreateTask({ title: 'Write tests' })).toBeNull();
  });

  it('accepts a fully populated valid body', () => {
    expect(
      validateCreateTask({
        title: 'Write tests',
        description: 'Add coverage',
        status: 'in_progress',
        priority: 'high',
        dueDate: '2030-01-01T00:00:00.000Z',
      })
    ).toBeNull();
  });

  it.each([
    ['missing', {}],
    ['empty', { title: '' }],
    ['whitespace-only', { title: '   ' }],
    ['a number', { title: 42 }],
    ['null', { title: null }],
  ])('rejects a title that is %s', (_, body) => {
    expect(validateCreateTask(body)).toMatch(/title/);
  });

  it('rejects an unknown status', () => {
    expect(validateCreateTask({ title: 't', status: 'pending' })).toMatch(/status/);
  });

  it('rejects an unknown priority', () => {
    expect(validateCreateTask({ title: 't', priority: 'urgent' })).toMatch(/priority/);
  });

  // Regression: BUGS.md #6 — falsy values skipped the enum checks entirely.
  it.each([
    ['status', ''],
    ['status', null],
    ['priority', ''],
    ['priority', 0],
  ])('rejects %s set to %p', (field, value) => {
    expect(validateCreateTask({ title: 't', [field]: value })).toMatch(field);
  });

  it('rejects an unparseable dueDate', () => {
    expect(validateCreateTask({ title: 't', dueDate: 'not-a-date' })).toMatch(/dueDate/);
  });
});

describe('validateUpdateTask', () => {
  it('accepts an empty body (partial update)', () => {
    expect(validateUpdateTask({})).toBeNull();
  });

  it('accepts valid partial fields', () => {
    expect(validateUpdateTask({ status: 'done', priority: 'low' })).toBeNull();
  });

  it.each([
    ['empty', ''],
    ['whitespace-only', '  '],
    ['a number', 1],
    ['null', null],
  ])('rejects a title that is %s', (_, title) => {
    expect(validateUpdateTask({ title })).toMatch(/title/);
  });

  it.each([
    ['status', 'finished'],
    ['status', ''],
    ['priority', 'critical'],
    ['priority', ''],
  ])('rejects %s set to %p', (field, value) => {
    expect(validateUpdateTask({ [field]: value })).toMatch(field);
  });

  it('rejects an unparseable dueDate', () => {
    expect(validateUpdateTask({ dueDate: 'tomorrow-ish' })).toMatch(/dueDate/);
  });
});

describe('validateAssignTask', () => {
  it('accepts a non-empty string', () => {
    expect(validateAssignTask({ assignee: 'Mukund' })).toBeNull();
  });

  it.each([
    ['missing', {}],
    ['empty', { assignee: '' }],
    ['whitespace-only', { assignee: '   ' }],
    ['a number', { assignee: 123 }],
    ['null', { assignee: null }],
    ['an array', { assignee: ['Alice'] }],
    ['an object', { assignee: { name: 'Alice' } }],
  ])('rejects an assignee that is %s', (_, body) => {
    expect(validateAssignTask(body)).toBe('assignee is required and must be a non-empty string');
  });
});
