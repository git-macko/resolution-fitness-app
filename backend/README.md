# Resolution Fitness App — Backend

**v1.0 — First Deployable Release** 🚀

A Go REST API that powers the Resolution Fitness App (`../mobile`).
Users, workout plans, sessions, nutrition, food scanning, body stats, weight/body/sleep tracking,
AI coach chat, progression badges, build inspiration, exercise image generation,
personalized daily goals, profile, settings, JWT auth — all behind a single `net/http` server
running on `:8080` by default (71 routes, 57 tests).

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
# Edit GEMINI_API_KEY (used for AI Coach + Food Scanner + Exercise Images)

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
| `DB_PATH` | SQLite file location | `./database.db` (falls back to `database.db` next to the executable when that file exists, so launching the binary from any directory opens the real backend DB) |
| `GEMINI_API_KEY` | Power AI Coach chat + food photo analysis + exercise images via Google Gemini | optional; AI endpoints fall back to simulated responses if absent |
| `GEMINI_MODEL` | Gemini model used for chat + food scan | `gemini-3.5-flash` |
| `BESTTIME_API_KEY` | Real gym crowd/busyness forecasts | optional; falls back to simulation |
| `BESTTIME_API_URL` | BestTime API base URL | `https://besttime.app/api/v1` |
| `GOOGLE_PLACES_API_KEY` | Gym autocomplete + opening hours (Places New) | optional; falls back to Nominatim/Overpass |
| `OVERPASS_API_URL` | Overpass endpoint for OSM opening hours | `https://overpass-api.de/api/interpreter` |

---

## Endpoints (71 routes)

Public:

- `GET  /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET  /api/exercises` / `GET /api/exercises/{id}`
- `POST /api/exercises/{id}/generate-image` — generate AI illustration for one exercise
- `POST /api/exercises/generate-images` — batch-generate AI images (`?muscle_group=`)
- `GET  /api/exercises/generate-images/status` — poll batch job (`?id=`)
- `GET  /api/workout-templates`

Protected (require `Authorization: Bearer <jwt>`):

- `POST /api/auth/refresh` — issue a fresh JWT using the current (still-valid) one
- `/api/profile/**` — read, update, picture upload, settings, onboarding, delete
- `POST /api/profile/goals` — recompute daily calorie/protein/water targets from height/weight + goal
- `/api/plans/**` — list, create, get, update, delete, clone, activate weekly plans
- `/api/workouts/**` — start, get, update, complete, cancel, history
- `/api/nutrition/**` — daily, meals, water, weekly, suggestions
- `/api/food-scan/**` — scan, log, history
- `/api/weight`, `/api/measurements`, `/api/sleep`
- `/api/dashboard` — composite greeting + quote + health fact + fitness summary + inspiration + suggestions
- `/api/inspiration/**` — list, upload, delete, reorder build inspiration photos
- `/api/badges` — progression badges (computed live from activity stats)
- `/api/chat/**` — AI Coach chat (+ SSE stream), plan generation, history, suggestions, clear, delete
- `/api/profile/gym`, `/api/profile/gym/refresh-hours` — gym preference + manual hours refresh
- `/api/gym-crowd`, `/api/gym-crowd/report` — crowd estimate + user reports
- `/api/gyms/search`, `/api/gyms/details` — gym autocomplete + details/opening hours
- `/uploads/**` — static file serving for uploaded profile pics / food photos / exercise images

For the full payload/response contract of each route, see `../PROMPT.md` in the
project root or look at the inline doc-comments above each handler in
`handlers/*.go`.

---

## Running the test suite

```bash
go test ./... -v -count=1
```

Expected output: **55/55 PASS** in the `handlers` package (workout-plan handlers,
edge cases, clone / activate semantics, auto-delete, AI Coach chat, gym crowd,
progression badges, food scan, exercise image generation, meal suggestion ranking,
inspiration photo CRUD) plus **1/1 PASS** in the `database` package
(migration idempotency) and **1/1 PASS** in the `config` package (DB path resolution). `go vet ./...` is also clean.

**Total: 57 tests.**

Tests live in:
- `handlers/workouts_test.go` — plan limits, clone, activate, full integration, food scan
- `handlers/chat_test.go` — AI Coach context building
- `handlers/gym_test.go` — gym preference self-healing
- `handlers/badges_test.go` — no activity, fitness activity, health-only activity
- `handlers/goals_test.go` — goal formulas, onboarding seeding, recalculate endpoint
- `handlers/inspiration_test.go` — photo upload limits, delete ownership, empty listing
- `handlers/nutrition_test.go` — meal goal relevance scoring, goal-ranked suggestions
- `handlers/exercise_image_test.go` — single/batch/status, edge cases, mime mapping
- `database/migrations_test.go` — migration idempotency
- `config/config_test.go` — DB path resolution

