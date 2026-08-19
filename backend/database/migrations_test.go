package database

import (
	"bytes"
	"database/sql"
	"log"
	"os"
	"path/filepath"
	"testing"
)

// TestMigrationsIdempotent guards against the duplicate-column migration noise
// that used to be logged on every startup once a database already had the
// user_settings gym_* columns. Migrations must run cleanly on both a fresh
// database and a pre-existing one, with no log output and no lost columns.
func TestMigrationsIdempotent(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "migrations.db")

	var buf bytes.Buffer
	log.SetOutput(&buf)
	defer log.SetOutput(os.Stderr)

	// First run: fresh database (creates every table and column).
	if err := Initialize(dbPath); err != nil {
		t.Fatalf("Initialize on fresh database failed: %v", err)
	}
	Close()

	// Second run: pre-existing database — the case that used to log
	// "duplicate column name" for the user_settings gym_* columns.
	if err := Initialize(dbPath); err != nil {
		t.Fatalf("Initialize on existing database failed: %v", err)
	}

	// Migrations must not emit any log output (no duplicate-column spam).
	if out := buf.String(); out != "" {
		t.Fatalf("migrations produced unexpected log output:\n%s", out)
	}

	// Spot-check that migrated columns are queryable after both runs.
	for _, col := range []string{"gym_type", "gym_capacity", "gym_opening_hours", "gym_hours_refresh_at"} {
		var v string
		err := DB.QueryRow("SELECT " + col + " FROM user_settings LIMIT 1").Scan(&v)
		if err != nil && err != sql.ErrNoRows {
			t.Errorf("column %q not usable after migrations: %v", col, err)
		}
	}

	Close()
}
