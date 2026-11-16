// SQL side: SQLite with better-sqlite3
const Database = require('better-sqlite3');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
`;

function openSql(file) {
  const db = new Database(file);
  // SQLite does not check foreign keys unless this is ON
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

// All queries use ? placeholders. User input is never added to the SQL string.
// When logQueries is true, the terminal shows the SQL with ? and the values next to it.
function sqlRepo(db, logQueries) {
  function query(mode, sql, ...params) {
    if (logQueries) console.log('[sql]', sql.replace(/\s+/g, ' ').trim(), '| values:', JSON.stringify(params));
    return db.prepare(sql)[mode](...params);
  }
  const all = (sql, ...p) => query('all', sql, ...p);
  const get = (sql, ...p) => query('get', sql, ...p);
  const run = (sql, ...p) => query('run', sql, ...p);

  return {
    listProjects: () => all('SELECT * FROM projects ORDER BY id'),

    // One JOIN query gives the project and its tasks
    getProject(id) {
      const rows = all(`
        SELECT p.id, p.name, p.description, p.created_at, p.updated_at,
               t.id AS task_id, t.title, t.status
        FROM projects p
        LEFT JOIN tasks t ON t.project_id = p.id
        WHERE p.id = ?
        ORDER BY t.id`, id);
      if (rows.length === 0) return null;
      const first = rows[0];
      return {
        id: first.id,
        name: first.name,
        description: first.description,
        created_at: first.created_at,
        updated_at: first.updated_at,
        tasks: rows.filter((r) => r.task_id !== null)
          .map((r) => ({ id: r.task_id, title: r.title, status: r.status })),
      };
    },

    createProject(name, description) {
      const info = run('INSERT INTO projects (name, description) VALUES (?, ?)', name, description);
      return this.getProject(info.lastInsertRowid);
    },

    updateProject(id, name, description) {
      const info = run(`UPDATE projects SET name = ?, description = ?, updated_at = datetime('now')
                 WHERE id = ?`, name, description, id);
      return info.changes === 0 ? null : this.getProject(id);
    },

    // ON DELETE CASCADE removes the tasks too
    deleteProject: (id) => run('DELETE FROM projects WHERE id = ?', id).changes > 0,

    listTasks: () => all('SELECT * FROM tasks ORDER BY id'),

    getTask: (id) => get('SELECT * FROM tasks WHERE id = ?', id) || null,

    createTask(projectId, title, status) {
      const info = run('INSERT INTO tasks (project_id, title, status) VALUES (?, ?, ?)', projectId, title, status);
      return this.getTask(info.lastInsertRowid);
    },

    updateTask(id, title, status) {
      const info = run(`UPDATE tasks SET title = ?, status = ?, updated_at = datetime('now')
                 WHERE id = ?`, title, status, id);
      return info.changes === 0 ? null : this.getTask(id);
    },

    deleteTask: (id) => run('DELETE FROM tasks WHERE id = ?', id).changes > 0,
  };
}

module.exports = { openSql, sqlRepo, SCHEMA };
