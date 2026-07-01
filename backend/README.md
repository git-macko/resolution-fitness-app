# Resolution Fitness App — Backend

A Go REST API that powers the Resolution Fitness App (`../mobile`).
Users, workout plans, sessions, nutrition, food scanning, weight/body/sleep tracking,
AI coach chat, profile, settings, JWT auth — all behind a single `net/http` server
running on `:8080` by default.

---

## Requirements

| Tool | Version | Why |
|---|---|---|
| **Go** | **1.25 or newer** | `go.mod` declares `go 1.25.0`. `modernc.org/sqlite` requires it. |
| `git`, `make` | any | clone + Makefile shortcuts (Make is optional). |
| A C compiler | **none** | This backend is **pure-Go**. No GCC, no `CC`/`CXX`, no `MinGW`, no WinLibs. |

> If you are on Windows and you see `cc1.exe: sorry, unimplemented: 64-bit mode not compiled in`,
> something has been re-introduced as a cgo dependency. See [Troubleshooting](#troubleshooting) below.

---

## Why pure-Go? (no cgo)

The backend uses **[`modernc.org/sqlite`](https://pkg.go.dev/modernc.org/sqlite)** as its
SQLite driver instead of the more common cgo-based
`github.com/mattn/go-sqlite3`.

`mattn/go-sqlite3` is implemented in C — it requires a working 64-bit C compiler at
build time. On Windows machines that ship only the 32-bit `MinGW`, builds fail with:

```
# runtime/cgo
cc1.exe: sorry, unimplemented: 64-bit mode not compiled in
```

The fix we chose: **drop cgo entirely**. `modernc.org/sqlite` is a transpilation of
the same SQLite C source into Go. The resulting driver is **100 % pure Go**, so:

- No C compiler is required to build, test, or run the server.
- The compiled binary runs anywhere Go runs (no GPL/LGPL cgo licensing concerns).
- CI / Docker images are simpler — pure-Go static binaries are easier to ship.
- The same backend builds, tests, and runs on Windows, macOS, Linux, in WSL, and
  in CI containers without any per-OS setup.

The migration from cgo `mattn/go-sqlite3` to pure-Go `modernc.org/sqlite` removed:

- the cgo dance (`CC=...`, `CXX=...`, WinLibs installs)
- the `cc1.exe: sorry, unimplemented` failure mode
- ~1 GB of MinGW/WinLibs toolchain footprint from contributor machines

…and reduced first-time server startup from ~6 s to ~1 s on this Windows host.

### The driver-name alias — read this before adding any new driver

`modernc.org/sqlite` registers itself in `database/sql` under the name **`"sqlite"`**.
This codebase has 15+ `sql.Open("sqlite3", ...)` call sites in `handlers/*.go` and tests.
Rather than rewrite all of them, `database/database.go` runs:

```go
// Register the pure-Go SQLite driver under the legacy "sqlite3" driver name.
func init() {
    sql.Register("sqlite3", &sqlite.Driver{})
}
```

This makes `sql.Open("sqlite3", ":memory:")` (and any other path) Just Work,
_without_ callers needing to know that modernc is the underlying engine.

**Future contributors:** keep using `"sqlite3"` everywhere. If you change it to
`"sqlite"`, you'll break 15+ call sites and the test suite. Don't.

---

## Setup

```bash
# 1. Copy and edit environment
cp .env.example .env
# Edit JWT_SECRET (must be a strong random string in production)
# Edit OPENAI_API_KEY (used for AI Coach + Food Scanner)

# 2. Resolve modules
go mod tidy

# 3. Run
go run .
#    🚀 Resolution Fitness API starting on http://localhost:8080

# Or use the Makefile (equivalent)
make run          # -> go run .
make build        # -> go build -o resolution-server .
make test         # -> go test ./... -v          (see note below)
make test-cover   # -> go test ./... -cover
make deps         # -> go mod tidy
make fmt          # -> gofmt -w .
make clean        # -> rm -f resolution-server
```



---

## Environment variables

Loaded from `.env` (or process env, `.env` overrides take precedence). See
`.env.example` for the canonical list.

| Var | Purpose | Default |
|---|---|---|
| `PORT` | HTTP listen port | `8080` |
| `JWT_SECRET` | HMAC secret for signing auth tokens. **Must be a strong random string in production.** | falls back to a development placeholder (`change-me-in-production-use-a-strong-random-secret`) when unset — **do not ship to production without overriding this**. |
| `DB_PATH` | SQLite file location | `./database.db` |
| `OPENAI_API_KEY` | Power AI Coach chat + food photo scanner | optional; AI endpoints degrade gracefully if absent |

---

## Endpoints

Public:

- `GET  /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET  /api/exercises` / `GET /api/exercises/{id}`
- `GET  /api/workout-templates`

Protected (require `Authorization: Bearer <jwt>`):

- `POST /api/auth/refresh` — issue a fresh JWT using the current (still-valid) one
- `/api/profile/**` — read, update, picture upload, settings, onboarding, delete
- `/api/plans/**` — list, create, get, update, delete, clone, activate weekly plans
- `/api/workouts/**` — start, get, update, complete, cancel, history
- `/api/nutrition/**` — daily, meals, water, weekly, suggestions
- `/api/food-scan/**` — scan, log, history
- `/api/weight`, `/api/measurements`, `/api/sleep`
- `/api/dashboard` — composite greeting + quote + health fact + fitness summary
- `/api/chat/**` — AI Coach chat, history, suggestions, clear
- `/uploads/**` — static file serving for uploaded profile pics / food photos

For the full payload/response contract of each route, see `../PROMPT.md` in the
project root or look at the inline doc-comments above each handler in
`handlers/*.go`.

---

## Running the test suite

```bash
go test ./... -v -count=1
```

Expected output: **16/16 PASS** in the `handlers` package (workout-plan handlers,
edge cases, clone / activate semantics, auto-delete). All other packages report
`[no test files]`. `go vet ./...` is also clean.

Tests are in `handlers/workouts_test.go` and use an in-memory SQLite database
(`database.Initialize(":memory:")`), which is a fast smoke check that the
no-cgo driver is working in your environment.

---

## Project layout

```
backend/
├── main.go                    Server entrypoint — wires config, db, middleware, handlers
├── go.mod / go.sum            Module definition (Go 1.25+)
├── Makefile                   Common tasks (run, build, test, fmt, clean, deps)
├── .env / .env.example        Runtime config (don't commit `.env`)
├── database/
│   └── database.go            SQLite open + schema migrations; DRIVER ALIAS init() lives here
├── config/                    Env loading + defaults
├── handlers/                  HTTP handlers, grouped by domain (one file each)
│   ├── auth.go                register / login / refresh
│   ├── profile.go             user profile CRUD
│   ├── workouts.go            plan + session handlers
│   ├── workouts_test.go       unit tests (16 cases, in-memory DB)
│   ├── nutrition.go, food_scan.go, dashboard.go, chat.go, ...
├── middleware/                CORS, request logger, AuthRequired
├── models/                    Wire-format structs + DB row structs
└── utils/                     Validation, response helpers, date helpers, file uploads
```

---

## Database

SQLite is used in **WAL mode** with **foreign keys on** and a **5 s busy timeout**:

```go
sql.Open("sqlite3", dbPath+"?_journal_mode=WAL&_foreign_keys=on&_busy_timeout=5000")
```

On startup the `database` package runs all `CREATE TABLE IF NOT EXISTS` migrations in
`runMigrations()`. Migrations are idempotent — safe to run on every boot. New
migrations append additional `ALTER TABLE … ADD COLUMN …` statements that swallow
"errors that mean the column already exists" (SQLite returns an error if the
column exists; the code intentionally ignores those errors to keep the migration
additive and replayable).

Tables: `users`, `user_settings`, `user_stats`, `user_goals`, `exercises`,
`weekly_plans`, `plan_days`, `plan_exercises`, `workout_sessions`,
`session_exercises`, `session_sets`, `food_logs`, `food_items`,
`scanned_foods`, `water_logs`, `weight_logs`, `body_measurements`,
`sleep_logs`, `daily_quotes`, `health_facts`, `chat_messages`.

Seed data: 26 exercises, 21 daily quotes, 20 health facts (idempotent: only
seeded when the relevant table is empty).

---

## Rules for future contributors

These are the loaded gun. If you break any of them, the next person to clone
this repo on a fresh machine will hit `cc1.exe: sorry, unimplemented`
or `cannot find C compiler` errors, and the entire point of the migration
will be undone.

1. **Do not add a cgo dependency.** In particular:
   - Do **not** import `github.com/mattn/go-sqlite3` (or any older SQLite-for-Go
     package that wraps it, e.g. `gorm.io/driver/sqlite`'s default backend).
   - Do **not** import `github.com/mattn/go-sqlite3` indirectly via GORM, sqlx
     drivers, or any ORM that bundles it. Use the ORM's pure-Go adapter if it
     has one (e.g. `gorm.io/driver/sqlite` with `modernc.org/sqlite`).
   - Do **not** add `// #cgo …` directives anywhere in this repo.
   - Do **not** set `CGO_ENABLED=1` in CI / Dockerfiles / build scripts.

2. **Do not change the SQLite driver name.** Always call
   `sql.Open("sqlite3", …)`. The `"sqlite"` name is registered as a side-effect
   of `modernc.org/sqlite` but is *not* the convention in this codebase. The
   alias `"sqlite3" → modernc.org/sqlite` lives in `database/database.go`'s
   `init()`; do not delete it.

3. **Do not bump `go.mod`'s `go` directive below `go 1.25`.**
   `modernc.org/sqlite`'s minimum Go version is `1.25`.

4. **Keep the `init()` alias as the *only* registration of `"sqlite3"`.** If
   you add a new Go file that registers a different driver under the same
   name, `database/sql` will panic ("sql: Register called twice for driver
   sqlite3"). The single registration in `database/database.go` is canonical.

5. **Tests stay in `go test ./...`.** Tests currently live in
   `handlers/workouts_test.go`. New tests should stay inside their owning
   package (e.g. `handlers/foo_test.go` next to `handlers/foo.go`), not in a
   top-level `tests/` directory.

If a tool needs an `import` that you suspect pulls in cgo, audit the dependency
tree with:

```bash
go list -deps ./... | xargs -I{} sh -c 'go list -f "{{.ImportPath}} {{.CgoFiles}}" {} 2>/dev/null | grep -v "\[\]" || true'
```

Empty `CgoFiles` means pure Go. Any non-empty entry in a transitive dep of the
backend is a regression of the no-cgo invariant.

---

## Troubleshooting

### `cc1.exe: sorry, unimplemented: 64-bit mode not compiled in`

This means **something has reintroduced cgo**. Check:

```bash
go list -f '{{.ImportPath}} {{.CgoFiles}}' ./...
```

Any non-empty `CgoFiles` is the offender. Remove it, replace with a pure-Go
equivalent, and rerun the tests. Do not try to install WinLibs / MinGW /
MSYS2 to "fix" this — the whole point of this backend is to avoid that dance.

### Tests hang at startup on Windows

On very old Windows Defender configurations the very first run of
`modernc.org/sqlite` may trigger a Defender smart-screen check that takes
30–60 s. This is one-off per machine, not per run. Subsequent tests are fast.

### `database is locked`

You ran two server instances against the same `DB_PATH`. Kill the other one or
use a different path for development.

### `JWT_SECRET not set`

Set `JWT_SECRET` in `.env` to a **strong random string (≥ 32 chars)** before
deploying. Note: `config/config.go` *does* fall back to a development
placeholder (`change-me-in-production-use-a-strong-random-secret`) when the
env var is missing, so the server will start — but tokens will be signed with
a publicly-known key. **This is a security risk in production.** Override
before exposing the server.

---

## License & data

(Add your real license + data-handling notes here. The repo currently has no
top-level LICENSE file.)

User-uploaded media is served from `/uploads/**` (configured in `main.go`).
OpenAI calls out of `handlers/chat.go` and `handlers/food_scan.go`; user-entered
OpenAI keys are encrypted at rest in `user_settings.openai_api_key_enc`.
