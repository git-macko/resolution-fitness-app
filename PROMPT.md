# Resolution Fitness — Project Overview

**v1.0 — First Deployable Release** 🚀

A full-stack gym fitness mobile app with a **Go backend** (REST API + SQLite) and a
**React Native / Expo frontend** (4-tab mobile app).

## Tech Stack

### Backend (Go)
- **Language:** Go 1.25+
- **Router:** `net/http` with Go 1.22+ pattern matching (`"POST /api/plans/{planId}"`)
- **Database:** SQLite via `modernc.org/sqlite` (pure-Go driver, WAL mode, foreign keys ON)
- **Authentication:** JWT (`golang-jwt/jwt/v5`) with bcrypt password hashing
- **Migrations:** Inline `CREATE TABLE IF NOT EXISTS` + idempotent `ensureColumn()` additions on startup
- **CORS:** Custom middleware
- **Testing:** `testing` package with in-memory SQLite

### Mobile (React Native / Expo)
- **Framework:** React Native via Expo (SDK 54, managed workflow)
- **Navigation:** React Navigation v7 (bottom tabs + native stacks)
- **State:** React Context (AuthContext, ThemeContext)
- **HTTP Client:** `fetch` with JWT interceptor + SSE for streaming
- **Expo Libraries:** expo-camera, expo-image-picker, expo-haptics,
  expo-linear-gradient, expo-splash-screen, expo-asset, expo-status-bar
- **Testing:** Jest + jest-expo
- **Storage:** AsyncStorage

## Project Structure

