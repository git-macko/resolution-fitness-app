# Resolution Fitness

**v1.0 — First Deployable Release** 🚀

A full-stack gym fitness mobile app — Go REST API backend + React Native (Expo) frontend.

Plan your workouts, track progress with XP/levels/streaks, scan food for nutrition insights, chat with an AI fitness coach, and earn progression badges.

---

## Architecture

```
┌──────────────────────┐          ┌──────────────────────┐
│   React Native App   │  HTTP    │    Go API Server     │
│   (Expo, JavaScript) │◄────────►│  (net/http, SQLite)  │
│                      │   JSON   │                      │
│  • 4-tab navigation  │          │  • JWT auth          │
│  • Dashboard         │          │  • Plans & workouts  │
│  • Fitness           │          │  • Nutrition & meals │
│  • Health            │          │  • AI Coach relay    │
│  • Account           │          │  • XP/streak system  │
└──────────────────────┘          │  • Progression badges│
                                  │  • Goal assessment   │
                                  │  • Build inspiration │
                                  └──────────────────────┘
```

---

## Quick Start

### Backend

```bash
cd Resolution-fitnessapp/backend
go run .
# Starts on http://localhost:8080
# SQLite database auto-created at ./database.db
```

### Mobile

```bash
cd Resolution-fitnessapp/mobile
npx expo start
# Scan QR code with Expo Go, or press 'a' for Android / 'i' for iOS
```

Configure the backend URL in `mobile/src/api/config.js`.

### Tests

```bash
cd Resolution-fitnessapp/backend
go test ./... -v   # 57 tests (workouts, chat, gym, badges, goals, food-scan, exercise images, migrations, config)
```

```bash
cd Resolution-fitnessapp/mobile
npx jest            # 33 tests (theme utils, screens incl. Health Quick Log)
```

**Total: 90 tests across the full stack.**

---

## Features

### 🏋️ Fitness — Routine Management
- Create up to **2 consistent routines** and **3 one-time overrides**
- Automatically activated first routine
- **Set Active** flow with progression reset warning
- Cascade delete (cleans up workout sessions, days, exercises)
- Clone routines to new weeks
- Pre-built templates (PPL, Upper/Lower, Full Body)

### 📊 Workout Execution
- Start workouts from plan days or ad-hoc
- Set-by-set tracking with rest timers
- **Workout visuals** — demo image/GIF of the current exercise with emoji fallback
- **Rest screens** — full-screen breathing overlay with motivational quotes and skip control
- **Breathing patterns** — configurable via Settings (Box, 4-7-8, Deep, Calm)
- Complete & log → updates XP, streaks, and levels
- Paginated workout history

### 📚 Exercise Library
- 27 exercises across chest, back, legs, shoulders, arms, core, cardio
- Filter by muscle group, search by name
- **AI-generated exercise illustrations** — clean fitness art via Gemini 2.5 Flash Image, cached locally
- Full details: instructions, tips, common mistakes

### 📈 Dashboard
- Daily motivational quotes (21 seeded)
- Health & gym science facts (20 seeded)
- Fitness level with XP progression system
- Streak tracking (current & longest)
- Weekly workout completion rate
- **Build Inspiration** — user-uploaded photo carousel (max 3)
- **Nutrition Suggestions** — goal-ranked meal ideas card

### 🕒 Gym — Crowd & Opening Hours
- Gym selection with autocomplete (Google Places when configured, Nominatim fallback)
- Live crowd estimates (BestTime API, community reports, or time-of-day simulation)
- Opening-hours enrichment (Google Places / Overpass) with open/closed status
- 1–5 crowd level reporting with community aggregation

