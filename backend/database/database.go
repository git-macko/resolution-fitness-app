// Package database handles the SQLite database connection and migrations.
// It uses the standard database/sql package with a pure-Go SQLite driver
// (modernc.org/sqlite) so the backend compiles without cgo and no longer
// requires CC/CXX to be set to an external C compiler.
// All migrations run on startup — tables are created IF NOT EXISTS so
// this is safe to run repeatedly.
package database

import (
	"database/sql"
	"fmt"

	sqlite "modernc.org/sqlite"
)

// Register the pure-Go SQLite driver under the legacy "sqlite3" driver name.
// Without this alias, `sql.Open("sqlite3", ...)` call sites would need to be
// changed to `sql.Open("sqlite", ...)` (modernc.org/sqlite's default name).
// Keeping the existing "sqlite3" name means zero touch-ups across handlers,
// tests, and main.go. Both names end up registered (modernc registers "sqlite"
// in its own init); the duplicate slot is harmless.
func init() {
	sql.Register("sqlite3", &sqlite.Driver{})
}

// DB is the global database connection pool.
// It is safe for concurrent use by multiple goroutines.
// Initialized by Initialize() and closed by Close().
var DB *sql.DB

// Initialize opens the SQLite database at dbPath and runs all migrations.
// It verifies the connection with a ping and creates all required tables.
// Returns an error if connection fails or migrations can't run.
func Initialize(dbPath string) error {
	var err error

	// ── Open database connection ──────────────────────────────────
	// Using WAL mode for better concurrent read performance.
	// _foreign_keys=on enables foreign key enforcement (disabled by default in SQLite).
	DB, err = sql.Open("sqlite3", dbPath+"?_journal_mode=WAL&_foreign_keys=on&_busy_timeout=5000")
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	// ── Configure connection pool ─────────────────────────────────
	// WAL mode supports concurrent readers + one writer. Multiple open
	// connections prevent queuing and timeouts under concurrent load.
	DB.SetMaxOpenConns(4)
	DB.SetMaxIdleConns(2)

	// ── Verify connection ─────────────────────────────────────────
	if err = DB.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	// ── Run migrations ────────────────────────────────────────────
	if err = runMigrations(); err != nil {
		return fmt.Errorf("failed to run migrations: %w", err)
	}

	fmt.Println("Database initialized successfully")
	return nil
}

