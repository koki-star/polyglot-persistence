// Simple input checks. Each one returns an error message or null.
const STATUSES = ['todo', 'doing', 'done'];

function text(value, field, max, required) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return required ? `${field} is required` : null;
  }
  if (typeof value !== 'string') return `${field} must be text`;
  if (value.trim().length > max) return `${field} must be ${max} characters or less`;
  return null;
}

function checkProject(body) {
  return text(body.name, 'name', 100, true) || text(body.description, 'description', 500, false);
}

function checkTask(body) {
  if (body.status !== undefined && !STATUSES.includes(body.status)) {
    return `status must be one of: ${STATUSES.join(', ')}`;
  }
  return text(body.title, 'title', 200, true);
}

// Clean values to save
function projectValues(body) {
  return { name: body.name.trim(), description: (body.description || '').trim() };
}

function taskValues(body) {
  return { title: body.title.trim(), status: body.status || 'todo' };
}

module.exports = { checkProject, checkTask, projectValues, taskValues };
