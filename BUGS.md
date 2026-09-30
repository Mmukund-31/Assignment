# Bug Report — Task Manager API

I found these by writing tests against the documented API contract (README endpoint table + `ASSIGNMENT.md`) and running them against the **unmodified** starter code. Against the original code, **57 of 126 tests failed**, and every failure traced back to one of the confirmed defects below or to the not-yet-implemented `/assign` endpoint. A later audit pass found defect #9 (and tightened #8); its new tests fail on the previous code as well. Each defect was also reproduced manually with `curl`.

The report separates **confirmed defects** (behavior that contradicts the contract or the code's own intent; all fixed) from **behavior requiring product clarification** (ambiguous contract; deliberately left unchanged).

## Confirmed defects

| # | Defect | Severity | Status |
|---|--------|----------|--------|
| 1 | Pagination skips the first page | High | Fixed |
| 2 | Status filter matches substrings | Medium | Fixed |
| 3 | Completing a task resets its priority | Medium | Fixed |
| 4 | `PUT` can overwrite `id` and `createdAt` | High | Fixed |
| 5 | Malformed JSON returns 500 instead of 400 | Low | Fixed |
| 6 | Empty/falsy `status` and `priority` bypass validation | Medium | Fixed |
| 7 | `?status=` silently disables pagination | Medium | Fixed |
| 8 | Invalid `page`/`limit` values are mishandled | Low | Fixed |
| 9 | Non-object request bodies crash or bypass validation | Medium | Fixed |
| 10 | README documents the wrong status values | Low (docs) | Fixed in README |

## Behavior requiring product clarification (not fixed)

| Q | Question |
|---|----------|
| A | Should `PATCH /complete` on an already-done task keep the original `completedAt`, or refresh it? |
| B | Should `PUT` changing `status` to/from `done` set/clear `completedAt`? |
| C | Is `PUT` a full replace or a partial merge? |

Test names below are the `it(...)` descriptions. Run `npx jest -t "<name>"` to run one.

---

## 1. Pagination skips the first page

### Location
`task-api/src/services/taskService.js` → `getPaginated()`

### Expected behavior
Pages are 1-indexed: the route defaults `page` to `1`, and the README example is `?page=1&limit=10`. `GET /tasks?page=1&limit=2` should return tasks 1–2, and `page=2` should return tasks 3–4.

### Actual behavior
`page=1&limit=2` returned tasks 3–4. Page 1 of the data could never be reached, and the last page came back empty one page early.

### Reproduction
```bash
# create 3 tasks, then:
curl "http://localhost:3000/tasks?page=1&limit=2"   # → [T3] instead of [T1, T2]
```

### Root cause
`const offset = page * limit;` treats `page` as 0-indexed, but the API is 1-indexed.

### Test demonstrating the bug
- `tests/taskService.test.js` → `getPaginated` › *returns the first `limit` tasks for page 1*, *returns the next `limit` tasks for page 2*
- `tests/tasks.integration.test.js` → *returns the first two tasks for page=1&limit=2*

### Fix
`const offset = (page - 1) * limit;`

### Regression protection
The page-1, page-2, partial-last-page and beyond-the-end tests in both files.

---

## 2. Status filter matches substrings

### Location
`task-api/src/services/taskService.js` → `getByStatus()`

### Expected behavior
`?status=` filters on one of the enum values (`todo`, `in_progress`, `done`) and should match exactly. An unknown or partial value should return `[]`.

### Actual behavior
`?status=do` returned every `todo` **and** `done` task. `?status=in` returned `in_progress` tasks. `?status=o` returned every task.

### Reproduction
```bash
curl "http://localhost:3000/tasks?status=do"   # → todo + done tasks
```

### Root cause
`t.status.includes(status)` is `String.prototype.includes`, a substring check, not an equality check.

### Test demonstrating the bug
- `tests/taskService.test.js` → `getByStatus` › *uses exact matching, not substring matching*
- `tests/tasks.integration.test.js` → *does not match partial status strings*

### Fix
`tasks.filter((t) => t.status === status)`

### Regression protection
The two tests above.

---

## 3. Completing a task resets its priority

### Location
`task-api/src/services/taskService.js` → `completeTask()`

### Expected behavior
`PATCH /tasks/:id/complete` should mark the task done (`status: "done"`, `completedAt` set) and leave every other field alone. Nothing in the README or the assignment says completion changes priority.

### Actual behavior
Every completed task came back with `priority: "medium"`, whatever it was before. A `high` task silently became `medium`.

### Reproduction
```bash
curl -X POST localhost:3000/tasks -H "Content-Type: application/json" -d '{"title":"x","priority":"high"}'
curl -X PATCH localhost:3000/tasks/<id>/complete    # → "priority": "medium"
```

### Root cause
The object literal in `completeTask` hard-codes `priority: 'medium'`. It looks like a copy/paste leftover from `create()`'s defaults.

### Test demonstrating the bug
- `tests/taskService.test.js` → `completeTask` › *preserves priority and every other unrelated field*
- `tests/tasks.integration.test.js` → *preserves the priority of the task*

### Fix
Removed the `priority: 'medium'` line. The update now changes only `status` and `completedAt`.

### Regression protection
The unit test compares every field except `status`/`completedAt` with the original task. It will also catch any *other* field that gets clobbered in future.

---

## 4. `PUT /tasks/:id` can overwrite `id` and `createdAt`

### Location
`task-api/src/services/taskService.js` → `update()`

### Expected behavior
`id` and `createdAt` are server-generated and should not change. A client must not be able to rename a task's ID or rewrite its creation time.

### Actual behavior
`PUT /tasks/<id>` with `{"id":"hijacked"}` returned 200 and changed the task's id. After that, `/tasks/<original-id>` returned 404, so the task was orphaned under a client-chosen id. That id could even collide with another task's.

### Reproduction
```bash
curl -X PUT localhost:3000/tasks/<id> -H "Content-Type: application/json" -d '{"id":"hijacked"}'
curl -X PUT localhost:3000/tasks/<id> -H "Content-Type: application/json" -d '{}'   # → 404
```

### Root cause
`{ ...tasks[index], ...fields }` spreads the raw request body over the stored task (mass assignment). `validateUpdateTask` only checks known fields and never rejects unknown ones.

### Test demonstrating the bug
- `tests/taskService.test.js` → `update` › *ignores attempts to change id or createdAt*
- `tests/tasks.integration.test.js` → *does not allow the id to be changed*

### Fix
`update()` now removes `id` and `createdAt` from the incoming fields before merging. I chose to ignore them rather than return 400 because the rest of the API is lenient about extra fields, and clients often send a whole object back in a PUT.

### Regression protection
The two tests above.

---

## 5. Malformed JSON returns 500 instead of 400

### Location
`task-api/src/app.js` → global error handler

### Expected behavior
A body that isn't valid JSON is a client error and should get **400** with the API's standard `{ "error": "..." }` shape.

### Actual behavior
**500** `{"error":"Internal server error"}`, and a stack trace was logged for every such request. That's misleading for clients, and it's noise in monitoring and alerting.

### Reproduction
```bash
curl -X POST localhost:3000/tasks -H "Content-Type: application/json" -d '{bad'   # → 500
```

### Root cause
`express.json()` throws a `SyntaxError` with `status: 400`. The error handler ignored `err.status` and always answered 500.

### Test demonstrating the bug
`tests/app.test.js` → *returns 400 with the standard error shape for malformed JSON*

### Fix
Errors with a 4xx `status` are now returned with that status and a generic `"Invalid request body"` message. Parser internals are not echoed back. Everything else still gets a logged 500 (covered by *returns 500 without leaking details when a handler throws*).

### Regression protection
Both tests in `tests/app.test.js` › `error handler`.

---

## 6. Empty/falsy `status` and `priority` bypass validation

### Location
`task-api/src/utils/validators.js` → `validateCreateTask()`, `validateUpdateTask()`

### Expected behavior
If a client sends `status` or `priority`, it must be one of the allowed values.

### Actual behavior
`POST /tasks {"title":"x","status":""}` returned **201**, and the task was stored with `status: ""`. It then doesn't appear in any `?status=` filter or in `/stats` counts. `priority: ""`, `priority: 0` and `status: null` behaved the same way.

### Reproduction
```bash
curl -X POST localhost:3000/tasks -H "Content-Type: application/json" -d '{"title":"x","status":""}'   # → 201, "status": ""
```

### Root cause
The guards were `if (body.status && !VALID_STATUSES.includes(...))`. A falsy value short-circuits the check. `create()`'s default parameters only apply to `undefined`, so `""` is stored as-is.

### Test demonstrating the bug
- `tests/validators.test.js` → *rejects status set to ""* (and the `null` / `priority` variants)
- `tests/tasks.integration.test.js` → *returns 400 for empty status*

### Fix
The checks now use `!== undefined`: an omitted field is still optional, but a present field must be valid. The shared status/priority/dueDate checks moved into one helper, so create and update can't drift apart again.

### Regression protection
The parameterised tests in `tests/validators.test.js`.

---

## 7. `?status=` silently disables pagination

### Location
`task-api/src/routes/tasks.js` → `GET /`

### Expected behavior
The README says `GET /tasks` "supports `?status=`, `?page=`, `?limit=`", and its own sample request combines them (`?status=pending&page=1&limit=10`). A filtered, paginated request should return one page of the filtered results.

### Actual behavior
When `status` was present, the route returned early with *all* matching tasks and ignored `page`/`limit`.

### Reproduction
```bash
# 3 todo tasks
curl "localhost:3000/tasks?status=todo&page=1&limit=1"   # → 3 tasks, not 1
```

### Root cause
The `if (status)` branch ran first and returned before the pagination branch.

### Test demonstrating the bug
- `tests/tasks.integration.test.js` → *combines status filtering with pagination*
- `tests/taskService.test.js` → *paginates within a status filter when one is given*

### Fix
`getPaginated(page, limit, status)` takes an optional status and filters (with `getByStatus`) before slicing. The route checks for pagination first and passes `status` through.

### Regression protection
The two tests above.

---

## 8. Invalid `page` / `limit` values are mishandled

### Location
`task-api/src/routes/tasks.js` → `GET /` query parsing

### Expected behavior
The original code shows the intent: `parseInt(page) || 1` and `parseInt(limit) || 10`, i.e. invalid input falls back to the defaults. Only positive integers are valid page numbers and page sizes.

### Actual behavior
`|| 1` only catches `0`/`NaN`. Negative numbers passed through, and `Array.prototype.slice` treats a negative offset as "count from the end", so (after fix #1) `?page=-1&limit=2` returned tasks from the *end* of the list and `limit=-2` returned `[]`. Additionally, `parseInt` accepts trailing garbage: `page=2abc` silently became `2` and `page=2.5` became `2`.

### Reproduction
```bash
curl "localhost:3000/tasks?page=-1&limit=2"     # tasks from the end of the list
curl "localhost:3000/tasks?page=2abc&limit=2"   # treated as page=2
```

### Root cause
Truthiness was used where the code needed a range check, and `parseInt` was used where it needed strict validation.

### Test demonstrating the bug
`tests/tasks.integration.test.js` → *falls back to defaults for invalid values (...)*: `page=-1`, `0`, `abc`, `undefined`, `2abc`, `2.5`, empty, and `limit=-2`, `-1`, `0`, `10abc`, `1.5`.

### Fix
`parsePositiveInt(value, fallback)` uses `Number(value)` and accepts only positive integers; everything else uses the default. This keeps the original lenient fallback design instead of switching to 400 responses.

### Regression protection
The parameterised test above, plus the page 1 / page 2 tests from #1.

---

## 9. Non-object request bodies crash or bypass validation

### Location
`task-api/src/utils/validators.js` → `validateCreateTask()`, `validateUpdateTask()`, `validateAssignTask()`

### Expected behavior
A body that is not a JSON object (`null`, `[]`, `"hello"`, `123`) gets a controlled `400` with the standard `{ "error": "..." }` shape.

### Actual behavior
The validators read properties straight off `body`, so a `null` body would throw `TypeError: Cannot read properties of null` (surfacing as a 500). An array body was worse: `PUT /tasks/:id` with `[]` passed validation and returned **200**, because the empty array has no offending fields.

### Reproduction
```bash
curl -X PUT localhost:3000/tasks/<id> -H "Content-Type: application/json" -d '[]'   # → 200 before the fix
```
(`null`, `"hello"` and `123` bodies are already rejected by `express.json()` in its default strict mode, which returns 400 through the error handler from #5. The validators are the second line of defence and must not depend on that.)

### Root cause
The validators assumed `req.body` is always an object.

### Test demonstrating the bug
- `tests/validators.test.js` → *returns an error for … instead of throwing* (all three validators; `null`, `undefined`, array, string, number)
- `tests/tasks.integration.test.js` → *returns 400 without crashing for body …* on `POST /tasks`, `PUT /tasks/:id` and `PATCH /tasks/:id/assign` (`null`, `[]`, `"hello"`, `123`)

### Fix
A small `isPlainObject` helper; every validator first returns `request body must be a JSON object` if the check fails.

### Regression protection
The tests above; they also assert the task store is unchanged after the rejected request.

---

## 10. README documents the wrong status values (docs)

The starter README's task shape said `"status": "pending | in-progress | completed"`, and its sample used `?status=pending`. The code only accepts `todo | in_progress | done`, so following the docs produced a 400 on create or an empty list on filter. The README was rewritten to match the code.

---

# Behavior requiring product clarification

These are not classified as defects: the brief doesn't define the intended behavior, so I did not guess. Each is a question to settle before production.

## A. Re-completing a task: preserve or refresh `completedAt`?

`PATCH /tasks/:id/complete` on an already-done task returns 200 and replaces the original `completedAt`. Reasonable answers: keep the first timestamp (`completedAt: task.completedAt ?? new Date().toISOString()`), refresh it, or return 409. Current behavior is left as is; the test only asserts the task stays `done`.

## B. Should `PUT` changing `status` to/from `done` update `completedAt`?

`PUT {"status":"done"}` leaves `completedAt: null`, and reopening a completed task via `PUT` keeps the old `completedAt`. Either `PUT` should derive `completedAt` from the status transition, or status changes to/from `done` should only go through `/complete`. Left unchanged pending a decision.

## C. Is `PUT` a full replace or a partial merge?

The README calls it a "Full update", but the implementation merges the provided fields (PATCH-like semantics). I kept the existing behavior and documented it, since changing it could break clients relying on partial updates.

---

## Production-hardening notes (not defects)

- **`PUT` accepts unknown fields** and stores them on the task. `id` and `createdAt` are protected (#4), but a strict allow-list schema would be better for production.
- **`dueDate` validation uses `Date.parse`**, so it accepts non-ISO strings such as `"March 5"` (the error message says ISO 8601) and treats `""` as "no date". Low impact; a strict ISO check is a possible improvement.
- **No `GET /tasks/:id` route**, even though the service has `findById()`. The brief's endpoint list doesn't include one, so none was added.