// runMigrations creates all database tables if they don't exist.
// Each table creation uses IF NOT EXISTS, making this idempotent.
// The schema mirrors PostgreSQL-style design but adapted for SQLite.
// All SQL is parameterized where user input is involved (in handlers),
// but table creation uses hardcoded DDL (no user input).
func runMigrations() error {
	// ── Users table ───────────────────────────────────────────────
	// The core user account table. Stores authentication and profile data.
	// allergies and dietary_prefs are stored as JSON arrays (SQLite doesn't have native arrays).
	if _, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS users (
			id              TEXT PRIMARY KEY,
			email           TEXT UNIQUE NOT NULL,
			password_hash   TEXT NOT NULL,
			display_name    TEXT DEFAULT '',
			phone_number    TEXT DEFAULT '',
			date_of_birth   TEXT DEFAULT '',
			gender          TEXT DEFAULT '',
			height_cm       REAL DEFAULT 0,
			fitness_level   TEXT DEFAULT 'beginner',
			primary_goal    TEXT DEFAULT 'general',
			allergies       TEXT DEFAULT '[]',
			dietary_prefs   TEXT DEFAULT '[]',
			photo_url       TEXT DEFAULT '',
			onboarding_completed INTEGER DEFAULT 0,
			created_at      TEXT DEFAULT (datetime('now')),
			updated_at      TEXT DEFAULT (datetime('now'))
		);

		CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
	`); err != nil {
		return fmt.Errorf("failed to create users table: %w", err)
	}

	// ── User Settings table ───────────────────────────────────────
	// Separate table for app preferences. One-to-one with users.
	if _, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS user_settings (
			user_id              TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
			units                TEXT DEFAULT 'metric',
			notifications        INTEGER DEFAULT 1,
			workout_reminder_time TEXT DEFAULT '08:00',
			rest_timer_seconds   INTEGER DEFAULT 60,
			weekly_workout_goal  INTEGER DEFAULT 4,
			calorie_target       INTEGER DEFAULT 2000,
			protein_target_grams INTEGER DEFAULT 150,
			water_goal_ml        INTEGER DEFAULT 2000,
			theme                TEXT DEFAULT 'light',
			ai_model             TEXT DEFAULT 'gpt-4o-mini',
			openai_api_key_enc   TEXT DEFAULT '',
			created_at           TEXT DEFAULT (datetime('now')),
			updated_at           TEXT DEFAULT (datetime('now'))
		);
	`); err != nil {
		return fmt.Errorf("failed to create user_settings table: %w", err)
	}

	// ── User Stats table ──────────────────────────────────────────
	// Gamification and progression tracking. One-to-one with users.
	if _, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS user_stats (
			user_id           TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
			total_workouts    INTEGER DEFAULT 0,
			total_minutes     INTEGER DEFAULT 0,
			total_volume_kg   REAL DEFAULT 0,
			current_streak    INTEGER DEFAULT 0,
			longest_streak    INTEGER DEFAULT 0,
			fitness_level     INTEGER DEFAULT 1,
			fitness_xp        INTEGER DEFAULT 0,
			last_workout_date TEXT DEFAULT '',
			join_date         TEXT DEFAULT (datetime('now')),
			updated_at        TEXT DEFAULT (datetime('now'))
		);
	`); err != nil {
		return fmt.Errorf("failed to create user_stats table: %w", err)
	}

	// ── User Goals table ──────────────────────────────────────────
	// User-defined fitness goals with progress tracking.
	if _, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS user_goals (
			id         TEXT PRIMARY KEY,
			user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			title      TEXT NOT NULL,
			target     REAL NOT NULL DEFAULT 0,
			current    REAL DEFAULT 0,
			unit       TEXT DEFAULT '',
			deadline   TEXT DEFAULT '',
			completed  INTEGER DEFAULT 0,
			created_at TEXT DEFAULT (datetime('now'))
		);

		CREATE INDEX IF NOT EXISTS idx_user_goals_user_id ON user_goals(user_id);
	`); err != nil {
		return fmt.Errorf("failed to create user_goals table: %w", err)
	}

	// ── Exercises table ───────────────────────────────────────────
	// Exercise library with full details, instructions, and tips.
	if _, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS exercises (
			id              TEXT PRIMARY KEY,
			name            TEXT NOT NULL,
			muscle_group    TEXT NOT NULL,
			equipment       TEXT NOT NULL DEFAULT '',
			description     TEXT DEFAULT '',
			instructions    TEXT DEFAULT '[]',
			tips            TEXT DEFAULT '[]',
			common_mistakes TEXT DEFAULT '[]',
			alternatives    TEXT DEFAULT '[]',
			image_url       TEXT DEFAULT '',
			gif_url         TEXT DEFAULT '',
			is_active       INTEGER DEFAULT 1,
			created_at      TEXT DEFAULT (datetime('now'))
		);

		CREATE INDEX IF NOT EXISTS idx_exercises_muscle_group ON exercises(muscle_group);
		CREATE INDEX IF NOT EXISTS idx_exercises_name ON exercises(name);
	`); err != nil {
		return fmt.Errorf("failed to create exercises table: %w", err)
	}

	// ── Weekly Plans table ────────────────────────────────────────
	// Users create a plan for each week (Mon-Sun).
	if _, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS weekly_plans (
			id              TEXT PRIMARY KEY,
			user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			week_start_date TEXT NOT NULL,
			week_end_date   TEXT DEFAULT '',
			name            TEXT NOT NULL,
			mode            TEXT DEFAULT '',
			mode_goal       TEXT DEFAULT '',
			is_template     INTEGER DEFAULT 0,
			template_name   TEXT DEFAULT '',
			created_at      TEXT DEFAULT (datetime('now')),
			updated_at      TEXT DEFAULT (datetime('now'))
		);

		CREATE INDEX IF NOT EXISTS idx_weekly_plans_user_id ON weekly_plans(user_id);
		CREATE INDEX IF NOT EXISTS idx_weekly_plans_week_start ON weekly_plans(week_start_date);
	`); err != nil {
		return fmt.Errorf("failed to create weekly_plans table: %w", err)
	}

	// ── Migration: add mode & mode_goal to existing weekly_plans ──
	// Errors are ignored here for idempotency (column may already exist).
	DB.Exec("ALTER TABLE weekly_plans ADD COLUMN mode TEXT DEFAULT ''")
	DB.Exec("ALTER TABLE weekly_plans ADD COLUMN mode_goal TEXT DEFAULT ''")

	// ── Migration: add routine_type ("consistent" | "one_time") ──
	DB.Exec("ALTER TABLE weekly_plans ADD COLUMN routine_type TEXT DEFAULT 'consistent'")

	// ── Migration: add is_active for routine activation tracking ──
	DB.Exec("ALTER TABLE weekly_plans ADD COLUMN is_active INTEGER DEFAULT 0")

	// ── Plan Days table ───────────────────────────────────────────
	// Each day within a weekly plan. Links to a plan.
	if _, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS plan_days (
			id                  TEXT PRIMARY KEY,
			plan_id             TEXT NOT NULL REFERENCES weekly_plans(id) ON DELETE CASCADE,
			day_of_week         INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
			workout_name        TEXT NOT NULL,
			is_rest_day         INTEGER DEFAULT 0,
			estimated_duration  INTEGER DEFAULT 45,
			completed           INTEGER DEFAULT 0,
			completed_date      TEXT DEFAULT '',
			sort_order          INTEGER DEFAULT 0,
			created_at          TEXT DEFAULT (datetime('now'))
		);

		CREATE INDEX IF NOT EXISTS idx_plan_days_plan_id ON plan_days(plan_id);
	`); err != nil {
		return fmt.Errorf("failed to create plan_days table: %w", err)
	}

	// ── Plan Exercises table ──────────────────────────────────────
	// Exercises assigned to a specific plan day.
	// exercise_id may be empty for custom/user-defined exercises —
	// in that case, custom_exercise_name holds the user-provided name.
	if _, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS plan_exercises (
			id                   TEXT PRIMARY KEY,
			plan_day_id          TEXT NOT NULL REFERENCES plan_days(id) ON DELETE CASCADE,
			exercise_id          TEXT DEFAULT '',
			custom_exercise_name TEXT DEFAULT '',
			target_sets          INTEGER DEFAULT 3,
			target_reps          TEXT DEFAULT '8-12',
			target_weight        REAL DEFAULT 0,
			notes                TEXT DEFAULT '',
			sort_order           INTEGER DEFAULT 0,
			created_at           TEXT DEFAULT (datetime('now'))
		);

		CREATE INDEX IF NOT EXISTS idx_plan_exercises_day_id ON plan_exercises(plan_day_id);
	`); err != nil {
		return fmt.Errorf("failed to create plan_exercises table: %w", err)
	}

	// Add custom_exercise_name column if it doesn't exist (for databases created before this migration)
	DB.Exec("ALTER TABLE plan_exercises ADD COLUMN custom_exercise_name TEXT DEFAULT ''")

	// ── Workout Sessions table ────────────────────────────────────
	// Records of actual workout executions.
	if _, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS workout_sessions (
			id               TEXT PRIMARY KEY,
			user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			plan_id          TEXT REFERENCES weekly_plans(id),
			plan_day_id      TEXT REFERENCES plan_days(id),
			workout_name     TEXT NOT NULL,
			date             TEXT DEFAULT (datetime('now')),
			duration_minutes INTEGER DEFAULT 0,
			total_volume_kg  REAL DEFAULT 0,
			completed        INTEGER DEFAULT 0,
			is_draft         INTEGER DEFAULT 0,
			notes            TEXT DEFAULT '',
			created_at       TEXT DEFAULT (datetime('now'))
		);

		CREATE INDEX IF NOT EXISTS idx_workout_sessions_user_id ON workout_sessions(user_id);
		CREATE INDEX IF NOT EXISTS idx_workout_sessions_date ON workout_sessions(date);
	`); err != nil {
		return fmt.Errorf("failed to create workout_sessions table: %w", err)
	}

	// ── Session Exercises table ───────────────────────────────────
	// Exercises performed during a workout session.
	if _, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS session_exercises (
			id             TEXT PRIMARY KEY,
			session_id     TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
			exercise_id    TEXT NOT NULL REFERENCES exercises(id),
			exercise_name  TEXT NOT NULL,
			muscle_group   TEXT NOT NULL,
			sort_order     INTEGER DEFAULT 0,
			notes          TEXT DEFAULT ''
		);
	`); err != nil {
		return fmt.Errorf("failed to create session_exercises table: %w", err)
	}

	// ── Session Sets table ────────────────────────────────────────
	// Individual sets performed for each exercise in a session.
	if _, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS session_sets (
			id                   TEXT PRIMARY KEY,
			session_exercise_id  TEXT NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
			set_number           INTEGER NOT NULL,
			weight_kg            REAL DEFAULT 0,
			reps                 INTEGER DEFAULT 0,
			completed            INTEGER DEFAULT 0,
			rest_seconds         INTEGER DEFAULT 60
		);

		CREATE INDEX IF NOT EXISTS idx_session_sets_exercise ON session_sets(session_exercise_id);
	`); err != nil {
		return fmt.Errorf("failed to create session_sets table: %w", err)
	}

	// ── Food Logs table ───────────────────────────────────────────
	// Meal entries with preworkout/postworkout/general categorization.
	if _, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS food_logs (
			id               TEXT PRIMARY KEY,
			user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			log_date         TEXT NOT NULL DEFAULT (date('now')),
			meal_type        TEXT NOT NULL CHECK (meal_type IN ('preworkout', 'postworkout', 'general')),
			linked_session_id TEXT REFERENCES workout_sessions(id),
			total_calories   INTEGER DEFAULT 0,
			total_protein_g  REAL DEFAULT 0,
			total_carbs_g    REAL DEFAULT 0,
			total_fat_g      REAL DEFAULT 0,
			created_at       TEXT DEFAULT (datetime('now'))
		);

		CREATE INDEX IF NOT EXISTS idx_food_logs_user_date ON food_logs(user_id, log_date);
	`); err != nil {
		return fmt.Errorf("failed to create food_logs table: %w", err)
	}

	// ── Food Items table ──────────────────────────────────────────
	// Individual food items within a meal log.
	if _, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS food_items (
			id             TEXT PRIMARY KEY,
			food_log_id    TEXT NOT NULL REFERENCES food_logs(id) ON DELETE CASCADE,
			name           TEXT NOT NULL,
			serving_size   TEXT DEFAULT '',
			calories       INTEGER DEFAULT 0,
			protein_g      REAL DEFAULT 0,
			carbs_g        REAL DEFAULT 0,
			fat_g          REAL DEFAULT 0,
			health_score   INTEGER DEFAULT 0,
			health_notes   TEXT DEFAULT '',
			allergen_flags TEXT DEFAULT '[]',
			photo_url      TEXT DEFAULT '',
			source         TEXT DEFAULT 'manual',
			sort_order     INTEGER DEFAULT 0
		);
	`); err != nil {
		return fmt.Errorf("failed to create food_items table: %w", err)
	}

	// ── Scanned Foods table ───────────────────────────────────────
	// History of food photo scans with AI analysis results.
	if _, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS scanned_foods (
			id               TEXT PRIMARY KEY,
			user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			photo_url        TEXT NOT NULL DEFAULT '',
			detected_foods   TEXT DEFAULT '[]',
			estimated_serving TEXT DEFAULT '',
			calories         INTEGER DEFAULT 0,
			protein_g        REAL DEFAULT 0,
			carbs_g          REAL DEFAULT 0,
			fat_g            REAL DEFAULT 0,
			health_score     INTEGER DEFAULT 0,
			health_facts     TEXT DEFAULT '',
			allergen_flags   TEXT DEFAULT '[]',
			was_logged       INTEGER DEFAULT 0,
			logged_meal_type TEXT DEFAULT '',
			created_at       TEXT DEFAULT (datetime('now'))
		);

		CREATE INDEX IF NOT EXISTS idx_scanned_foods_user ON scanned_foods(user_id);
	`); err != nil {
		return fmt.Errorf("failed to create scanned_foods table: %w", err)
	}

	// ── Water Logs table ──────────────────────────────────────────
	// Track daily water intake — each entry is typically 250ml (one glass).
	if _, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS water_logs (
			id         TEXT PRIMARY KEY,
			user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			log_date   TEXT NOT NULL DEFAULT (date('now')),
			amount_ml  INTEGER NOT NULL DEFAULT 250,
			logged_at  TEXT DEFAULT (datetime('now'))
		);

		CREATE INDEX IF NOT EXISTS idx_water_logs_user_date ON water_logs(user_id, log_date);
	`); err != nil {
		return fmt.Errorf("failed to create water_logs table: %w", err)
	}

	// ── Weight Logs table ─────────────────────────────────────────
	// Daily weight tracking with body fat percentage.
	if _, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS weight_logs (
			id                  TEXT PRIMARY KEY,
			user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			date                TEXT NOT NULL DEFAULT (date('now')),
			weight_kg           REAL NOT NULL,
			body_fat_percentage REAL DEFAULT 0,
			notes               TEXT DEFAULT '',
			created_at          TEXT DEFAULT (datetime('now')),
			UNIQUE(user_id, date)
		);

		CREATE INDEX IF NOT EXISTS idx_weight_logs_user ON weight_logs(user_id);
	`); err != nil {
		return fmt.Errorf("failed to create weight_logs table: %w", err)
	}

	// ── Body Measurements table ───────────────────────────────────
	// Periodic body measurements for tracking physical changes.
	if _, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS body_measurements (
			id          TEXT PRIMARY KEY,
			user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			date        TEXT NOT NULL DEFAULT (date('now')),
			chest_cm    REAL DEFAULT 0,
			waist_cm    REAL DEFAULT 0,
			arms_cm     REAL DEFAULT 0,
			thighs_cm   REAL DEFAULT 0,
			hips_cm     REAL DEFAULT 0,
			created_at  TEXT DEFAULT (datetime('now'))
		);

		CREATE INDEX IF NOT EXISTS idx_body_measurements_user ON body_measurements(user_id);
	`); err != nil {
		return fmt.Errorf("failed to create body_measurements table: %w", err)
	}

	// ── Sleep Logs table ──────────────────────────────────────────
	// Track sleep patterns: bedtime, wake time, quality.
	if _, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS sleep_logs (
			id          TEXT PRIMARY KEY,
			user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			date        TEXT NOT NULL DEFAULT (date('now')),
			bedtime     TEXT NOT NULL,
			wake_time   TEXT NOT NULL,
			duration_hours REAL DEFAULT 0,
			quality     INTEGER DEFAULT 3 CHECK (quality BETWEEN 1 AND 5),
			created_at  TEXT DEFAULT (datetime('now'))
		);

		CREATE INDEX IF NOT EXISTS idx_sleep_logs_user ON sleep_logs(user_id);
	`); err != nil {
		return fmt.Errorf("failed to create sleep_logs table: %w", err)
	}

	// ── Daily Quotes table ────────────────────────────────────────
	// Rotating motivational quotes for the dashboard.
	if _, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS daily_quotes (
			id           TEXT PRIMARY KEY,
			text         TEXT NOT NULL,
			author       TEXT NOT NULL DEFAULT 'Unknown',
			category     TEXT DEFAULT 'motivation',
			day_of_year  INTEGER DEFAULT 0,
			is_active    INTEGER DEFAULT 1,
			created_at   TEXT DEFAULT (datetime('now'))
		);
	`); err != nil {
		return fmt.Errorf("failed to create daily_quotes table: %w", err)
	}

	// ── Health Facts table ────────────────────────────────────────
	// Rotating health and fitness science facts for the dashboard.
	if _, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS health_facts (
			id          TEXT PRIMARY KEY,
			text        TEXT NOT NULL,
			category    TEXT NOT NULL DEFAULT 'nutrition',
			source      TEXT DEFAULT '',
			is_active   INTEGER DEFAULT 1,
			created_at  TEXT DEFAULT (datetime('now'))
		);
	`); err != nil {
		return fmt.Errorf("failed to create health_facts table: %w", err)
	}

	// ── Chat Messages table ───────────────────────────────────────
	// Persisted chat history with the AI Coach.
	if _, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS chat_messages (
			id          TEXT PRIMARY KEY,
			user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
			content     TEXT NOT NULL,
			created_at  TEXT DEFAULT (datetime('now'))
		);

		CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id, created_at);
	`); err != nil {
		return fmt.Errorf("failed to create chat_messages table: %w", err)
	}

	return nil
}

// Close cleanly shuts down the database connection pool.
// Should be called on server shutdown (via defer in main.go).
func Close() {
	if DB != nil {
		DB.Close()
	}
}
