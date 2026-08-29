# Resolution Fitness

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

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
go test ./... -v   # 109 tests (workouts, chat, gym, badges, goals, food-scan, exercise images, CORS, rate limiting, config, migrations)
```

```bash
cd Resolution-fitnessapp/mobile
npx jest            # 57 tests (theme utils, all 4 tab screens: Dashboard, Fitness, Health, Account)
```

**Total: 166 tests across the full stack.**

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
| **Testing** | Go `testing` package + Jest (166 tests total) |

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

## Deployment

The backend now fails fast in production: it refuses to start (`APP_ENV=production`) with a missing, placeholder, or short `JWT_SECRET`. CORS is whitelist-configurable via `CORS_ALLOWED_ORIGINS`. Native mobile apps are unaffected by CORS (they send no Origin header).

### Backend (Docker)

```bash
cd backend
docker build -t resolution-backend .
docker run -p 8080:8080 \
  --env-file .env \
  -e APP_ENV=production \
  -e JWT_SECRET=$(openssl rand -base64 48) \
  -e CORS_ALLOWED_ORIGINS=https://app.yourdomain.com \
  -v resolution-data:/app/data \
  resolution-backend
```

- The container stores the SQLite DB in `/app/data` and uploads in `/app/uploads` (both volumes).
- Or deploy the static binary directly: `go build -o resolution-server .`

### Backend (Render — free tier, zero cost)

The repo ships a [`render.yaml`](render.yaml) blueprint at the repo root. Steps:

1. Push the repo to GitHub.
2. In [render.com](https://render.com) → **New → Blueprint** → pick your repo. Render detects `render.yaml` and creates the service with free-tier defaults.
3. After the first deploy, set your real `GEMINI_API_KEY` (and optionally `GOOGLE_PLACES_API_KEY` / `BESTTIME_API_KEY`) under **Settings → Environment**.
4. Copy the service URL (e.g. `https://resolution-backend.onrender.com`) into `mobile/app.json → extra.backendUrl` before building the mobile app.

> ⚠️ **Free-tier caveats:** the free service sleeps after ~15 min idle (first request wakes it in ~30s) and its filesystem is **ephemeral** — the SQLite DB and uploads reset on every redeploy. Great for demos; upgrade for persistent data.

### Mobile (EAS Build)

```bash
cd mobile
npm i -g eas-cli        # once
eas login               # once
eas build:configure     # once — wires up the profiles in eas.json

npm run build:dev       # development build (Expo Go companion / dev client)
npm run build:preview   # internal test build (installable APK/IPA)
npm run build:prod      # store-ready build (App Store / Play Store)
```

Before a **production** build, set the deployed backend URL in `mobile/app.json` → `extra.backendUrl` (e.g. `https://api.yourdomain.com`). Leave it empty for local development (auto-detection kicks in).

## Showcase & Demo (free)

Two zero-cost ways to show the app to recruiters or friends — a clickable web
link and a side-loadable Android APK. Both talk to the deployed Render
backend via `mobile/app.json → extra.backendUrl`.

### Live web link (Netlify, free)

Deploys the React Native app as an interactive web demo anyone can open in a
browser (no iPhone/Android needed). Builds on Git push if connected, or
manually:

```bash
cd mobile
npm run export:web        # static build → mobile/dist
npx netlify-cli deploy --prod --dir dist
```

You get a public URL like `https://resolution-fitness.netlify.app` to share.
The [`netlify.toml`](netlify.toml) at the repo root sets the publish dir and
a SPA fallback.

> Browser builds can't use the camera (food scan) or some device APIs, but the
> full UI, navigation, AI coach, and data flows work.

### Installable Android APK (EAS Build, free)

The free EAS plan produces a shareable, side-loadable **APK**:

```bash
cd mobile
npm i -g eas-cli
npx eas-cli login         # free expo.dev account
npm run build:preview     # → .apk (buildType apk, see eas.json)
```

Install the APK on any Android phone (allow "install unknown apps"). Play
Store publishing is a one-time $25 fee — see [eas.json](mobile/eas.json).

> For iOS, 'preview' produces an IPA that requires the $99/yr Apple Developer
> Program to install outside your own device.

---

## Deployment Checklist

Before deploying to production:

- [ ] Set `APP_ENV=production` on the server
- [ ] Set a strong `JWT_SECRET` (≥ 32 chars) — generate with `openssl rand -base64 48` (the server refuses to start without it in production)
- [ ] Set `CORS_ALLOWED_ORIGINS` to your exact web origins (empty = allow all; native apps unaffected)
- [ ] Set `GEMINI_API_KEY` for AI Coach + Food Scanner
- [ ] Set rate limits: `RATE_LIMIT_PER_MINUTE` (e.g. 120), `AUTH_RATE_LIMIT_PER_MINUTE` (e.g. 10), `AI_RATE_LIMIT_PER_MINUTE` (e.g. 20) — 0 disables
- [ ] Configure `GOOGLE_PLACES_API_KEY` for gym autocomplete (optional)
- [ ] Set `BESTTIME_API_KEY` for real crowd data (optional)
- [ ] Deploy with Docker (`docker build -t resolution-backend backend`) or the static binary
- [ ] Ensure `./uploads/` (or the `/app/uploads` volume) exists and is writable
- [ ] Set `mobile/app.json` → `extra.backendUrl` to the production backend URL before EAS production builds
- [ ] Run full test suite: `go test ./... -v` (109 backend) + `npx jest` (57 mobile)
- [ ] Smoke test `GET /api/health` after deploying
