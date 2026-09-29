# Task Manager API — The Untested API

A small Express REST API for managing tasks, with an in-memory data store. This submission adds a full Jest/Supertest test suite, a bug report ([BUGS.md](./BUGS.md)), fixes for the confirmed bugs, and the new `PATCH /tasks/:id/assign` endpoint.

The original brief is in [ASSIGNMENT.md](./ASSIGNMENT.md).

## Tech Stack

- Node.js (18+)
- Express 4
- Jest 29 (unit tests + coverage)
- Supertest (HTTP integration tests)
- uuid (task IDs)

No new dependencies were added.

## Setup

```bash
git clone <repository-url>
cd <project-directory>/task-api
npm install
```

## Run

```bash
npm start            # http://localhost:3000
PORT=8080 npm start  # custom port
```

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `PORT`   | No       | `3000`  | Port the HTTP server listens on |

There are no other environment variables and no secrets. The data store is in memory and resets whenever the server restarts.

## Test

```bash
npm test             # run all tests
npm run test:watch   # re-run on change
npm run coverage     # run with coverage report (HTML in task-api/coverage/)
```

`jest.config.js` enforces a global coverage threshold of 80% (the assignment's minimum) for statements, branches, functions and lines.

### Current results

```
Test Suites: 4 passed, 4 total
Tests:       126 passed, 126 total

File             | % Stmts | % Branch | % Funcs | % Lines
All files        |   98.75 |    97.26 |   97.05 |   98.63
 app.js          |   88.23 |     87.5 |   66.66 |   88.23
 routes/tasks.js |     100 |      100 |     100 |     100
 taskService.js  |     100 |    95.23 |     100 |     100
 validators.js   |     100 |      100 |     100 |     100
```

What's left uncovered, and why:
- the `app.listen(...)` block in `app.js`. It only runs when the file is started directly, and I verified it manually with `npm start`.
- one defensive branch in `getStats()` for a task with an unknown status. Validation now makes that state impossible to reach through the API.

## Project Structure

```
task-api/
  src/
    app.js                  # Express app, /health, error handler
    routes/tasks.js         # Route handlers
    services/taskService.js # Business logic + in-memory store
    utils/validators.js     # Input validation
  tests/
    taskService.test.js        # Unit tests: service layer
    validators.test.js         # Unit tests: validation rules
    tasks.integration.test.js  # HTTP tests for every /tasks endpoint
    app.test.js                # /health, error handling
  jest.config.js
  package.json
BUGS.md                     # Bug report
ASSIGNMENT.md               # Original brief
```

## API Endpoints

| Method   | Path                  | Success | Errors | Description |
|----------|-----------------------|---------|--------|-------------|
| `GET`    | `/health`             | 200     |        | Liveness check → `{ "status": "ok" }` |
| `GET`    | `/tasks`              | 200     |        | List tasks. Optional `?status=`, `?page=`, `?limit=` (combinable) |
| `GET`    | `/tasks/stats`        | 200     |        | `{ todo, in_progress, done, overdue }` |
| `POST`   | `/tasks`              | 201     | 400    | Create a task |
| `PUT`    | `/tasks/:id`          | 200     | 400, 404 | Update a task (partial merge; see below) |
| `DELETE` | `/tasks/:id`          | 204     | 404    | Delete a task |
| `PATCH`  | `/tasks/:id/complete` | 200     | 404    | Mark a task as done |
| `PATCH`  | `/tasks/:id/assign`   | 200     | 400, 404 | Assign a task to a person (**new**) |

All errors use the shape `{ "error": "<message>" }`. A malformed JSON body returns `400 { "error": "Invalid request body" }`.

### Task shape

```json
{
  "id": "uuid",
  "title": "string (required)",
  "description": "string",
  "status": "todo | in_progress | done",
  "priority": "low | medium | high",
  "dueDate": "ISO 8601 date string or null",
  "assignee": "string or null",
  "completedAt": "ISO 8601 or null",
  "createdAt": "ISO 8601"
}
```

Defaults on create: `status: "todo"`, `priority: "medium"`, `description: ""`, `dueDate: null`, `assignee: null`.

### Query parameters for `GET /tasks`

- `status`: exact match on `todo`, `in_progress` or `done`. An unknown value returns `[]`.
- `page`: 1-indexed page number (default `1`).
- `limit`: page size (default `10`).
- Pagination is applied when `page` or `limit` is present. Values that aren't positive integers fall back to the defaults. With `status`, pagination applies to the filtered list.

### Examples

```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Write tests", "priority": "high"}'

curl "http://localhost:3000/tasks?status=todo&page=1&limit=10"

curl -X PATCH http://localhost:3000/tasks/<id>/complete

curl -X PATCH http://localhost:3000/tasks/<id>/assign \
  -H "Content-Type: application/json" \
  -d '{"assignee": "Mukund"}'
```

## New Feature — `PATCH /tasks/:id/assign`

```http
PATCH /tasks/:id/assign
Content-Type: application/json

{ "assignee": "Mukund" }
```

| Case | Response |
|------|----------|
| Valid name | `200` with the full updated task |
| `assignee` missing, `""`, whitespace-only, or not a string (`123`, `null`, `true`, arrays, objects) | `400 { "error": "assignee is required and must be a non-empty string" }` |
| Task does not exist | `404 { "error": "Task not found" }` |

Design decisions:

- **Validation lives in `validators.js`** (`validateAssignTask`), next to the existing validators, and returns an error string the same way they do. The route follows the same flow as `PUT`: validate → 400, then look up the task → 404, then 200.
- **Validation runs before the task lookup**, as it does for `PUT`. A bad body sent to an unknown id therefore returns 400, not 404.
- **Whitespace is rejected and names are trimmed.** `"   "` is treated as empty, and `"  Mukund "` is stored as `"Mukund"`. That way the stored value never has stray whitespace.
- **Reassignment is allowed.** Assigning an already-assigned task replaces the assignee and returns 200. The brief asks what should happen, and I chose overwriting because it's the least surprising behavior for a single-field update and needs no extra endpoint. If the business wanted "claim" semantics, a 409 for already-assigned tasks would be easy to add.
- **Every task now has an `assignee` field** (default `null` on create), so clients get a consistent shape instead of a field that appears only after assignment.
- **Only `assignee` changes.** Status, priority, dates and every other field are left alone, and the tests check this.
- **No unassign operation.** The brief doesn't ask for one, so empty values are rejected rather than treated as "unassign". A dedicated `DELETE /tasks/:id/assign` would be a cleaner way to add it later.

## Bugs Found

I found and documented 11 issues in [BUGS.md](./BUGS.md), each with location, expected vs actual behavior, reproduction steps, root cause, and the test that catches it. In short:

1. Pagination offset was `page * limit`, so page 1 skipped the first page of results.
2. The status filter used substring matching (`?status=do` matched `todo` and `done`).
3. Completing a task reset its priority to `medium`.
4. `PUT` could overwrite a task's `id`/`createdAt`, orphaning the task.
5. Malformed JSON returned 500 instead of 400.
6. `status: ""` / `priority: ""` bypassed validation and were stored.
7. `?status=` silently disabled pagination.
8. Zero or negative `page`/`limit` produced wrong slices.
9. `completedAt` isn't kept in sync when status changes via `PUT` *(documented, not fixed)*.
10. Re-completing a task overwrites the original `completedAt` *(documented, not fixed)*.
11. The starter README documented the wrong status values *(fixed in these docs)*.

## Bugs Fixed

Bugs **1–8** are fixed. Each fix is a small, targeted change marked with a comment referencing `BUGS.md`, and each has a regression test that failed against the original code.

The headline fixes, and why:

- **Pagination (#1)**: `(page - 1) * limit`. The API is 1-indexed (defaults to `page=1`), so the first page was unreachable.
- **Exact status filter (#2)**: `===` instead of `.includes()`. Filtering on an enum must not return tasks with other statuses.
- **Completion keeps priority (#3)**: removed the hard-coded `priority: 'medium'`. Completing a task shouldn't silently change unrelated data.

Bugs 9 and 10 depend on product decisions about how `completedAt` should behave, so I documented them with recommended fixes rather than guessing.

## Testing Strategy

126 tests across 4 suites, run with `npm test`.

- **Unit tests: service** (`taskService.test.js`, 33 tests). Covers every service function: `getAll`, `findById`, `getByStatus`, `getPaginated`, `getStats`, `create`, `update`, `remove`, `completeTask`, `assignTask`. Tests call the service directly to check business rules such as page boundaries, overdue calculation (past-due tasks count; done or future tasks don't), defaults, and that unrelated fields are preserved.
- **Unit tests: validators** (`validators.test.js`, 33 tests). Each validation rule, using parameterised cases for empty, whitespace, wrong-type, `null` and invalid-enum inputs.
- **Integration tests** (`tasks.integration.test.js`, 56 tests). Every endpoint over real HTTP via Supertest, checking status codes, response bodies, the error shape, and side effects. For example, a rejected `POST` must not create anything, and a rejected `assign` must leave the task untouched.
- **App tests** (`app.test.js`, 4 tests). `/health`, unknown routes, malformed JSON → 400, and an unexpected exception → 500 without leaking details. For the last one, a service method is mocked to throw.

**Edge cases covered** include missing, empty, whitespace-only and wrong-type fields; invalid enum values; non-object JSON bodies and malformed JSON; unknown ids; deleting twice; assigning a deleted task; pages beyond the data; zero, negative and non-numeric pagination; partial status strings; an empty data set; completing an already completed task; and reassignment.

**Test isolation.** The store is a module-level array shared by the app and the tests. Every suite calls the service's existing `_reset()` in `beforeEach` and seeds known tasks, so no test depends on another test's `POST`/`PUT`/`DELETE` or on run order. No new reset mechanism was needed.

**Process.** I wrote the tests against the intended contract *before* changing any code. On the original code, 57 of 126 tests failed. That list drove the bug report, and I then made fixes until the suite passed.

## Deployment

The app needs no database or build step, and it's ready to run on any Node host (Render, Railway, Fly.io, etc.):

- Binds to `process.env.PORT || 3000` on `0.0.0.0`.
- `GET /health` for platform health checks.
- `"engines": { "node": ">=18" }` in `package.json`.

Suggested platform settings:

| Setting | Value |
|---------|-------|
| Root directory | `task-api` |
| Build command | `npm ci` |
| Start command | `npm start` |
| Health check path | `/health` |

Because storage is in memory, data is lost on every restart or redeploy and isn't shared between instances. Run a single instance.

## Production Considerations

These are **not** implemented. They're what I'd look at before real production use:

- **Persistent, concurrency-safe storage** (e.g. PostgreSQL) instead of the in-memory array, so data survives restarts and multiple instances can run.
- **Authentication and authorization**: who can create, delete or assign tasks, and whether `assignee` should reference a real user id rather than a free-text name.
- **Schema-based validation** (e.g. zod/Joi) that also rejects unknown fields and applies length limits.
- **Structured logging** and request IDs instead of `console.error`, plus **monitoring/alerting** on error rates.
- **Rate limiting** and body-size limits.
- **OpenAPI documentation** generated from, or checked against, the schema.
- **CI/CD** running `npm run coverage` on every pull request.
- **A total count in list responses** (or pagination metadata) so clients know how many pages exist.

## Reflection

**What I'd test next.** I'd add property-based tests for pagination (every task appears on exactly one page for any `limit`). I'd test concurrent requests once there's a real datastore, and `dueDate` edge cases around time zones and "due today". I'd also add contract tests generated from an OpenAPI spec.

**What surprised me.**
- `completeTask` silently resetting priority. It looks like a copy/paste from `create()` and is easy to miss without a test that compares the whole object.
- The starter README documented statuses (`pending | in-progress | completed`) that the code rejects.
- `PUT` is described as a full update but behaves as a partial merge, which also allowed the id overwrite.
- `?status=` and pagination couldn't be combined, even though the README's own example combines them.

**Questions before shipping to production.**
- Should `PUT` be a true full replace or stay a partial merge? If partial, should it be `PATCH`?
- Should `completedAt` follow status changes made via `PUT` (bug #9)? Should re-completing keep the original timestamp (bug #10)?
- Is `assignee` a free-text name or a reference to a user? Should assigning an already-assigned task require an explicit override?
- Should invalid pagination parameters return 400 instead of silently using the defaults?
- What are the persistence, retention and multi-instance requirements?
