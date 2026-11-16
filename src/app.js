const path = require('path');
const express = require('express');
const { openSql, sqlRepo } = require('./sql');
const { openMongo, mongoRepo, toId } = require('./mongo');
const { checkProject, checkTask, projectValues, taskValues } = require('./validate');

async function createApp(options) {
  const db = openSql(options.sqlFile);
  const sql = sqlRepo(db, options.logQueries);
  const { client, projects } = await openMongo(options.mongoUri, options.mongoDb);
  const mongo = mongoRepo(projects);

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  const bad = (res, message) => res.status(400).json({ error: message });
  const notFound = (res, what) => res.status(404).json({ error: `${what} not found` });

  // SQL ids must be positive whole numbers
  function sqlId(req, res, name = 'id') {
    const id = Number(req.params[name]);
    if (!Number.isInteger(id) || id < 1) {
      bad(res, 'id must be a positive number');
      return null;
    }
    return id;
  }

  // Mongo ids must be valid ObjectIds
  function mongoId(req, res, name = 'id') {
    const id = toId(req.params[name]);
    if (!id) bad(res, `${name} is not a valid ObjectId`);
    return id;
  }

  // ---------- SQL: projects ----------
  app.get('/api/sql/projects', (req, res) => res.json(sql.listProjects()));

  app.get('/api/sql/projects/:id', (req, res) => {
    const id = sqlId(req, res);
    if (!id) return;
    const project = sql.getProject(id);
    project ? res.json(project) : notFound(res, 'project');
  });

  app.post('/api/sql/projects', (req, res) => {
    const error = checkProject(req.body || {});
    if (error) return bad(res, error);
    const { name, description } = projectValues(req.body);
    res.status(201).json(sql.createProject(name, description));
  });

  app.put('/api/sql/projects/:id', (req, res) => {
    const id = sqlId(req, res);
    if (!id) return;
    const error = checkProject(req.body || {});
    if (error) return bad(res, error);
    const { name, description } = projectValues(req.body);
    const project = sql.updateProject(id, name, description);
    project ? res.json(project) : notFound(res, 'project');
  });

  app.delete('/api/sql/projects/:id', (req, res) => {
    const id = sqlId(req, res);
    if (!id) return;
    sql.deleteProject(id) ? res.json({ deleted: id }) : notFound(res, 'project');
  });

  // ---------- SQL: tasks ----------
  app.get('/api/sql/tasks', (req, res) => res.json(sql.listTasks()));

  app.get('/api/sql/tasks/:id', (req, res) => {
    const id = sqlId(req, res);
    if (!id) return;
    const task = sql.getTask(id);
    task ? res.json(task) : notFound(res, 'task');
  });

  app.post('/api/sql/tasks', (req, res) => {
    const body = req.body || {};
    const error = checkTask(body);
    if (error) return bad(res, error);
    const projectId = Number(body.project_id);
    if (!Number.isInteger(projectId)) return bad(res, 'project_id must be a number');
    const { title, status } = taskValues(body);
    // No check here on purpose. The database foreign key rejects a bad project_id.
    res.status(201).json(sql.createTask(projectId, title, status));
  });

  app.put('/api/sql/tasks/:id', (req, res) => {
    const id = sqlId(req, res);
    if (!id) return;
    const error = checkTask(req.body || {});
    if (error) return bad(res, error);
    const { title, status } = taskValues(req.body);
    const task = sql.updateTask(id, title, status);
    task ? res.json(task) : notFound(res, 'task');
  });

  app.delete('/api/sql/tasks/:id', (req, res) => {
    const id = sqlId(req, res);
    if (!id) return;
    sql.deleteTask(id) ? res.json({ deleted: id }) : notFound(res, 'task');
  });

  // ---------- MongoDB: projects with embedded tasks ----------
  app.get('/api/mongo/projects', async (req, res) => res.json(await mongo.list()));

  app.get('/api/mongo/projects/:id', async (req, res) => {
    const id = mongoId(req, res);
    if (!id) return;
    const project = await mongo.get(id);
    project ? res.json(project) : notFound(res, 'project');
  });

  app.post('/api/mongo/projects', async (req, res) => {
    const body = req.body || {};
    const error = checkProject(body);
    if (error) return bad(res, error);
    const tasks = Array.isArray(body.tasks) ? body.tasks : [];
    for (const t of tasks) {
      const taskError = checkTask(t || {});
      if (taskError) return bad(res, taskError);
    }
    const { name, description } = projectValues(body);
    res.status(201).json(await mongo.create(name, description, tasks.map(taskValues)));
  });

  app.put('/api/mongo/projects/:id', async (req, res) => {
    const id = mongoId(req, res);
    if (!id) return;
    const error = checkProject(req.body || {});
    if (error) return bad(res, error);
    const { name, description } = projectValues(req.body);
    const project = await mongo.update(id, name, description);
    project ? res.json(project) : notFound(res, 'project');
  });

  app.delete('/api/mongo/projects/:id', async (req, res) => {
    const id = mongoId(req, res);
    if (!id) return;
    (await mongo.remove(id)) ? res.json({ deleted: id }) : notFound(res, 'project');
  });

  app.post('/api/mongo/projects/:id/tasks', async (req, res) => {
    const id = mongoId(req, res);
    if (!id) return;
    const error = checkTask(req.body || {});
    if (error) return bad(res, error);
    const { title, status } = taskValues(req.body);
    const project = await mongo.addTask(id, title, status);
    project ? res.status(201).json(project) : notFound(res, 'project');
  });

  app.put('/api/mongo/projects/:id/tasks/:taskId', async (req, res) => {
    const id = mongoId(req, res);
    if (!id) return;
    const taskId = mongoId(req, res, 'taskId');
    if (!taskId) return;
    const error = checkTask(req.body || {});
    if (error) return bad(res, error);
    const { title, status } = taskValues(req.body);
    const project = await mongo.updateTask(id, taskId, title, status);
    project ? res.json(project) : notFound(res, 'project or task');
  });

  app.delete('/api/mongo/projects/:id/tasks/:taskId', async (req, res) => {
    const id = mongoId(req, res);
    if (!id) return;
    const taskId = mongoId(req, res, 'taskId');
    if (!taskId) return;
    const project = await mongo.removeTask(id, taskId);
    project ? res.json(project) : notFound(res, 'project or task');
  });

  app.use('/api', (req, res) => notFound(res, 'route'));

  // Error handler. A foreign key error becomes 400, not a crash.
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return bad(res, 'body must be valid JSON');
    if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      return bad(res, 'FOREIGN KEY constraint failed: project_id does not exist');
    }
    if (err.code && String(err.code).startsWith('SQLITE_CONSTRAINT')) return bad(res, err.message);
    console.error(err);
    res.status(500).json({ error: 'server error' });
  });

  async function close() {
    db.close();
    await client.close();
  }

  return { app, close, projects };
}

module.exports = { createApp };
