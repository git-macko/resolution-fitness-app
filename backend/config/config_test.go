// Package config — tests for database path resolution and startup validation.
package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestResolveDBPath verifies the DB path defaults never silently create a
// fresh database when the binary is launched from the wrong directory.
func TestResolveDBPath(t *testing.T) {
	dir := t.TempDir()

	// 1. Explicit DB_PATH always wins.
	explicit := filepath.Join(dir, "custom.db")
	got := resolveDBPath(explicit, filepath.Join(dir, "server.exe"))
	if got != explicit {
		t.Errorf("env override should be returned unchanged, got %q", got)
	}

	// 2. No env var + database.db next to the executable → use it.
	exeDir := filepath.Join(dir, "backend")
	if err := os.MkdirAll(exeDir, 0o755); err != nil {
		t.Fatal(err)
	}
	dbFile := filepath.Join(exeDir, "database.db")
	if err := os.WriteFile(dbFile, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	got = resolveDBPath("", filepath.Join(exeDir, "server.exe"))
	if got != dbFile {
		t.Errorf("expected executable-adjacent database.db, got %q", got)
	}

	// 3. No env var, no database.db next to the executable → cwd default.
	emptyDir := filepath.Join(dir, "nowhere")
	if err := os.MkdirAll(emptyDir, 0o755); err != nil {
		t.Fatal(err)
	}
	got = resolveDBPath("", filepath.Join(emptyDir, "server.exe"))
	if !filepath.IsAbs(got) || filepath.Base(got) != "database.db" {
		t.Errorf("expected absolute ./database.db fallback, got %q", got)
	}

	// 4. Env var set even when executable-adjacent db exists → env wins.
	got = resolveDBPath(explicit, filepath.Join(exeDir, "server.exe"))
	if got != explicit {
		t.Errorf("env override should beat executable-adjacent db, got %q", got)
	}
}

// ── Production-safe JWT secret validation ────────────────────────────

// TestValidateProductionRequiresStrongSecret verifies the server refuses
// to start in production mode with a missing, placeholder, or short secret.
func TestValidateProductionRequiresStrongSecret(t *testing.T) {
	cases := []struct {
		name   string
		secret string
	}{
		{"missing secret", ""},
		{"placeholder secret", placeholderJWTSecret},
		{"too-short secret", "short-secret"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfg := &Config{AppEnv: "production", JWTSecret: tc.secret}
			if err := cfg.validate(); err == nil {
				t.Fatalf("expected error for production JWT_SECRET %q, got nil", tc.secret)
			} else if !strings.Contains(err.Error(), "JWT_SECRET") {
				t.Errorf("error should mention JWT_SECRET, got: %v", err)
			}
		})
	}
}

// TestValidateProductionAcceptsStrongSecret verifies a strong secret
// (>= 32 chars) passes production validation.
func TestValidateProductionAcceptsStrongSecret(t *testing.T) {
	strong := "this-is-a-very-strong-random-secret-0123456789abcdef"
	if err := (&Config{AppEnv: "production", JWTSecret: strong}).validate(); err != nil {
		t.Fatalf("strong secret should pass production validation, got: %v", err)
	}
}

// TestValidateDevelopmentToleratesWeakSecret verifies development mode
// never blocks startup, even with a placeholder secret.
func TestValidateDevelopmentToleratesWeakSecret(t *testing.T) {
	for _, secret := range []string{"", placeholderJWTSecret, "short"} {
		if err := (&Config{AppEnv: "development", JWTSecret: secret}).validate(); err != nil {
			t.Errorf("development mode should tolerate secret %q, got error: %v", secret, err)
		}
	}
}

// ── Rate limit config parsing ───────────────────────────────────────

// TestEnvInt verifies envInt parses numbers and falls back on bad input.
func TestEnvInt(t *testing.T) {
	cases := []struct {
		name     string
		value    string
		fallback int
		want     int
	}{
		{"unset → fallback", "", 120, 120},
		{"valid number", "60", 120, 60},
		{"zero is allowed", "0", 120, 0},
		{"negative → fallback", "-5", 120, 120},
		{"non-numeric → fallback", "abc", 120, 120},
		{"whitespace tolerated", " 30 ", 120, 30},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			os.Setenv("TEST_ENV_INT", tc.value)
			defer os.Unsetenv("TEST_ENV_INT")
			if got := envInt("TEST_ENV_INT", tc.fallback); got != tc.want {
				t.Errorf("envInt(%q, %d) = %d, want %d", tc.value, tc.fallback, got, tc.want)
			}
		})
	}
}
