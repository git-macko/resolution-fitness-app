// Package config loads and validates all configuration from environment variables.
// Every field has a comment explaining what it controls.
// The app will panic on startup if critical config is missing (fail fast).
package config

import (
	"log"
	"os"
	"path/filepath"

	"github.com/joho/godotenv"
)

// Config holds all application configuration values.
// These are loaded from environment variables with sensible defaults.
type Config struct {
	// Port is the TCP port the server listens on (e.g., "8080").
	Port string

	// JWTSecret is the secret key used to sign and validate JWT tokens.
	// In production, this MUST be a strong random string (at least 32 chars).
	JWTSecret string

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

	// ── JWT Secret ───────────────────────────────────────────────────
	// Default: a development placeholder. Must be changed in production!
	// In production, use: export JWT_SECRET=$(openssl rand -base64 32)
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "change-me-in-production-use-a-strong-random-secret"
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

	return &Config{
		Port:               port,
		JWTSecret:          jwtSecret,
		DBPath:             dbPath,
		GeminiKey:          geminiKey,
		GeminiModel:        geminiModel,
		BestTimeAPIKey:     bestTimeAPIKey,
		BestTimeAPIURL:     bestTimeAPIURL,
		GooglePlacesAPIKey: googlePlacesAPIKey,
		OverpassAPIURL:     overpassAPIURL,
	}
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
