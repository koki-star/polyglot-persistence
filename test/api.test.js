// QA checklist tests. Run with: npm test
// MongoDB must be running first: docker compose up -d
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../src/app');

let server;
let base;
let close;
let projects;

before(async () => {
  const made = await createApp({
    sqlFile: ':memory:', // fresh SQLite database in memory for each test run
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017',
    mongoDb: 'polyglot_test',
  });
  close = made.close;
  projects = made.projects;
  await projects.deleteMany({});
  server = made.app.listen(0);
  base = `http://localhost:${server.address().port}`;
});

after(async () => {
  await projects.deleteMany({});
  server.close();
  await close();
});

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

// ---------- 1. SQL CRUD and integrity ----------

test('SQL create and read: project and task come back with a JOIN', async () => {
  const p = await call('POST', '/api/sql/projects', { name: 'Website', description: 'Class site' });
  assert.strictEqual(p.status, 201);
  const t = await call('POST', '/api/sql/tasks', { project_id: p.body.id, title: 'Make home page' });
  assert.strictEqual(t.status, 201);

  const read = await call('GET', `/api/sql/projects/${p.body.id}`);
  assert.strictEqual(read.status, 200);
  assert.strictEqual(read.body.name, 'Website');
  assert.strictEqual(read.body.tasks.length, 1);
  assert.strictEqual(read.body.tasks[0].title, 'Make home page');

  const list = await call('GET', '/api/sql/projects');
  assert.strictEqual(list.status, 200);
  assert.ok(list.body.length >= 1);
});

test('SQL update: new value shows in the next read', async () => {
  const p = await call('POST', '/api/sql/projects', { name: 'App' });
  const t = await call('POST', '/api/sql/tasks', { project_id: p.body.id, title: 'Login page' });
  const up = await call('PUT', `/api/sql/tasks/${t.body.id}`, { title: 'Login page', status: 'done' });
  assert.strictEqual(up.status, 200);
  const read = await call('GET', `/api/sql/tasks/${t.body.id}`);
  assert.strictEqual(read.body.status, 'done');
});

test('SQL delete: deleting a project cascade deletes its tasks', async () => {
  const p = await call('POST', '/api/sql/projects', { name: 'Old project' });
  const t = await call('POST', '/api/sql/tasks', { project_id: p.body.id, title: 'Old task' });
  const del = await call('DELETE', `/api/sql/projects/${p.body.id}`);
  assert.strictEqual(del.status, 200);
  assert.strictEqual((await call('GET', `/api/sql/projects/${p.body.id}`)).status, 404);
  assert.strictEqual((await call('GET', `/api/sql/tasks/${t.body.id}`)).status, 404);
});

test('SQL negative test: task with a project_id that does not exist gets 400', async () => {
  const res = await call('POST', '/api/sql/tasks', { project_id: 9999, title: 'Orphan task' });
  assert.strictEqual(res.status, 400);
  assert.match(res.body.error, /FOREIGN KEY/);
});

test('SQL validation: empty name gets 400, missing id gets 404', async () => {
  assert.strictEqual((await call('POST', '/api/sql/projects', { name: '' })).status, 400);
  assert.strictEqual((await call('POST', '/api/sql/projects', { name: 'x'.repeat(101) })).status, 400);
  assert.strictEqual((await call('GET', '/api/sql/projects/12345')).status, 404);
});

// ---------- 2. NoSQL CRUD and documents ----------

test('Mongo create and read: one query returns the project with embedded tasks', async () => {
  const p = await call('POST', '/api/mongo/projects', {
    name: 'Website',
    tasks: [{ title: 'Make home page' }, { title: 'Add footer' }],
  });
  assert.strictEqual(p.status, 201);
  const read = await call('GET', `/api/mongo/projects/${p.body._id}`);
  assert.strictEqual(read.status, 200);
  assert.strictEqual(read.body.tasks.length, 2);

  const list = await call('GET', '/api/mongo/projects');
  assert.strictEqual(list.status, 200);
  assert.ok(list.body.length >= 1);
});

test('Mongo update: $push adds a task and tasks.$ updates one task', async () => {
  const p = await call('POST', '/api/mongo/projects', { name: 'App', tasks: [{ title: 'Login page' }] });
  const id = p.body._id;
  const taskId = p.body.tasks[0]._id;

  const pushed = await call('POST', `/api/mongo/projects/${id}/tasks`, { title: 'Sign up page' });
  assert.strictEqual(pushed.status, 201);
  assert.strictEqual(pushed.body.tasks.length, 2);

  const up = await call('PUT', `/api/mongo/projects/${id}/tasks/${taskId}`, { title: 'Login page', status: 'done' });
  assert.strictEqual(up.status, 200);

  const read = await call('GET', `/api/mongo/projects/${id}`);
  assert.strictEqual(read.body.tasks[0].status, 'done');
  assert.strictEqual(read.body.tasks[1].status, 'todo');
});

test('Mongo delete: the document is gone after delete', async () => {
  const p = await call('POST', '/api/mongo/projects', { name: 'Old project' });
  const del = await call('DELETE', `/api/mongo/projects/${p.body._id}`);
  assert.strictEqual(del.status, 200);
  assert.strictEqual((await call('GET', `/api/mongo/projects/${p.body._id}`)).status, 404);
});

test('Mongo validation: bad id gets 400, empty title gets 400', async () => {
  assert.strictEqual((await call('GET', '/api/mongo/projects/abc')).status, 400);
  const p = await call('POST', '/api/mongo/projects', { name: 'Check' });
  assert.strictEqual((await call('POST', `/api/mongo/projects/${p.body._id}/tasks`, { title: '' })).status, 400);
});