```
Resolution-fitnessapp/
├── backend/                          # Go REST API server (65 endpoints)
│   ├── main.go                       # Entry point, route registration, seeding
│   ├── Makefile                      # run, build, test, clean
│   ├── config/config.go              # Environment config + DB path resolution
│   ├── config/config_test.go         # DB path resolution tests
│   ├── database/database.go          # SQLite connection + all table migrations
│   ├── database/migrations_test.go   # Migration idempotency tests
│   ├── models/                       # Go structs (7 files)
│   │   ├── badges.go                 # Badge model
│   │   ├── common.go                 # API response wrappers
│   │   ├── content.go                # Dashboard, inspiration, chat models
│   │   ├── nutrition.go              # Nutrition + food scan models
│   │   ├── tracking.go               # Weight, measurements, sleep models
│   │   ├── user.go                   # User, settings, goals models
│   │   └── workout.go                # Plan, session, exercise models
│   ├── handlers/                     # HTTP handlers for all API endpoints
│   │   ├── auth.go                   # Register, Login, Refresh
│   │   ├── profile.go                # Get/Update Profile, Upload Picture, Settings, Onboarding
│   │   ├── workouts.go               # Plans CRUD, SetActive, ClonePlan, Workout Sessions, Templates
│   │   ├── nutrition.go              # Daily Nutrition, Meals, Water, Weekly Summary, Suggestions
│   │   ├── food_scan.go              # Food Photo Scan + Google Gemini Vision API proxy
│   │   ├── exercise_image.go         # AI exercise illustrations via Gemini 2.5 Flash Image
│   │   ├── goals.go                  # Personalized calorie/protein/water goals
│   │   ├── badges.go                 # Progression badge computation
│   │   ├── inspiration.go            # Build Inspiration photo CRUD
│   │   ├── gemini.go                 # Gemini API client (chat, streaming, food scan)
│   │   ├── gym.go                    # Gym prefs, crowd estimates, opening hours
│   │   ├── tracking.go               # Weight, Body Measurements, Sleep
│   │   ├── dashboard.go              # Aggregated dashboard data
│   │   ├── chat.go                   # AI Coach chat relay
│   │   ├── *_test.go                 # 57 tests (in-memory SQLite)
│   ├── middleware/middleware.go       # JWT Auth, CORS, Request Logger
│   ├── utils/                        # response.go, validation.go, date_helpers.go
│   ├── uploads/                      # Static file serving (profile pics, food photos, exercise images)
│   └── database.db                   # SQLite database file (auto-created)
│
├── mobile/                           # React Native Expo app
│   ├── App.js                        # Root component (splash anim + theme + auth providers)
│   ├── app.json                      # Expo config
│   ├── index.js                      # Expo registerRootComponent
│   ├── jest.config.js                # Jest test config
│   ├── tsconfig.json                 # TypeScript config stub
│   ├── src/
│   │   ├── api/
│   │   │   ├── client.js             # HTTP client + token management (65 API methods)
│   │   │   └── config.js             # API base URL config
│   │   ├── components/               # 15 reusable UI components
│   │   │   ├── AutocompleteInput.js  # Debounced autocomplete text input
│   │   │   ├── BreathingVisual.js    # Breathing overlay for rest screens
│   │   │   ├── BuildInspirationCard.js # Photo carousel for dashboard
│   │   │   ├── Card.js               # Generic card container
│   │   │   ├── CarouselDots.js       # Pagination dots for carousels
│   │   │   ├── ExerciseLibrary.js    # Exercise browser with muscle group filters
│   │   │   ├── GymCrowdCard.js       # Gym crowd / opening-hours card
│   │   │   ├── HeroCard.js           # Dashboard hero card
│   │   │   ├── HeroStat.js           # Dashboard stat display
│   │   │   ├── Logo.js               # App logo component
│   │   │   ├── MimiMark.js           # Branded mark component
│   │   │   ├── NutritionSuggestionCard.js # Goal-ranked meal suggestion carousel
│   │   │   ├── PhotoLightbox.js      # Full-screen photo viewer
│   │   │   ├── SplashAnimation.js    # Animated splash screen overlay
│   │   │   └── TodaysSummary.js      # Dashboard daily summary
│   │   ├── contexts/
│   │   │   ├── AuthContext.js         # Global auth state
│   │   │   └── ThemeContext.js        # Light/dark theme state
│   │   ├── navigation/
│   │   │   └── AppNavigator.js        # Tab + stack navigation (4 tabs, 14 screens)
│   │   ├── screens/                   # All app screens (14 + tests)
│   │   │   ├── LoginScreen.js, RegisterScreen.js, OnboardingScreen.js
│   │   │   ├── DashboardScreen.js, FitnessScreen.js
│   │   │   ├── HealthScreen.js, FoodScanScreen.js, ScanHistoryScreen.js
│   │   │   ├── AccountScreen.js, SettingsScreen.js
│   │   │   ├── ChatScreen.js
│   │   │   ├── CreatePlanScreen.js, WorkoutExecutionScreen.js, ExerciseDetailScreen.js
│   │   │   └── __tests__/            # Screen-level tests (33 total)
│   │   ├── theme/                    # Theme system
│   │   │   ├── card.js               # Card style presets
│   │   │   ├── outlineText.js        # Outline text style helper
│   │   │   ├── spacing.js            # Spacing constants
│   │   │   ├── themes.js             # Light/dark theme definitions
│   │   │   ├── typography.js         # Typography presets
│   │   │   └── __tests__/            # Theme tests
│   │   └── utils/
│   │       ├── dates.js              # Date formatting helpers
│   │       ├── imageUrl.js           # Image URL resolution
│   │       ├── openingHours.js       # Opening-hours parsing/formatting helpers
│   │       ├── usePressScale.js      # Press animation hook
│   │       └── __tests__/            # Utility tests
│
└── PROMPT.md                         # This file
```

## Key Features Implemented

### Authentication & Profile
- Register, Login, JWT token refresh
- Profile CRUD with photo upload
- Onboarding flow (fitness level, goals, body stats: height & weight → personalized calorie / protein / water goal assessment, allergies, dietary preferences)
- **Progression Badges:** Rookie 🐣, Casual Goer 🏋️, Motivated Temporarily ⚡, Gym Rat 🐀 — earned from Fitness tab activity (workouts, streaks) and/or Health tab activity (meals logged, days tracked), with live progress bars on the Account tab
- Account deletion

### Fitness Tab — Routine Management
- **Routine constraints:** Max 2 consistent routines, max 3 one-time overrides
- **Auto-activation:** First routine automatically becomes the active one
- **Set Active flow:** Switch active routine with progression reset warning
- **Progression reset on active switch:** XP, level, workout count, streak reset;
  `longest_streak` preserved as a lifetime achievement
- **Auto-cleanup:** Overdue one-time plans automatically deleted
- **Clone:** Copy a plan to a new week (checked against one-time limits)
- **Delete with cascade:** Deletes linked workout sessions, plan days,
  and plan exercises in a transaction

### Workout Execution
- Start workout from plan day or ad-hoc
- Set tracking per exercise
- **Workout visuals:** demo image/GIF of the current exercise with emoji fallback
- **Rest screens:** full-screen breathing overlay with a motivational quote and skip control
- **Breathing patterns:** configurable via Settings (Box, 4-7-8, Deep, Calm)
- Complete workout → stats update, XP gain, streak calculation, level-up
- Cancel/save-as-draft
- Workout history with pagination

