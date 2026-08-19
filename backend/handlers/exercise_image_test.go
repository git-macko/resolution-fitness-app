package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"resolution-fitnessapp-backend/database"
)

// ── Test helpers ──────────────────────────────────────────────────────

// setupExerciseImageTestDB ensures a test database exists with an exercise row.
func setupExerciseImageTestDB(t *testing.T) {
	t.Helper()
	database.Initialize(":memory:")

	// Insert a test exercise
	database.DB.Exec(`
		INSERT INTO exercises (id, name, muscle_group, equipment, description, instructions, tips, common_mistakes, alternatives, image_url, gif_url, is_active, created_at)
		VALUES ('ex-bench-1', 'Bench Press', 'chest', 'Barbell', 'Test exercise', '[]', '[]', '[]', '[]', '', '', 1, datetime('now'))
	`)
}

// ── Tests ─────────────────────────────────────────────────────────────

func TestGenerateExerciseImage_NoGeminiKey(t *testing.T) {
	setupExerciseImageTestDB(t)

	// Save and restore global key
	origKey := geminiKey
	geminiKey = ""
	defer func() { geminiKey = origKey }()

	req := httptest.NewRequest("POST", "/api/exercises/ex-bench-1/generate-image", nil)
	req.SetPathValue("exerciseId", "ex-bench-1")
	w := httptest.NewRecorder()

	GenerateExerciseImage(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected 500 when Gemini key is empty, got %d", w.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	errMsg, _ := resp["error"].(string)
	if !strings.Contains(errMsg, "Gemini API key not configured") {
		t.Errorf("Expected error about missing API key, got: %s", errMsg)
	}
}

func TestGenerateExerciseImage_InvalidExerciseID(t *testing.T) {
	setupExerciseImageTestDB(t)

	req := httptest.NewRequest("POST", "/api/exercises/does-not-exist/generate-image", nil)
	req.SetPathValue("exerciseId", "does-not-exist")
	w := httptest.NewRecorder()

	GenerateExerciseImage(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("Expected 404 for invalid exercise, got %d", w.Code)
	}
}

func TestGenerateExerciseImage_EmptyExerciseID(t *testing.T) {
	setupExerciseImageTestDB(t)

	req := httptest.NewRequest("POST", "/api/exercises//generate-image", nil)
	req.SetPathValue("exerciseId", "")
	w := httptest.NewRecorder()

	GenerateExerciseImage(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for empty exercise ID, got %d", w.Code)
	}
}

func TestGenerateExerciseImage_AlreadyHasAIImage(t *testing.T) {
	setupExerciseImageTestDB(t)

	// Set an existing AI-generated image URL
	database.DB.Exec("UPDATE exercises SET image_url = '/uploads/exercises/ai-generated.png' WHERE id = 'ex-bench-1'")

	req := httptest.NewRequest("POST", "/api/exercises/ex-bench-1/generate-image", nil)
	req.SetPathValue("exerciseId", "ex-bench-1")
	w := httptest.NewRecorder()

	GenerateExerciseImage(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200 when AI image already exists, got %d", w.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	data, _ := resp["data"].(map[string]interface{})
	if data == nil {
		t.Fatal("Expected data in response")
	}
	if _, ok := data["imageUrl"]; !ok {
		t.Error("Expected imageUrl in response data")
	}
}

func TestGenerateAllExerciseImages_NoExercisesNeeded(t *testing.T) {
	setupExerciseImageTestDB(t)

	// All exercises already have AI images
	database.DB.Exec("UPDATE exercises SET image_url = '/uploads/exercises/ai-generated.png' WHERE id = 'ex-bench-1'")

	req := httptest.NewRequest("POST", "/api/exercises/generate-images", nil)
	w := httptest.NewRecorder()

	GenerateAllExerciseImages(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200 when all exercises have images, got %d", w.Code)
	}
}

func TestGenerateAllExerciseImages_WithMuscleGroupFilter(t *testing.T) {
	setupExerciseImageTestDB(t)

	// Insert exercises in different groups
	database.DB.Exec(`INSERT INTO exercises (id, name, muscle_group, equipment, is_active, created_at) VALUES ('ex-squat-1', 'Squat', 'legs', 'Barbell', 1, datetime('now'))`)

	req := httptest.NewRequest("POST", "/api/exercises/generate-images?muscle_group=back", nil)
	w := httptest.NewRecorder()

	// This will try to generate images but fail because Gemini key is empty
	// The important thing is that it starts the async job
	origKey := geminiKey
	geminiKey = ""
	defer func() { geminiKey = origKey }()

	GenerateAllExerciseImages(w, req)

	// Should return 202 Accepted (async job started) or 200 (nothing to do)
	if w.Code != http.StatusAccepted && w.Code != http.StatusOK {
		t.Errorf("Expected 202 or 200, got %d", w.Code)
	}
}

func TestGetExerciseImageStatus_NotFound(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/exercises/generate-images/status?id=nonexistent", nil)
	w := httptest.NewRecorder()

	GetExerciseImageStatus(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("Expected 404 for nonexistent job, got %d", w.Code)
	}
}

func TestGetExerciseImageStatus_MissingID(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/exercises/generate-images/status", nil)
	w := httptest.NewRecorder()

	GetExerciseImageStatus(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for missing job ID, got %d", w.Code)
	}
}

func TestMimeToExt(t *testing.T) {
	tests := []struct {
		mime string
		want string
	}{
		{"image/png", ".png"},
		{"image/jpeg", ".jpg"},
		{"image/jpg", ".jpg"},
		{"image/webp", ".webp"},
		{"", ".png"},
		{"application/octet-stream", ".png"},
	}

	for _, tt := range tests {
		got := mimeToExt(tt.mime)
		if got != tt.want {
			t.Errorf("mimeToExt(%q) = %q, want %q", tt.mime, got, tt.want)
		}
	}
}
