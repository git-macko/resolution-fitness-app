// Package config loads and validates all configuration from environment variables.
// Every field has a comment explaining what it controls.
// The app will panic on startup if critical config is missing (fail fast).
package config

import (
	"errors"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

// Config holds all application configuration values.
// These are loaded from environment variables with sensible defaults.
// placeholderJWTSecret is the development fallback. The server refuses to
// start in production mode while this (or any other weak) secret is in use.
const placeholderJWTSecret = "change-me-in-production-use-a-strong-random-secret"

type Config struct {
	// AppEnv is the runtime environment: "development" (default) or "production".
	// In production the server enforces stricter startup validation (see Validate).
	AppEnv string

	// Port is the TCP port the server listens on (e.g., "8080").
	Port string

	// JWTSecret is the secret key used to sign and validate JWT tokens.
	// In production, this MUST be a strong random string (at least 32 chars).
	JWTSecret string

	// CORSAllowedOrigins is the list of origins permitted to call the API.
	// Empty means "allow all" (development default). When set, only these
	// exact origins receive CORS headers — everything else is blocked.
	// Native mobile apps do not send an Origin header and are never affected.
	CORSAllowedOrigins []string

	// DBPath is the file path to the SQLite database file.
	// Defaults to "./database.db" in the current working directory.
	DBPath string

	// GeminiKey is the API key for Google Gemini (used by AI Coach and Food Scanner).
	// Provides a generous free tier for multimodal food photo analysis.
	// Can be empty — AI endpoints fall back to simulated responses.
	GeminiKey string

	// GeminiModel is the Gemini model name used for AI Coach chat and food photo analysis.
	// The project is locked to gemini-3.5-flash.
	GeminiModel string

	// BestTimeAPIKey is the private API key for BestTime.app, used to fetch
	// real gym crowd/busyness forecasts. Optional — gym crowd endpoints fall
	// back to simulated data if absent.
	BestTimeAPIKey string

	// BestTimeAPIURL is the base URL for the BestTime.app API.
	BestTimeAPIURL string

	// GooglePlacesAPIKey is the API key for Google Places (New) Autocomplete.
	// Optional — when absent, gym autocomplete falls back to Nominatim.
	GooglePlacesAPIKey string

	// OverpassAPIURL is the URL of the Overpass API instance used as a free
	// fallback for gym opening hours when Google Places is unavailable.
	// Defaults to the public Overpass API endpoint.
	OverpassAPIURL string

	// RateLimitPerMinute is the general per-IP request allowance for the
	// whole API. 0 disables rate limiting entirely (development default).
	RateLimitPerMinute int

	// AuthRateLimitPerMinute is the stricter per-IP allowance for public
	// auth endpoints (register/login) to prevent brute-force attacks.
	// 0 falls back to RateLimitPerMinute.
	AuthRateLimitPerMinute int

	// AIRateLimitPerMinute is the per-IP allowance for AI-powered endpoints
	// (chat, plan generation, food scans, exercise images) that call paid
	// upstream APIs, protecting against runaway Gemini usage.
	// 0 falls back to RateLimitPerMinute.
	AIRateLimitPerMinute int
}

// Load reads configuration from environment variables.
// It also loads any variables defined in a .env file in the current directory.
// It applies sensible defaults for any missing values.
// Returns a fully populated Config struct.
func Load() *Config {
	// Load .env file if present; ignore errors if it doesn't exist.
	if err := godotenv.Load(); err != nil {
		log.Printf("No .env file found or failed to load: %v", err)
	}
	// ── Port ──────────────────────────────────────────────────────────
	// Default: 8080 — a common development server port.
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// ── App Environment ─────────────────────────────────────────────
	// Default: development. Set APP_ENV=production on the deploy target.
	appEnv := os.Getenv("APP_ENV")
	if appEnv == "" {
		appEnv = "development"
	}

	// ── JWT Secret ───────────────────────────────────────────────────
	// Default: a development placeholder. Must be changed in production!
	// In production, use: export JWT_SECRET=$(openssl rand -base64 48)
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = placeholderJWTSecret
	}

	// ── CORS Allowed Origins ────────────────────────────────────────
	// Comma-separated list of exact origins allowed to call the API.
	// Empty (default) → allow all origins; useful for local development.
	// Native mobile apps don't send an Origin header, so they always work.
	var corsAllowedOrigins []string
	if raw := os.Getenv("CORS_ALLOWED_ORIGINS"); raw != "" {
		for _, origin := range strings.Split(raw, ",") {
			origin = strings.TrimSpace(origin)
			if origin != "" {
				corsAllowedOrigins = append(corsAllowedOrigins, origin)
			}
		}
	}

	// ── Database Path ────────────────────────────────────────────────
	// Default: the database.db file next to the running executable when
	// one exists (covers launching the built binary from any directory),
	// otherwise "./database.db" in the current working directory.
	// This keeps `cd backend && go run .` working while making a wrong-cwd
	// launch open the real backend database instead of silently creating
	// a fresh one next to the binary.
	dbPath := resolveDBPath(os.Getenv("DB_PATH"), "")

	// ── Gemini API Key ──────────────────────────────────────────────
	// Optional at the server level. Provides a generous free tier for
	// AI Coach chat and food photo analysis via Google Gemini.
	geminiKey := os.Getenv("GEMINI_API_KEY")

	// ── Gemini Model ─────────────────────────────────────────────────
	// Optional model override. Defaults to gemini-3.5-flash.
	geminiModel := os.Getenv("GEMINI_MODEL")
	if geminiModel == "" {
		geminiModel = "gemini-3.5-flash"
	}

	// ── BestTime API Key ───────────────────────────────────────────
	// Optional at the server level. Provides real gym crowd/busyness data.
	// When absent, the gym crowd endpoints fall back to simulated data.
	bestTimeAPIKey := os.Getenv("BESTTIME_API_KEY")

	// ── BestTime API URL ───────────────────────────────────────────
	// Optional base URL override. Defaults to the BestTime.app API.
	bestTimeAPIURL := os.Getenv("BESTTIME_API_URL")
	if bestTimeAPIURL == "" {
		bestTimeAPIURL = "https://besttime.app/api/v1"
	}

	// ── Google Places API Key ─────────────────────────────────────
	// Optional key for Google Places (New) Autocomplete. When provided,
	// gym autocomplete uses Google Places for more accurate results.
	googlePlacesAPIKey := os.Getenv("GOOGLE_PLACES_API_KEY")

	// ── Overpass API URL ──────────────────────────────────────────
	// Free fallback for gym opening hours when Google Places is unavailable.
	overpassAPIURL := os.Getenv("OVERPASS_API_URL")
	if overpassAPIURL == "" {
		overpassAPIURL = "https://overpass-api.de/api/interpreter"
	}

	// ── Rate limits (per client IP, per minute) ───────────────────
	// All default to 0 = disabled, so local development is unaffected.
	// Set them on the deploy target to protect against abuse:
	//   RATE_LIMIT_PER_MINUTE=120        (whole API)
	//   AUTH_RATE_LIMIT_PER_MINUTE=10    (register/login)
	//   AI_RATE_LIMIT_PER_MINUTE=20      (Gemini-backed endpoints)
	rateLimitPerMinute := envInt("RATE_LIMIT_PER_MINUTE", 0)
	authRateLimitPerMinute := envInt("AUTH_RATE_LIMIT_PER_MINUTE", 0)
	aiRateLimitPerMinute := envInt("AI_RATE_LIMIT_PER_MINUTE", 0)

	cfg := &Config{
		AppEnv:             appEnv,
		Port:               port,
		JWTSecret:          jwtSecret,
		DBPath:             dbPath,
		GeminiKey:          geminiKey,
		GeminiModel:        geminiModel,
		BestTimeAPIKey:     bestTimeAPIKey,
		BestTimeAPIURL:     bestTimeAPIURL,
		GooglePlacesAPIKey:     googlePlacesAPIKey,
		OverpassAPIURL:         overpassAPIURL,
		CORSAllowedOrigins:     corsAllowedOrigins,
		RateLimitPerMinute:     rateLimitPerMinute,
		AuthRateLimitPerMinute: authRateLimitPerMinute,
		AIRateLimitPerMinute:   aiRateLimitPerMinute,
	}
	if err := cfg.validate(); err != nil {
		log.Fatalf("FATAL: %v", err)
	}
	return cfg
}