### Exercise Library
- 27 exercises across chest, back, legs, shoulders, arms, core, cardio
- Filter by muscle group, search by name
- **AI-generated exercise illustrations** — clean fitness art via Gemini 2.5 Flash Image, cached locally
- Full details: instructions, tips, common mistakes

### Dashboard
- Daily motivational quotes (21 seeded)
- Health & gym science facts (20 seeded)
- Fitness progression: XP, level, workout count, volume, streak
- Weekly workout completion rate
- **Build Inspiration** — user-uploaded photo carousel (max 3)
- **Nutrition Suggestions** — goal-ranked meal ideas

### Gym Crowd & Opening Hours
- Gym selection with autocomplete (Google Places when configured, Nominatim fallback)
- Crowd estimates: BestTime API, community reports, or time-of-day simulation
- Opening-hours enrichment (Google Places / Overpass) with open/closed status
- 1–5 crowd level reporting with 60-minute community aggregation window
- Manual hours refresh (`POST /api/profile/gym/refresh-hours`)

### AI Coach
- Chat relay through Go backend to Google Gemini API
- User context injection (goals, allergies, recent workouts)
- Streaming responses (SSE) with word-by-word rendering
- Natural-language weekly plan generation (`POST /api/chat/plan`)
- Message history persistence + per-message delete
- Suggested prompt chips
- Clear chat history

### Health Tab
- Daily nutrition summary with calorie/protein goal progress bars (days with no logged food or water are marked **No update**)
- **Quick food log:** enter calories, protein, carbs, fat, and water — everything adds up toward your daily goals
- **Personalized goals:** calorie, protein, and water targets are assessed from the height & weight captured at registration, adjustable anytime from Settings or the Body Stats shortcut cards on the Account and Health tabs
- Meal logging with preworkout/postworkout/general categorization (with per-meal delete)
- Water intake tracking (custom amounts via Quick Log, plus a 250ml quick-add)
- **Pre/Post Meal Selection:** goal-ranked suggestions can be added straight to the food log as Pre-Workout / Post-Workout / General, or log a custom meal
- Food photo scanner (camera → Go backend → Google Gemini → analysis)
- Ingredient breakdown, health score, and allergen flags per scan
- Scan history with saved analyses
- Meal suggestions filtered by allergies, dietary preferences, and ranked by fitness goal
- Weekly nutrition summary

### Tracking
- Weight logging
- Body measurements
- Sleep logging with quality rating

### Theme
- Primary: `#EA580C` (orange) with `#FB923C` (light orange) for dark mode
- Monochrome foundation with orange accent
- Full light/dark mode support via ThemeContext with AsyncStorage persistence
- Consistently applied across all screens via theme system

## What's NOT Yet Implemented

These are from the original specification but deferred or simplified:

- **PostgreSQL** — Using SQLite instead (simpler, no server needed for dev)
- **Dedicated `services/` layer** — Business logic is in handlers (simpler for current scope)
- **Versioned migration files** — Using inline `CREATE TABLE IF NOT EXISTS` + `ensureColumn()`
- **TypeScript** — Using JavaScript for the Expo app (faster iteration)
- **Offline resilience** — No local caching of API data
- **Push notifications** — Not configured
- **Drag-and-drop exercise reordering** — Not implemented
- **BMI calculator** — Not implemented
- **Data export** — Not implemented

## API Endpoints (71 routes)

### Auth (public)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login → JWT token |

### Auth (protected)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/refresh` | Refresh expired token |

### Profile (protected)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/profile` | Get profile |
| PUT | `/api/profile` | Update profile |
| POST | `/api/profile/picture` | Upload profile picture |
| GET | `/api/profile/settings` | Get settings |
| PUT | `/api/profile/settings` | Update settings |
| POST | `/api/profile/onboarding` | Complete onboarding (incl. body stats → daily goal assessment) |
| POST | `/api/profile/goals` | Recompute daily calorie / protein / water targets from body stats |
| DELETE | `/api/profile` | Delete account |
| GET | `/api/profile/gym` | Get gym preference |
| PUT | `/api/profile/gym` | Update gym preference |
| POST | `/api/profile/gym/refresh-hours` | Manually refresh opening hours |

