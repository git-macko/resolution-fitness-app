// Package config loads and validates all configuration from environment variables.
// Every field has a comment explaining what it controls.
// The app will panic on startup if critical config is missing (fail fast).
package config

import (
	"os"
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

	// OpenAIKey is the API key for OpenAI (used by AI Coach and Food Scanner).
	// Can be empty — the user can provide their own key stored in user_settings.
	OpenAIKey string
}

// Load reads configuration from environment variables.
// It applies sensible defaults for any missing values.
// Returns a fully populated Config struct.
func Load() *Config {
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
	// Default: "./database.db" — a file in the backend directory.
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./database.db"
	}

	// ── OpenAI API Key ───────────────────────────────────────────────
	// Optional at the server level. Users can provide their own key
	// stored in user_settings, which takes precedence over this global key.
	openAIKey := os.Getenv("OPENAI_API_KEY")

	return &Config{
		Port:      port,
		JWTSecret: jwtSecret,
		DBPath:    dbPath,
		OpenAIKey: openAIKey,
	}
}