// validate enforces production-safe startup configuration.
// It fails fast on conditions that would be a security risk
// or a silent misconfiguration in production.
func (c *Config) validate() error {
	if c.AppEnv != "production" {
		// Development: a placeholder secret is acceptable, but warn loudly
		// so the developer knows tokens are forgeable.
		if c.JWTSecret == placeholderJWTSecret || len(c.JWTSecret) < 32 {
			log.Printf("⚠️  WARNING: JWT_SECRET is weak or the placeholder (%q). "+
				"This is fine for development but MUST be a strong random string (>= 32 chars) "+
				"before deploying. Generate one with: openssl rand -base64 48",
				redactSecret(c.JWTSecret))
		}
		return nil
	}

	// ── Production checks (fail fast) ─────────────────────────────
	if c.JWTSecret == "" || c.JWTSecret == placeholderJWTSecret || len(c.JWTSecret) < 32 {
		return errors.New("JWT_SECRET must be a strong random string of at least 32 characters " +
			"in production (APP_ENV=production). Generate one with: openssl rand -base64 48")
	}
	return nil
}

// envInt reads an integer environment variable, returning fallback when
// the variable is empty or not a valid number.
func envInt(key string, fallback int) int {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || n < 0 {
		return fallback
	}
	return n
}

// redactSecret shortens a secret for safe logging (never logs the full value).
func redactSecret(s string) string {
	if len(s) <= 4 {
		return "****"
	}
	return s[:2] + "..." + s[len(s)-2:]
}

// resolveDBPath picks the database file to open.
//   - envPath is the explicit DB_PATH override (empty when unset).
//   - exePath is the path to the running executable; when empty it is
//     discovered automatically. It is a parameter purely for testing.
//
// Resolution order:
//   1. envPath (if set)
//   2. database.db next to the executable (if that file exists)
//   3. ./database.db in the current working directory
// The result is returned as an absolute path so startup logs are unambiguous.
func resolveDBPath(envPath, exePath string) string {
	dbPath := envPath
	if dbPath == "" {
		dbPath = "./database.db"
		if exePath == "" {
			if p, err := os.Executable(); err == nil {
				exePath = p
			}
		}
		if exePath != "" {
			if exeDir, err := filepath.Abs(filepath.Dir(exePath)); err == nil {
				candidate := filepath.Join(exeDir, "database.db")
				if _, statErr := os.Stat(candidate); statErr == nil {
					dbPath = candidate
				}
			}
		}
	}
	if absPath, err := filepath.Abs(dbPath); err == nil {
		dbPath = absPath
	}
	return dbPath
}
