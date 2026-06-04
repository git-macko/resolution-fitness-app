# Resolution Fitness

**A full-stack gym fitness mobile app** — Go REST API backend + React Native (Expo) frontend.

Plan your workouts, track progress with XP/levels/streaks, scan food for nutrition insights, and chat with an AI fitness coach.

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
└──────────────────────┘          └──────────────────────┘
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

Configure the backend URL in `mobile/src/api/config.js`.

### Tests

```bash
cd Resolution-fitnessapp/backend
go test ./handlers/ -v
```

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
- Complete & log → updates XP, streaks, and levels
- Paginated workout history

### 📈 Dashboard
- Daily motivational quotes (20+ seeded)
- Health & gym science facts (20+ seeded)
- Fitness level with XP progression system
- Streak tracking (current & longest)
- Weekly workout completion rate

### 🥗 Health — Food Scanner & Nutrition
- **Food photo analysis** via OpenAI Vision API
- Daily nutrition dashboard with macro tracking
- Preworkout / Postworkout / General meal categorization
- Water intake tracker
- Meal suggestions filtered by allergies & dietary preferences
- Weekly nutrition summaries

### 📏 Body Tracking
- Weight logging with date
- Body measurements (chest, waist, arms, thighs, hips)
- Sleep tracking with quality ratings

### 🤖 AI Coach
- Chat with context-aware AI (goals, allergies, recent workouts)
- Message history persistence
- Suggested prompts
- Flows through Go backend for user context injection

### 👤 Account
- JWT authentication (register, login, token refresh)
- Profile management with photo upload
- Onboarding (fitness level, goals, allergies)
- Settings (units, notifications, rest timers, targets)
- Account deletion

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Go 1.22+, `net/http`, SQLite, JWT, bcrypt |
| **Frontend** | React Native, Expo SDK 54, React Navigation v7 |
| **Auth** | JWT (`golang-jwt/jwt/v5`) with 72h expiry |
| **Database** | SQLite (WAL mode, foreign keys ON) |
| **AI** | OpenAI GPT-4o (chat) + Vision API (food scan) |
| **Testing** | Go `testing` package, in-memory SQLite |

---

## Project Structure

```
Resolution-fitnessapp/
├── backend/                    # Go REST API
│   ├── main.go                 # Server entry point
│   ├── config/                 # Environment config
│   ├── database/               # SQLite connection & migrations
│   ├── handlers/               # All HTTP handlers
│   ├── middleware/              # JWT auth, CORS, logging
│   ├── models/                 # Data structures
│   ├── utils/                  # Response helpers, validation, dates
│   └── handlers/workouts_test.go  # 16 unit tests
│
├── mobile/                     # React Native (Expo)
│   ├── App.js
│   └── src/
│       ├── api/                # HTTP client + config
│       ├── contexts/           # AuthContext
│       ├── navigation/         # Tab + stack navigators
│       ├── screens/            # 13 screens
│       ├── theme/              # colors, spacing, typography
│       └── utils/
│
└── PROMPT.md                   # Full project overview
```

---

## API at a Glance

| Category | Key Endpoints |
|----------|--------------|
| Auth | `POST /api/auth/register`, `POST /api/auth/login` |
| Plans | `GET/POST /api/plans`, `POST /api/plans/{id}/activate`, `DELETE /api/plans/{id}` |
| Workouts | `POST /api/workouts`, `POST /api/workouts/{id}/complete` |
| Nutrition | `GET /api/nutrition/daily`, `POST /api/nutrition/meals` |
| Food Scan | `POST /api/food-scan` (photo → AI analysis) |
| Dashboard | `GET /api/dashboard` (aggregated data) |
| Chat | `POST /api/chat` (AI Coach) |

Full API reference in [PROMPT.md](PROMPT.md).

---

## Design Principles

- **Zero-config backend** — `go run .` is all you need; SQLite auto-creates
- **Server-side constraints** — routine limits enforced in transactions
- **Progression reset on active switch** — XP/level/streak tied to routine consistency
- **Cascade cleanup** — deleting a plan removes all linked sessions/days/exercises
- **Consistent API shape** — all responses follow `{ data, message }` or `{ error }`
- **Theme system** — purple (#7C3AED) accent on monochrome foundation
