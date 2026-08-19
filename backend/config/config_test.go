// Package config — tests for database path resolution.
package config

import (
	"os"
	"path/filepath"
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