### 🥗 Health — Food Scanner & Nutrition
- **Food photo analysis** via Google Gemini Vision API
- Ingredient breakdown, health score, and allergen flags per scan
- Scan history with saved analyses
- **Quick food log** — enter calories, protein, carbs, fat & water; totals add up toward your goals with progress bars
- **Personalized goals** — calorie/protein/water targets assessed from height & weight captured at registration, editable in Settings or via the Body Stats card on the Account & Health tabs
- **No-update days** — days without any logged food or water are marked "No update" on the Health tab
- Preworkout / Postworkout / General meal categorization (with per-meal delete)
- Water intake tracker (custom amounts via Quick Log, plus a 250ml quick-add)
- **Pre/Post Meal Selection** — add goal-ranked suggestions straight to the food log, or log a custom meal
- Meal suggestions filtered by allergies, dietary preferences & ranked by goal
- Weekly nutrition summaries

### 📏 Body Tracking
- Weight logging with date
- Body measurements (chest, waist, arms, thighs, hips)
- Sleep tracking with quality ratings

### 🤖 AI Coach
- Chat with context-aware AI (goals, allergies, recent workouts)
- Streaming responses (SSE) + natural-language plan generation
- Message history persistence with per-message delete
- Suggested prompts
- Flows through Go backend for user context injection

### 👤 Account
- JWT authentication (register, login, token refresh)
- Profile management with photo upload
- Onboarding (fitness level, goals, body stats → daily calorie/protein/water goal assessment, allergies)
- Settings (units, notifications, rest timers, breathing pattern, targets)
- **Progression Badges** — Rookie 🐣, Casual Goer 🏋️, Motivated Temporarily ⚡, Gym Rat 🐀 earned from workouts & nutrition tracking, with live progress bars
- Account deletion

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Go 1.25+, `net/http`, SQLite (pure-Go), JWT, bcrypt |
| **Frontend** | React Native, Expo SDK 54, React Navigation v7 |
| **Auth** | JWT (`golang-jwt/jwt/v5`) with 72h expiry |
| **Database** | SQLite (WAL mode, foreign keys ON) |
| **AI** | Google Gemini (chat, food scan, exercise images) |
| **Testing** | Go `testing` package + Jest (90 tests total) |

---

## Project Structure

```
Resolution-fitnessapp/
├── backend/                    # Go REST API
│   ├── main.go                 # Server entry point (65 routes)
│   ├── config/                 # Environment config + DB path resolution
│   ├── database/               # SQLite connection + idempotent migrations
│   ├── handlers/               # All HTTP handlers (20 files)
│   │   ├── auth.go             # Register, Login, Refresh
│   │   ├── profile.go          # Profile CRUD, Settings, Onboarding, Body Stats
│   │   ├── workouts.go         # Plans CRUD, SetActive, ClonePlan, Sessions
│   │   ├── nutrition.go        # Daily Nutrition, Meals, Water, Suggestions
│   │   ├── food_scan.go        # Food Photo Scan + Gemini Vision
│   │   ├── exercise_image.go   # AI exercise illustrations
│   │   ├── goals.go            # Personalized calorie/protein/water goals
│   │   ├── badges.go           # Progression badge computation
│   │   ├── inspiration.go      # Build Inspiration photo CRUD
│   │   ├── dashboard.go        # Aggregated dashboard data
│   │   ├── chat.go             # AI Coach chat + streaming
│   │   ├── gemini.go           # Gemini API client
│   │   ├── gym.go              # Gym prefs, crowd, opening hours
│   │   ├── tracking.go         # Weight, Body Measurements, Sleep
│   │   └── *_test.go           # 57 tests (in-memory SQLite)
│   ├── middleware/              # JWT auth, CORS, request logger
│   ├── models/                 # Data structures (7 files)
│   ├── utils/                  # Response helpers, validation
│   └── uploads/                # Static file serving (profile pics, food photos)
│
├── mobile/                     # React Native (Expo)
│   ├── App.js                  # Root entry (splash + theme + auth providers)
│   └── src/
│       ├── api/                # HTTP client + config
│       ├── components/         # 15 reusable UI components
│       │   ├── BreathingVisual.js      # Breathing overlay for rest screens
│       │   ├── BuildInspirationCard.js # Photo carousel for dashboard
│       │   ├── CarouselDots.js         # Pagination dots
│       │   ├── NutritionSuggestionCard.js # Goal-ranked meal suggestions
│       │   ├── PhotoLightbox.js        # Full-screen photo viewer
│       │   └── ... (Card, HeroCard, HeroStat, ExerciseLibrary, etc.)
│       ├── contexts/           # AuthContext, ThemeContext
│       ├── navigation/         # Tab + stack navigators
│       ├── screens/            # 14 screens + __tests__
│       ├── theme/              # typography, spacing, themes (light/dark)
│       └── utils/              # dates, openingHours, imageUrl, usePressScale
│
└── PROMPT.md                   # Full project overview
```