All handler tests use an in-memory SQLite database (`database.Initialize(":memory:")`),
which is a fast smoke check that the no-cgo driver is working in your environment.

---

## Project layout

```
backend/
├── main.go                    Server entrypoint — wires config, db, middleware, handlers (71 routes)
├── go.mod / go.sum            Module definition (Go 1.25+)
├── Makefile                   Common tasks (run, build, test, fmt, clean, deps)
├── .env / .env.example        Runtime config (don't commit `.env`)
├── database/
│   ├── database.go            SQLite open + schema migrations; DRIVER ALIAS init() lives here
│   └── migrations_test.go     Migration idempotency test
├── config/
│   ├── config.go              Env loading + defaults + DB path resolution
│   └── config_test.go         DB path resolution test
├── handlers/                  HTTP handlers, grouped by domain (20 files)
│   ├── auth.go                register / login / refresh
│   ├── profile.go             user profile CRUD, settings, gym preference
│   ├── workouts.go            plan + session handlers
│   ├── nutrition.go           daily nutrition, meals, water, weekly, goal-ranked suggestions
│   ├── food_scan.go           food photo scan + Gemini Vision
│   ├── exercise_image.go      AI exercise illustrations via Gemini 2.5 Flash Image
│   ├── goals.go               personalized calorie/protein/water goals
│   ├── badges.go              progression badge computation (live from stats)
│   ├── inspiration.go         build inspiration photo CRUD (max 3)
│   ├── gemini.go              Gemini API client (chat, streaming, food scan)
│   ├── gym.go                 gym search/details, crowd estimates, opening hours
│   ├── tracking.go            weight, body measurements, sleep
│   ├── dashboard.go           aggregated dashboard data (quotes, facts, summaries, inspiration, suggestions)
│   ├── chat.go                AI Coach chat relay
│   ├── *_test.go              57 tests (in-memory DB)
├── middleware/                CORS, request logger, AuthRequired
├── models/                    Wire-format structs + DB row structs (7 files)
│   ├── badges.go              Badge model
│   ├── common.go              API response wrappers
│   ├── content.go             Dashboard, inspiration, chat models
│   ├── nutrition.go           Nutrition + food scan models
│   ├── tracking.go            Weight, measurements, sleep models
│   ├── user.go                User, settings, goals models
│   └── workout.go             Plan, session, exercise models
├── utils/                     Validation, response helpers, date helpers, file uploads
└── uploads/                   Static file serving (profile pics, food photos, exercise images)
```

---

## Database

SQLite is used in **WAL mode** with **foreign keys on** and a **5 s busy timeout**:

```go
sql.Open("sqlite3", dbPath+"?_journal_mode=WAL&_foreign_keys=on&_busy_timeout=5000")
```

On startup the `database` package runs all `CREATE TABLE IF NOT EXISTS` migrations in
`runMigrations()`. Migrations are idempotent — safe to run on every boot. Column
additions go through `ensureColumn()`, which checks `PRAGMA table_info` first and
only runs `ALTER TABLE … ADD COLUMN …` when the column is actually missing, so
existing databases start with zero duplicate-column errors and no log spam.

Tables: `users`, `user_settings`, `build_inspiration`, `user_stats`, `user_goals`, `exercises`,
`weekly_plans`, `plan_days`, `plan_exercises`, `workout_sessions`,
`session_exercises`, `session_sets`, `food_logs`, `food_items`,
`scanned_foods`, `water_logs`, `weight_logs`, `body_measurements`,
`sleep_logs`, `daily_quotes`, `health_facts`, `chat_messages`,
`besttime_cache`, `gym_crowd_reports`.

Seed data: 30 exercises, 21 daily quotes, 20 health facts (idempotent: only
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
   `handlers/workouts_test.go`, `handlers/chat_test.go`,
   `handlers/gym_test.go`, `handlers/badges_test.go`,
   `handlers/goals_test.go`, `handlers/inspiration_test.go`,
   `handlers/nutrition_test.go`, `handlers/exercise_image_test.go`,
   `database/migrations_test.go`, and `config/config_test.go`.
   New tests should stay inside their owning package
   (e.g. `handlers/foo_test.go` next to `handlers/foo.go`), not in a top-level
   `tests/` directory.

If a tool needs an `import` that you suspect pulls in cgo, audit the dependency
tree with:

```bash
go list -deps ./... | xargs -I{} sh -c 'go list -f "{{.ImportPath}} {{.CgoFiles}}" {} 2>/dev/null | grep -v "[]" || true'
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
Gemini calls go through the shared client in `handlers/gemini.go`, used by
`handlers/chat.go` (AI Coach), `handlers/food_scan.go` (food scanner),
and `handlers/exercise_image.go` (exercise illustrations).
