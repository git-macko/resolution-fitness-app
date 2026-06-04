# Resolution Fitness — Project Overview

A full-stack gym fitness mobile app with a **Go backend** (REST API + SQLite) and a
**React Native / Expo frontend** (4-tab mobile app).

## Tech Stack

### Backend (Go)
- **Language:** Go 1.22+
- **Router:** `net/http` with Go 1.22+ pattern matching (`"POST /api/plans/{planId}"`)
- **Database:** SQLite via `mattn/go-sqlite3` (WAL mode, foreign keys ON)
- **Authentication:** JWT (`golang-jwt/jwt/v5`) with bcrypt password hashing
- **Migrations:** Inline `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE` additions on startup
- **CORS:** Custom middleware
- **Testing:** `testing` package with in-memory SQLite

### Mobile (React Native / Expo)
- **Framework:** React Native via Expo (SDK 54, managed workflow)
- **Navigation:** React Navigation v7 (bottom tabs + native stacks)
- **State:** React Context (AuthContext)
- **HTTP Client:** `fetch` with JWT interceptor
- **Expo Libraries:** expo-camera, expo-image-picker, expo-haptics,
  expo-linear-gradient, AsyncStorage

## Project Structure

```
Resolution-fitnessapp/
├── backend/                          # Go REST API server
│   ├── main.go                       # Entry point, route registration, seeding
│   ├── Makefile                      # run, build, test, clean
│   ├── config/config.go              # Environment config (port, JWT secret, DB path)
│   ├── database/database.go          # SQLite connection + all table migrations
│   ├── models/                       # Go structs (user, workout, nutrition, tracking, content, common)
│   ├── handlers/                     # HTTP handlers for all API endpoints
│   │   ├── auth.go                   # Register, Login, Refresh
│   │   ├── profile.go                # Get/Update Profile, Upload Picture, Settings, Onboarding
│   │   ├── workouts.go               # Plans CRUD, SetActive, ClonePlan, Workout Sessions, Templates
│   │   ├── nutrition.go              # Daily Nutrition, Meals, Water, Weekly Summary, Suggestions
│   │   ├── food_scan.go              # Food Photo Scan + OpenAI Vision API proxy
│   │   ├── tracking.go               # Weight, Body Measurements, Sleep
│   │   ├── dashboard.go              # Aggregated dashboard data
│   │   └── chat.go                   # AI Coach chat relay
│   ├── middleware/middleware.go       # JWT Auth, CORS, Request Logger
│   ├── utils/                        # response.go, validation.go, date_helpers.go
│   ├── handlers/workouts_test.go     # 16 unit tests for plans and routines
│   ├── uploads/                      # Static file serving (profile pics, food photos)
│   └── database.db                   # SQLite database file (auto-created)
│
├── mobile/                           # React Native Expo app
│   ├── App.js                        # Root component
│   ├── app.json                      # Expo config
│   ├── src/
│   │   ├── api/
│   │   │   ├── client.js             # HTTP client + token management
│   │   │   └── config.js             # API base URL config
│   │   ├── contexts/
│   │   │   └── AuthContext.js         # Global auth state
│   │   ├── navigation/
│   │   │   └── AppNavigator.js        # Tab + stack navigation
│   │   ├── screens/                   # All app screens
│   │   │   ├── LoginScreen.js, RegisterScreen.js, OnboardingScreen.js
│   │   │   ├── DashboardScreen.js, FitnessScreen.js
│   │   │   ├── HealthScreen.js, FoodScanScreen.js
│   │   │   ├── AccountScreen.js, SettingsScreen.js
│   │   │   ├── ChatScreen.js
│   │   │   ├── CreatePlanScreen.js, WorkoutExecutionScreen.js, ExerciseDetailScreen.js
│   │   ├── theme/                    # colors.js, spacing.js, typography.js
│   │   └── utils/                    # dates.js
│
├── scripts/                          # Utility scripts
│   ├── update-lan-ip.sh
│   └── update-lan-ip.ps1
│
└── PROMPT.md                         # Project overview & API reference
```

