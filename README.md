# Polyglot Persistence

This project saves the same Projects and Tasks data in two databases:

- SQLite (SQL) with two tables and a foreign key
- MongoDB (NoSQL) with one collection where tasks sit inside each project

It is a Node.js and Express API with Create, Read, Update and Delete (CRUD) for both databases. A simple HTML page lets me click through each call.

## Domain

A project has a name and a description. A task belongs to one project and has a title and a status (`todo`, `doing` or `done`). One project can have many tasks.

The main read is "show one project with all its tasks", so I built both databases around that.

## SQL Schema (SQLite)

The app creates these tables when it starts (`src/sql.js`).

```sql
PRAGMA foreign_keys = ON;

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
```

ER diagram:

```
projects                     tasks
+-------------+              +----------------+
| id (PK)     |----1 : N---->| id (PK)        |
| name        |              | project_id (FK)|
| description |              | title          |
| created_at  |              | status         |
| updated_at  |              | created_at     |
+-------------+              | updated_at     |
                             +----------------+
```

Why I built it this way:

- Project data is only in `projects` and task data is only in `tasks`. Nothing is copied (3NF).
- `project_id` has a real foreign key. The app turns on `PRAGMA foreign_keys` because SQLite does not check foreign keys by default.
- `ON DELETE CASCADE` removes the tasks when their project is deleted.
- The index on `project_id` makes finding a project's tasks fast.
- Every query uses `?` placeholders, so user input never goes into the SQL text.

## NoSQL Schema (MongoDB)

One collection, `projects`. Each project keeps its tasks in a `tasks` array.

```json
{
  "_id": { "$oid": "6afa3da38cab3d65c12fd0b3" },
  "name": "Website",
  "description": "Class site",
  "tasks": [
    { "_id": { "$oid": "6afa3da38cab3d65c12fd0b2" }, "title": "Make home page", "status": "done" },
    { "_id": { "$oid": "6afa3da38cab3d65c12fd0b4" }, "title": "Add contact form", "status": "todo" }
  ],
  "createdAt": { "$date": "2026-11-15T23:17:55.442Z" },
  "updatedAt": { "$date": "2026-11-15T23:20:10.120Z" }
}
```

Why I built it this way:

- One `findOne` gets the project and all its tasks. No join and no second query.
- `$push` adds a task, and `tasks.$` updates one task in a single update.
- Deleting the project also removes its tasks because they live inside it.
- This works well for a small number of tasks. If one project had a huge number of tasks, a separate collection would be better.

In SQL, reading a project with its tasks needs a JOIN. In MongoDB it is one read of one document.

## Setup (macOS)

I need Node.js 20 or newer and Docker Desktop (open and running). `sqlite3` already comes with macOS.

From the project folder:

```bash
npm install
docker compose up -d
npm start
```

Then open http://localhost:3000. The app makes the SQLite tables on start, and MongoDB makes the collection on the first insert.

Run the tests in a second terminal:

```bash
npm test
```

The tests use a separate in-memory SQLite database and a separate MongoDB database, so they do not change the demo data.

Look at the data:

```bash
sqlite3 -header -column data.db "SELECT p.name, t.title, t.status FROM projects p JOIN tasks t ON t.project_id = p.id;"
docker exec -it polyglot-mongo mongosh polyglot --eval "db.projects.find()"
```

Stop:

```bash
docker compose down
```

## API Endpoints

| Method | URL | What it does |
| --- | --- | --- |
| GET, POST | `/api/sql/projects` | List or create projects |
| GET, PUT, DELETE | `/api/sql/projects/:id` | Read (with tasks), update or delete a project |
| GET, POST | `/api/sql/tasks` | List or create tasks |
| GET, PUT, DELETE | `/api/sql/tasks/:id` | Read, update or delete a task |
| GET, POST | `/api/mongo/projects` | List or create project documents |
| GET, PUT, DELETE | `/api/mongo/projects/:id` | Read, update or delete a project document |
| POST | `/api/mongo/projects/:id/tasks` | Add a task with `$push` |
| PUT, DELETE | `/api/mongo/projects/:id/tasks/:taskId` | Update or remove one task |

Status codes: 200 OK, 201 Created, 400 for bad input or a `project_id` that does not exist, and 404 when the record is not found.

## QA Test Summary

`npm test`: 9 tests, 9 passed.

SQL:

- [x] Create a project and a task, then read them together with a JOIN
- [x] Update a task status and see the change on the next read
- [x] Delete a project and its tasks are deleted too (cascade)
- [x] A task with a wrong `project_id` is rejected with `FOREIGN KEY constraint failed`

MongoDB:

- [x] Create a project with tasks and read it with one query
- [x] Add a task with `$push` and update one task in the array
- [x] Delete the document and it is gone

Page and terminal:

- [x] The page works on desktop and phone width, and long text wraps
- [x] Empty inputs return 400 with a clear message
- [x] The terminal shows SQL with `?` placeholders and no driver warnings

## AI Audit

My prompts and what I fixed in the AI draft are in [ai-prompt-log.md](ai-prompt-log.md).

## AI Transparency

AI was used to create part of this file and to clean up its writing and formatting.