---

## API at a Glance (71 endpoints)

| Category | Endpoints |
|----------|-----------|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh` |
| Profile | `GET/PUT /api/profile`, `POST /api/profile/picture`, `POST /api/profile/goals` |
| Settings | `GET/PUT /api/profile/settings` |
| Onboarding | `POST /api/profile/onboarding` (with body stats → goal assessment) |
| Gym | `GET/PUT /api/profile/gym`, `GET /api/gym-crowd`, `GET /api/gyms/search` |
| Plans | `GET/POST /api/plans`, `PUT/DELETE /api/plans/{id}`, `POST .../clone`, `POST .../activate` |
| Workouts | `POST /api/workouts`, `GET/PUT /api/workouts/{id}`, `POST .../complete`, `POST .../cancel` |
| Nutrition | `GET /api/nutrition/daily`, `POST/PUT/DELETE /api/nutrition/meals`, `POST .../water` |
| Food Scan | `POST /api/food-scan`, `POST .../log`, `GET .../history` |
| Exercises | `GET /api/exercises`, `POST .../generate-image`, `POST .../generate-images` |
| Inspiration | `GET/POST/DELETE /api/inspiration/photos`, `PUT .../reorder` |
| Badges | `GET /api/badges` |
| Dashboard | `GET /api/dashboard` (quotes, facts, summaries, inspiration, suggestions) |
| Chat | `POST /api/chat`, `POST .../stream`, `POST .../plan`, `GET .../history` |
| Tracking | `GET/POST /api/weight`, `GET/POST /api/measurements`, `GET/POST /api/sleep` |
| Misc | `GET /api/health`, `GET /uploads/*` |

Full API reference in [PROMPT.md](PROMPT.md).

---

## Design Principles

- **Zero-config backend** — `go run .` is all you need; SQLite auto-creates
- **Pure-Go** — no C compiler required (modernc.org/sqlite)
- **Server-side constraints** — routine limits enforced in transactions
- **Progression reset on active switch** — XP/level/streak tied to routine consistency
- **Idempotent migrations** — `ensureColumn()` checks before adding; safe to run on every boot
- **Cascade cleanup** — deleting a plan removes all linked sessions/days/exercises
- **Consistent API shape** — all responses follow `{ data, message }` or `{ error }`
- **Theme system** — orange (#EA580C) accent on monochrome foundation with light/dark mode support

---

## Deployment Checklist

Before deploying to production:

- [ ] Set a strong `JWT_SECRET` (≥ 32 chars) in `.env`
- [ ] Set `GEMINI_API_KEY` for AI Coach + Food Scanner
- [ ] Configure `GOOGLE_PLACES_API_KEY` for gym autocomplete (optional)
- [ ] Set `BESTTIME_API_KEY` for real crowd data (optional)
- [ ] Update `mobile/src/api/config.js` to point to production backend URL
- [ ] Run `go build -o resolution-server .` and deploy the binary
- [ ] Ensure `./uploads/` directory exists and is writable
- [ ] Run full test suite: `go test ./... -v` (57 backend) + `npx jest` (33 mobile)
