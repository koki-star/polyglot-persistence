# AI Prompt Log and Audit

## Prompt 1 (Canvas sample prompt, adapted to my domain)

```
Act as a senior database architect. I am designing a backend feature for a Task Management System with Projects and Tasks.

I need to implement polyglot persistence to compare relational (SQL) and non-relational (NoSQL) modeling:

Relational Schema (PostgreSQL/MySQL/SQLite):

   - Create normalized (3NF) tables with primary keys, foreign keys, timestamps, and indexes.

   - Ensure proper referential integrity (e.g., ON DELETE CASCADE).

NoSQL Schema (MongoDB/Document Store):

   - Design an idiomatic document model for the exact same domain.

   - Optimize for reading a complete project with its associated tasks in a single query (denormalized or embedded array).

Working Application / CRUD Service (Node.js, Python, or Go):

   - Implement basic CRUD endpoints/methods for both databases:

     * Create a record/document
     * Read by ID and list all records
     * Update an attribute
     * Delete a record

A minimal frontend or test script to execute and verify these operations against both databases.

Provide the SQL DDL statements, NoSQL schema/JSON structure, database connection logic, and CRUD controller code.
```

## Prompt 2 (my choices for the stack)

```
Use JavaScript with Node and Express. Use SQLite with better-sqlite3 for SQL and MongoDB in Docker for NoSQL.
Turn on PRAGMA foreign_keys, use REFERENCES with ON DELETE CASCADE, add an index on tasks.project_id,
and use only parameterized queries. In MongoDB, embed the tasks array in the project document,
use $push to add a task and the positional operator to update one task.
Return 200, 201, 400, and 404. A task with a project_id that does not exist must return 400.
Add one plain HTML page and tests with node --test.
```

## Audit Checklist

| Check | What I looked for | Result |
| --- | --- | --- |
| SQL referential integrity | Real `REFERENCES` on `tasks.project_id`, not only an integer column | OK. FK, `ON DELETE CASCADE`, and an index on `project_id` |
| SQLite FK enforcement | SQLite ignores foreign keys unless `PRAGMA foreign_keys = ON` | OK. The app turns it on. I tested it with a task for project 9999 and got 400 |
| NoSQL anti-patterns | Separate `projects` and `tasks` collections linked by ObjectId | OK. One collection, tasks embedded, one query to read |
| SQL injection | User text glued into the SQL string | OK. All queries use `?` placeholders |
| ID generation | Auto increment vs UUID or ObjectId | SQL uses `AUTOINCREMENT` (safe for one database file, not for several servers). MongoDB uses `ObjectId`, which is safe across servers |

## What the AI got right

- 3NF tables with primary keys, a foreign key, timestamps, and an index
- `ON DELETE CASCADE` on tasks
- An embedded `tasks` array in MongoDB, with `$push`, `tasks.$`, and `$pull`
- Input checks that return 400, and 404 when a record is missing

## What I had to fix

1. **Query log looked like string SQL.** The first draft used the driver's verbose log. It printed the SQL with my values already inside it, like `VALUES (9999.0, 'Orphan', 'todo')`. The query was still safe, but the terminal made it look like string concatenation. I changed the log to print the SQL with `?` and the values next to it.
2. **Test command was broken.** The draft test script was `node --test test/`. It failed with "Cannot find module". I changed it to `node --test`, which finds `test/api.test.js` by itself.

## Things I watch out for (not bugs in this draft, but common AI mistakes)

- Forgetting `PRAGMA foreign_keys = ON` in SQLite. Without it, an orphan task is saved with no error.
- Building SQL with template strings like `` `SELECT * FROM tasks WHERE id = ${id}` ``. That allows SQL injection.
- Making a separate `tasks` collection in MongoDB with a `projectId` field. Then every project read needs two queries or a `$lookup`.
- Sending a bad MongoDB id straight to the driver. It throws an error and the user gets 500 instead of 400.

## Trade-offs

- **Embedding vs a separate collection:** embedding makes the main read one query. If a project had a very large number of tasks, the document could get too big, and a separate collection would be better.
- **SQL timestamps:** SQLite saves them as UTC text. MongoDB saves real dates. The format looks different in the two APIs.
- **PUT needs the full record:** to update a task, I send both `title` and `status`. This keeps the code simple.