## Key Features Implemented

### Authentication & Profile
- Register, Login, JWT token refresh
- Profile CRUD with photo upload
- Onboarding flow (fitness level, goals, allergies, dietary preferences)
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
- Complete workout → stats update, XP gain, streak calculation, level-up
- Cancel/save-as-draft
- Workout history with pagination

### Exercise Library
- 25+ exercises across chest, back, legs, shoulders, arms, core, cardio
- Filter by muscle group, search by name
- Full details: instructions, tips, common mistakes

### Dashboard
- Daily motivational quotes (20+ seeded)
- Health & gym science facts (20+ seeded)
- Fitness progression: XP, level, workout count, volume, streak
- Weekly workout completion rate

### AI Coach
- Chat relay through Go backend to OpenAI API
- User context injection (goals, allergies, recent workouts)
- Message history persistence
- Suggested prompt chips
- Clear chat history

### Health Tab
- Daily nutrition summary
- Meal logging with preworkout/postworkout/general categorization
- Water intake tracking
- Food photo scanner (camera → Go backend → OpenAI Vision API → analysis)
- Meal suggestions filtered by allergies and dietary preferences
- Weekly nutrition summary

### Tracking
- Weight logging
- Body measurements
- Sleep logging with quality rating

### Theme
- Primary: `#7C3AED` (vivid purple) with `#A78BFA` (light purple)
- Monochrome foundation with purple accent
- Consistently applied across all screens via theme system

## What's NOT Yet Implemented

These are from the original specification but deferred or simplified:

- **PostgreSQL** — Using SQLite instead (simpler, no server needed for dev)
- **Dedicated `services/` layer** — Business logic is in handlers (simpler for current scope)
- **Versioned migration files** — Using inline `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE`
- **TypeScript** — Using JavaScript for the Expo app (faster iteration)
- **Workout Templates** — Cached in-memory Go structs (not seeded in DB yet)
- **Offline resilience** — No local caching of API data
- **Push notifications** — Not configured
- **Dark mode** — Not implemented
- **Drag-and-drop exercise reordering** — Not implemented
- **BMI calculator** — Not implemented
- **Data export** — Not implemented

## API Endpoints

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
| POST | `/api/profile/onboarding` | Complete onboarding |
| DELETE | `/api/profile` | Delete account |

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
| GET | `/api/workout-templates` | Pre-built templates |

### Nutrition (protected)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/nutrition/daily` | Daily summary |
| POST | `/api/nutrition/meals` | Log meal |
| PUT | `/api/nutrition/meals/{mealId}` | Update meal |
| DELETE | `/api/nutrition/meals/{mealId}` | Delete meal |
| POST | `/api/nutrition/water` | Log water intake |
| GET | `/api/nutrition/weekly` | Weekly summary |
| GET | `/api/nutrition/suggestions` | Meal suggestions |

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

### Dashboard & Chat (protected)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard` | Aggregated dashboard data |
| POST | `/api/chat` | Send message to AI Coach |
| GET | `/api/chat/history` | Chat history |
| GET | `/api/chat/suggestions` | Suggested prompts |
| DELETE | `/api/chat/history` | Clear history |

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
```bash
cd Resolution-fitnessapp/backend
go test ./handlers/ -v
```

16 unit tests covering: CreatePlan limits, SetActivePlan activation/reset,
ClonePlan limits, GetPlans auto-delete.

## Design Decisions

- **SQLite over PostgreSQL** for zero-config development — no server needed
- **Inline migrations** over versioned migration files — simpler for a single-developer project
- **JavaScript over TypeScript** for the mobile app — faster iteration
- **Handlers contain business logic** over a separate `services/` layer —
  keeps the codebase simpler at this scale
- **Routine constraints** (max 2 consistent, max 3 one-time) enforced
  server-side with transactions to prevent race conditions
- **Cascade deletes** handled explicitly in transactions where SQLite
  foreign keys lack `ON DELETE CASCADE` (e.g., `workout_sessions`)
- **Progression stats reset** on active routine switch — progression is
  tied to consistency with a specific routine
