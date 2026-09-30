const VALID_STATUSES = ['todo', 'in_progress', 'done'];
const VALID_PRIORITIES = ['low', 'medium', 'high'];

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const INVALID_BODY_ERROR = 'request body must be a JSON object';

// Enum fields are checked whenever they are present, not just when truthy,
// so values like "" or null can't slip past validation (BUGS.md #6).
const validateOptionalFields = (body) => {
  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    return `status must be one of: ${VALID_STATUSES.join(', ')}`;
  }
  if (body.priority !== undefined && !VALID_PRIORITIES.includes(body.priority)) {
    return `priority must be one of: ${VALID_PRIORITIES.join(', ')}`;
  }
  if (body.dueDate && isNaN(Date.parse(body.dueDate))) {
    return 'dueDate must be a valid ISO date string';
  }
  return null;
};

// Every validator first checks the body is an object so that `null`, arrays and
// primitives produce a controlled 400 instead of a TypeError (BUGS.md #9).
const validateCreateTask = (body) => {
  if (!isPlainObject(body)) return INVALID_BODY_ERROR;
  if (!isNonEmptyString(body.title)) {
    return 'title is required and must be a non-empty string';
  }
  return validateOptionalFields(body);
};

const validateUpdateTask = (body) => {
  if (!isPlainObject(body)) return INVALID_BODY_ERROR;
  if (body.title !== undefined && !isNonEmptyString(body.title)) {
    return 'title must be a non-empty string';
  }
  return validateOptionalFields(body);
};

const validateAssignTask = (body) => {
  if (!isPlainObject(body)) return INVALID_BODY_ERROR;
  if (!isNonEmptyString(body.assignee)) {
    return 'assignee is required and must be a non-empty string';
  }
  return null;
};

module.exports = { validateCreateTask, validateUpdateTask, validateAssignTask };