### Plans & Routines (protected)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/plans` | List plans (`?week=` for specific week) |
| POST | `/api/plans` | Create plan (2 routine / 3 one-time limits) |
| GET | `/api/plans/{planId}` | Get plan details |
| PUT | `/api/plans/{planId}` | Update plan |
| DELETE | `/api/plans/{planId}` | Delete plan (cascade) |
| POST | `/api/plans/{planId}/clone` | Clone to new week |
| POST | `/api/plans/{planId}/activate` | Set active routine (resets progression) |

### Workout Sessions (protected)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/workouts` | Start workout session |
| GET | `/api/workouts/{sessionId}` | Get session details |
| PUT | `/api/workouts/{sessionId}` | Update sets/progress |
| POST | `/api/workouts/{sessionId}/complete` | Complete & log workout |
| POST | `/api/workouts/{sessionId}/cancel` | Cancel, save as draft |
| GET | `/api/workouts/history` | Paginated history |

### Exercise Library
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/exercises` | List exercises (`?muscle_group=&search=`) |
| GET | `/api/exercises/{exerciseId}` | Exercise details |
| POST | `/api/exercises/{exerciseId}/generate-image` | Generate AI illustration for one exercise |
| POST | `/api/exercises/generate-images` | Batch-generate AI images (`?muscle_group=`) |
| GET | `/api/exercises/generate-images/status` | Poll batch job (`?id=`) |
| GET | `/api/workout-templates` | Pre-built templates |

### Nutrition (protected)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/nutrition/daily` | Daily summary (`?date=` for specific date) |
| POST | `/api/nutrition/meals` | Log meal |
| PUT | `/api/nutrition/meals/{mealId}` | Update meal |
| DELETE | `/api/nutrition/meals/{mealId}` | Delete meal |
| POST | `/api/nutrition/water` | Log water intake |
| GET | `/api/nutrition/weekly` | Weekly summary |
| GET | `/api/nutrition/suggestions` | Goal-ranked meal suggestions |

### Food Scanner (protected)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/food-scan` | Upload photo → analyze |
| POST | `/api/food-scan/log` | Log scanned food |
| GET | `/api/food-scan/history` | Scan history |

### Tracking (protected)
| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/weight` | Weight logs |
| DELETE | `/api/weight/{logId}` | Delete weight entry |
| GET/POST | `/api/measurements` | Body measurements |
| GET/POST | `/api/sleep` | Sleep logs |

### Build Inspiration (protected)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/inspiration` | List user's inspiration photos |
| POST | `/api/inspiration/photos` | Upload inspiration photo (max 3) |
| DELETE | `/api/inspiration/photos/{photoId}` | Delete inspiration photo |
| PUT | `/api/inspiration/reorder` | Reorder photos |

### Gym Crowd (protected)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/gym-crowd` | Crowd estimate for the configured gym |
| POST | `/api/gym-crowd/report` | Report crowd level (1–5) |
| GET | `/api/gyms/search` | Gym autocomplete (`?q=`) |
| GET | `/api/gyms/details` | Gym details + opening hours (`?placeId=` or `?lat=&lng=`) |

### Progression Badges (protected)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/badges` | Behavior-based badges computed from Fitness + Health activity |

### Dashboard & Chat (protected)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard` | Aggregated dashboard data (quotes, facts, summaries, inspiration, suggestions) |
| POST | `/api/chat` | Send message to AI Coach |
| POST | `/api/chat/stream` | Stream AI Coach reply (SSE) |
| POST | `/api/chat/plan` | Generate + save a weekly plan from natural language |
| GET | `/api/chat/history` | Chat history |
| GET | `/api/chat/suggestions` | Suggested prompts |
| DELETE | `/api/chat/history` | Clear history |
| DELETE | `/api/chat/history/{messageId}` | Delete a single message |

### Quotes & Facts (protected)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/quotes` | Random motivational quote |
| GET | `/api/facts` | Random health fact |

### Misc
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check (public) |
| GET | `/uploads/*` | Static file serving |

## Running the Project

### Backend
```bash
cd Resolution-fitnessapp/backend
go run .
# Or: make run
```

Server starts on `http://localhost:8080`. Database auto-created at `./database.db`.

### Mobile
```bash
cd Resolution-fitnessapp/mobile
npx expo start
```

Configure the API URL in `mobile/src/api/config.js`.

## Running Tests

### Backend
```bash
cd Resolution-fitnessapp/backend
go test ./... -v
```

