# Take-Home Assignment — Task API

An Express REST API for managing tasks (in-memory store), with a full Jest/Supertest test suite, a bug report, fixes for the confirmed bugs, and the new `PATCH /tasks/:id/assign` endpoint. The original brief is in [ASSIGNMENT.md](./ASSIGNMENT.md).

## Submission Links

- **GitHub:** https://github.com/Mmukund-31/Assignment
- **Live API:** _pending: not deployed yet (see [Deployment](#deployment))_
- **Health Check:** _pending: `<live-url>/health` once deployed_

## Overview

| Area | Status |
|------|--------|
| Unit tests (service + validators) | 81 tests |
| Integration tests (HTTP, every endpoint) | 74 tests + 4 app-level tests |
| Coverage | 98.83% statements / 97.67% branches / 97.14% functions / 98.69% lines (threshold: 80%) |
| Bug report | [BUGS.md](./BUGS.md): 10 confirmed defects (9 code fixes + 1 docs fix), 3 product questions |
| New endpoint | `PATCH /tasks/:id/assign` |
| CI | GitHub Actions runs tests + coverage on every push/PR |

## Tech Stack

Node.js 18+, Express 4, uuid, Jest 29, Supertest. No dependencies were added to the starter.

## Project Structure

```
task-api/
  src/
    app.js                  # Express app, /health, error handler
    routes/tasks.js         # Route handlers
    services/taskService.js # Business logic + in-memory store
    utils/validators.js     # Input validation
  tests/
    taskService.test.js        # Unit: service layer
    validators.test.js         # Unit: validation rules
    tasks.integration.test.js  # HTTP tests for every /tasks endpoint
    app.test.js                # /health, error handling
  jest.config.js
  package.json
.github/workflows/test.yml  # CI
render.yaml                 # Render deployment blueprint
BUGS.md                     # Bug report
ASSIGNMENT.md               # Original brief
```

## Setup

```bash
git clone https://github.com/Mmukund-31/Assignment.git
cd Assignment/task-api
npm install
```

## Running Locally

```bash
npm start              # http://localhost:3000
PORT=8080 npm start    # custom port
```

`PORT` is the only environment variable (optional, default `3000`). There are no secrets, so no `.env` file is needed. Data is held in memory and resets on restart.

## Running Tests

```bash
npm test               # all tests
npm run test:watch     # re-run on change
```

## Coverage

```bash
npm run coverage       # prints a table; HTML report in task-api/coverage/
```

`jest.config.js` fails the run if any global metric drops below 80%. Latest run: **4 suites, 159 tests, all passing**.

| File | Statements | Branches | Functions | Lines |
|------|-----------|----------|-----------|-------|
| **All files** | **98.83%** | **97.67%** | **97.14%** | **98.69%** |
| routes/tasks.js | 100% | 100% | 100% | 100% |
| utils/validators.js | 100% | 100% | 100% | 100% |
| services/taskService.js | 100% | 95.23% | 100% | 100% |
| app.js | 88.23% | 87.5% | 66.66% | 88.23% |

Not covered: the `app.listen(...)` block in `app.js` (only runs when started directly; verified manually with `npm start`) and one defensive branch in `getStats()` for a task with an unknown status, which validation makes unreachable through the API.

## API Endpoints

All errors use `{ "error": "<message>" }`.

| Method | Path | Purpose | Success | Errors |
|--------|------|---------|---------|--------|
| `GET` | `/` | Landing response listing the main endpoints | 200 | |
| `GET` | `/health` | Liveness check → `{ "status": "ok" }` | 200 | |
| `GET` | `/tasks` | List tasks. Query: `status`, `page`, `limit` (combinable) | 200 (array) | |
| `GET` | `/tasks/stats` | `{ todo, in_progress, done, overdue }` | 200 | |
| `POST` | `/tasks` | Create. Body: `title` (required), optional `description`, `status`, `priority`, `dueDate` | 201 (task) | 400 |
| `PUT` | `/tasks/:id` | Update given fields (partial merge; `id`/`createdAt` ignored) | 200 (task) | 400, 404 |
| `DELETE` | `/tasks/:id` | Delete | 204 | 404 |
| `PATCH` | `/tasks/:id/complete` | Set `status: "done"` and `completedAt`; other fields unchanged | 200 (task) | 404 |
| `PATCH` | `/tasks/:id/assign` | Set the assignee (see below) | 200 (task) | 400, 404 |

There is no `GET /tasks/:id` route: the original brief doesn't define one, so none was added.

**Task shape**

```json
{
  "id": "uuid",
  "title": "string",
  "description": "string",
  "status": "todo | in_progress | done",
  "priority": "low | medium | high",
  "dueDate": "date string or null",
  "assignee": "string or null",
  "completedAt": "ISO 8601 or null",
  "createdAt": "ISO 8601"
}
```

Defaults on create: `status: "todo"`, `priority: "medium"`, `description: ""`, `dueDate: null`, `assignee: null`.

**`GET /tasks` query parameters**

- `status`: exact match on `todo`, `in_progress` or `done`; unknown values return `[]`.
- `page` (default `1`, 1-indexed) and `limit` (default `10`): must be positive integers. Anything else (`0`, `-1`, `2abc`, `2.5`, empty) falls back to the default. With `status`, pagination applies to the filtered list.

**Request bodies** must be JSON objects. `null`, arrays, strings and numbers return `400`; malformed JSON returns `400 { "error": "Invalid request body" }`.

## PATCH /tasks/:id/assign

```bash
curl -X PATCH http://localhost:3000/tasks/<id>/assign \
  -H "Content-Type: application/json" \
  -d '{"assignee": "Mukund"}'
```

| Case | Response |
|------|----------|
| Valid name | `200 OK`, full updated task |
| `assignee` missing, `""`, whitespace-only, or not a string (`123`, `null`, `true`, array, object); body not an object | `400 Bad Request` |
| Task does not exist | `404 Not Found` `{ "error": "Task not found" }` |

- **Reassignment is supported.** Assigning an already-assigned task replaces the assignee (Alice → Bob gives Bob) and returns 200.
- **Unrelated fields are preserved.** Only `assignee` changes; tests compare the whole task before and after.
- **Names are trimmed**, so `"  Mukund "` is stored as `"Mukund"`.

## Bugs Found

Full detail (location, expected vs actual, reproduction, root cause, test, fix, regression protection) is in [BUGS.md](./BUGS.md). Confirmed defects:

1. Pagination offset was `page * limit`, so page 1 skipped the first page.
2. Status filter used substring matching (`?status=do` matched `todo` and `done`).
3. Completing a task reset its priority to `medium`.
4. `PUT` could overwrite `id`/`createdAt`, orphaning the task.
5. Malformed JSON returned 500 instead of 400.
6. `status: ""` / `priority: ""` bypassed validation.
7. `?status=` silently disabled pagination.
8. Invalid `page`/`limit` mishandled (negative offsets; `parseInt` read `2abc` as `2`).
9. Non-object bodies (`null`, `[]`, …) crashed or bypassed validation.
10. The starter README documented status values the code rejects.

## Bugs Fixed

Defects **1–9 are fixed in code** and #10 in this README. Each fix is a small targeted change, marked with a comment referencing `BUGS.md`, and has a regression test that fails against the previous code. Headline fixes: `(page - 1) * limit` for pagination, `===` for exact status matching, and no longer overwriting `priority` on completion.

## Testing Strategy

- **Unit tests:** every service function (`getAll`, `findById`, `getByStatus`, `getPaginated`, `getStats`, `create`, `update`, `remove`, `completeTask`, `assignTask`) and every validator rule, called directly.
- **Integration tests:** every endpoint over HTTP with Supertest, checking status codes, response bodies, the error shape, and side effects (a rejected request must not change state).
- **Edge cases:** missing/empty/whitespace/wrong-type fields; invalid enums; malformed and non-object bodies; unknown ids; double delete; assigning a deleted task; pages beyond the data; strict pagination parsing; partial status strings; empty store; re-completing a task; reassignment.
- **Isolation:** the store is a module-level array, so every test calls the service's `_reset()` (a test-only helper, not reachable over HTTP) in `beforeEach` and seeds known data. No test depends on another or on run order.
- **Process:** tests were written against the intended contract first; on the original starter code 57 of 126 tests failed, which produced the bug list.

## Design Decisions

- **Kept the starter architecture** (routes → service → in-memory store, validators as pure functions). No new dependencies, frameworks or layers.
- **Validation before lookup** for `PUT` and `assign`, so a bad body sent to an unknown id returns 400, not 404.
- **Lenient pagination:** invalid `page`/`limit` fall back to defaults rather than returning 400, which keeps the starter's original intent (`|| 1`, `|| 10`).
- **`PUT` ignores `id`/`createdAt`** instead of rejecting them, since clients often send whole objects back.
- **Reassignment overwrites** the previous assignee; there is no "unassign" operation (empty values are rejected).

## Questions Before Production

Not bugs; the brief doesn't define the behavior, so I did not guess (details in [BUGS.md](./BUGS.md)):

1. Should calling `PATCH /tasks/:id/complete` repeatedly preserve the original `completedAt` or refresh it?
2. If `PUT /tasks/:id` changes `status` to `done`, should `completedAt` be set automatically (and cleared when reopened)?
3. Is `PUT` a full replace or a partial merge? (Currently partial.)
4. Is `assignee` free text or a reference to a user? Should assigning an already-assigned task require an explicit override?
5. Should invalid pagination parameters return 400 instead of silently using defaults?

## Production Considerations

**Implemented:** in-memory store, input validation, consistent error shape, `/health`, CI running tests and the coverage threshold, binding to `PORT` on `0.0.0.0`.

**Future work (not implemented):**

- Persistent, concurrency-safe storage (e.g. PostgreSQL); the in-memory store loses data on restart and can't be shared between instances.
- Authentication and authorization.
- Strict request schemas (reject unknown fields, length limits, strict ISO 8601 `dueDate`; currently `Date.parse` is used).
- Structured logging and monitoring/alerting.
- Rate limiting and body-size limits.
- OpenAPI documentation.
- Pagination metadata (total count) in list responses.

## Deployment

The API needs no database or build step. It listens on `process.env.PORT || 3000` on `0.0.0.0` and exposes `GET /health`. **It has not been deployed yet**; no live URL exists.

To deploy on [Render](https://render.com) (free tier):

1. Sign in to Render with GitHub → **New → Blueprint** → select this repository (it reads [render.yaml](./render.yaml)), **or** create a **Web Service** manually with:

   | Setting | Value |
   |---------|-------|
   | Root directory | `task-api` |
   | Build command | `npm ci` |
   | Start command | `npm start` |
   | Health check path | `/health` |

2. Once live, verify: `curl https://<your-service>.onrender.com/health` → `{"status":"ok"}`.
3. Put the URL in the [Submission Links](#submission-links) section above.

Storage is in memory, so run a single instance; data is lost on restart or redeploy (free-tier services also sleep when idle, so the first request may be slow).