57 tests covering: workout-plan handlers (CreatePlan limits, SetActivePlan
activation/reset, ClonePlan limits, GetPlans auto-delete, StartWorkout),
AI Coach chat (fallback, streaming, history, plan generation), gym crowd
(BestTime cache, community reports, opening-hours enrichment), progression
badges (no activity, fitness activity, health-only activity), daily-goal
recommendations (goal-aware formulas, onboarding seeding, recalculate endpoint),
exercise image generation (single/batch/status, edge cases, mime mapping),
meal suggestion ranking (goal-aware ordering), inspiration photo CRUD,
DB path resolution, and migration idempotency.

### Mobile
```bash
cd Resolution-fitnessapp/mobile
npx jest
```

33 tests covering: theme utilities, outline text rendering, imageUrl resolution,
FitnessScreen plan cards (expand/collapse, mode badges, goals),
and HealthScreen Quick Log, goal progress, suggestion-add, meal-delete flows.

**Total: 90 tests across the full stack.**

## Full-Stack Deployment Workflow (Git → CI → Live)

The project is shipped as **two independently deployed pieces** that talk over HTTPS:

```
GitHub ──► GitHub Actions (CI: tests on every push)
   │
   ├──push──► Render  ──► https://resolution-backend.onrender.com  (Go API + SQLite + uploads)
   │
   └──push──► Netlify ──► https://resolution-fitness.netlify.app  (React Native web demo)
   │
   └───────────────────► mobile/app.json → extra.backendUrl  (points the app at the API)
```

| Layer | Host | Updates on | Config |
|-------|------|------------|--------|
| **Frontend (web demo)** | Netlify (free) | push to `main` | `netlify.toml` (`base=mobile`, builds `dist/`)
| **Backend (API/DB)** | Render (free) | push to `main` | `render.yaml` (native Go runtime, free plan)
| **CI (tests)** | GitHub Actions | every push / PR | `.github/workflows/ci.yml`
| **Mobile (store builds)** | EAS Build | manual | `mobile/eas.json` (dev / preview / prod)

### Deploy loop

```bash
git add . && git commit -m "describe the change" && git push origin main
```

1. **Push** to GitHub.
2. **CI** runs backend tests (`go test`/`go vet`) and mobile checks (`tsc`/`jest`)
   in parallel as a safety gate.
3. **Render** and **Netlify** each auto-redeploy from the push (they do **not** wait
   for CI — keep a red Actions tab from going live by pushing tested code).
4. **Hard-refresh** the browser to see the new web build.

### Secrets never live in git

Real env vars (`GEMINI_API_KEY`, `JWT_SECRET`, rate-limit config) are set in the
Render dashboard, not committed. `backend/.env.example` documents them.

### ⚠️ Free-tier caveat

Render's free plan uses an ephemeral filesystem: `database.db` and `uploads/` reset
on every backend redeploy. The app re-seeds itself, so it always boots — but user
data starts fresh after each push. Upgrade or move to persistent storage when
real data persistence is needed.

## Design Decisions

- **SQLite over PostgreSQL** for zero-config development — no server needed
- **Pure-Go SQLite driver** (`modernc.org/sqlite`) — no C compiler required, cross-platform
- **Inline migrations** with `ensureColumn()` — idempotent, zero log noise on existing DBs
- **JavaScript over TypeScript** for the mobile app — faster iteration (tsconfig included as stub)
- **Theme system** — Light/dark mode supported via ThemeContext with reactive StatusBar
- **Splash screen** — Custom animated overlay with logo fade + overlay fade-out via expo-splash-screen
- **Handlers contain business logic** over a separate `services/` layer —
  keeps the codebase simpler at this scale
- **Routine constraints** (max 2 consistent, max 3 one-time) enforced
  server-side with transactions to prevent race conditions
- **Cascade deletes** handled explicitly in transactions where SQLite
  foreign keys lack `ON DELETE CASCADE` (e.g., `workout_sessions`)
- **Progression stats reset** on active routine switch — progression is
  tied to consistency with a specific routine
- **Goal-aware meal ranking** — suggestions are sorted by the user's
  primary fitness goal (protein-forward for muscle gain, lighter for weight loss)
- **Badge computation is live** — no badge state is persisted; every
  request evaluates the current stats for freshness
- **DB path resolution** — binary looks for `database.db` next to the
  executable first, then falls back to cwd; prevents silent fresh DBs
