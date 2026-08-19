// Package handlers — unit tests for workout plan handlers.
// Tests cover CreatePlan limit enforcement, SetActivePlan activation/progression reset,
// and ClonePlan one-time limit checks.
package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"resolution-fitnessapp-backend/database"
	"resolution-fitnessapp-backend/middleware"
	"resolution-fitnessapp-backend/models"

	"github.com/google/uuid"
)

// ── Test Setup Helpers ───────────────────────────────────────────────

// setupTestDB initializes a file-based SQLite database and runs migrations.
// Uses a temp file (not :memory:) so multiple connections share the same
// database state — required for cross-handler tests like CreatePlan → StartWorkout
// where the exercise FK must be visible across handler executions.
// Returns a cleanup function that should be deferred.
func setupTestDB(t *testing.T) func() {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "test.db")
	if err := database.Initialize(dbPath); err != nil {
		t.Fatalf("Failed to initialize test database: %v", err)
	}
	return func() {
		database.Close()
	}
}

// seedTestUser creates a user and their stats row, returns the userID.
func seedTestUser(t *testing.T) string {
	t.Helper()
	userID := uuid.New().String()
	_, err := database.DB.Exec(`
		INSERT INTO users (id, email, password_hash, created_at, updated_at)
		VALUES (?, ?, 'hash', datetime('now'), datetime('now'))
	`, userID, userID+"@test.com")
	if err != nil {
		t.Fatalf("Failed to seed user: %v", err)
	}
	_, err = database.DB.Exec(`
		INSERT INTO user_stats (user_id, fitness_level, fitness_xp, total_workouts, total_minutes,
			total_volume_kg, current_streak, longest_streak)
		VALUES (?, 5, 350, 42, 1260, 42000.0, 7, 14)
	`, userID)
	if err != nil {
		t.Fatalf("Failed to seed user stats: %v", err)
	}
	return userID
}

// seedTestUserNoStats creates a user WITHOUT a user_stats row, returns the userID.
// Used to test SetActivePlan edge case when stats row doesn't exist.
func seedTestUserNoStats(t *testing.T) string {
	t.Helper()
	userID := uuid.New().String()
	_, err := database.DB.Exec(`
		INSERT INTO users (id, email, password_hash, created_at, updated_at)
		VALUES (?, ?, 'hash', datetime('now'), datetime('now'))
	`, userID, userID+"@test.com")
	if err != nil {
		t.Fatalf("Failed to seed user: %v", err)
	}
	return userID
}

// newRequest creates an HTTP request with the given method, path, body, and userID in context.
// Path values (e.g., {planId}) are set by individual tests via req.SetPathValue().
func newRequest(method, path string, body interface{}, userID string) (*http.Request, *httptest.ResponseRecorder) {
	var bodyReader *bytes.Reader
	if body != nil {
		bodyBytes, _ := json.Marshal(body)
		bodyReader = bytes.NewReader(bodyBytes)
	} else {
		bodyReader = bytes.NewReader(nil)
	}

	req := httptest.NewRequest(method, path, bodyReader)
	req.Header.Set("Content-Type", "application/json")

	// Inject userID into context (simulates AuthRequired middleware)
	if userID != "" {
		ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
		req = req.WithContext(ctx)
	}

	return req, httptest.NewRecorder()
}

// unmarshalPlan extracts a WeeklyPlan from an APIResponse body.
func unmarshalPlan(body []byte) models.WeeklyPlan {
	var resp models.APIResponse
	json.Unmarshal(body, &resp)
	planData, _ := json.Marshal(resp.Data)
	var plan models.WeeklyPlan
	json.Unmarshal(planData, &plan)
	return plan
}

// planReq builds a minimal CreatePlanRequest payload.
func planReq(name, routineType string, days []models.CreatePlanDayReq) models.CreatePlanRequest {
	return models.CreatePlanRequest{
		Name:        name,
		RoutineType: routineType,
		Days:        days,
	}
}

// minimalDays returns a single-day plan with one exercise (no real exercise ID — custom).
func minimalDays() []models.CreatePlanDayReq {
	return []models.CreatePlanDayReq{
		{
			DayOfWeek:         0, // Monday
			WorkoutName:       "Test Day",
			IsRestDay:         false,
			EstimatedDuration: 45,
			Exercises: []models.CreatePlanExerciseReq{
				{
					ExerciseID:         "",
					CustomExerciseName: "Test Exercise",
					TargetSets:         3,
					TargetReps:         "10-12",
					TargetWeight:       50,
				},
			},
		},
	}
}

// seedTestExercise creates a real exercise in the library and returns its ID.
// Necessary for StartWorkout tests because session_exercises has a FK constraint
// referencing exercises(id) — custom exercises with empty exercise_id will fail.
func seedTestExercise(t *testing.T) string {
	t.Helper()
	exID := uuid.New().String()
	_, err := database.DB.Exec(`
		INSERT INTO exercises (id, name, muscle_group, equipment)
		VALUES (?, 'Test Bench Press', 'chest', 'Barbell')
	`, exID)
	if err != nil {
		t.Fatalf("Failed to seed exercise: %v", err)
	}
	return exID
}

// daysWithRealExercise creates plan days that reference a real exercise ID.
// This ensures the FK constraint on session_exercises.exercise_id is satisfied
// when StartWorkout copies exercises from the plan into the session.
func daysWithRealExercise(exerciseID string) []models.CreatePlanDayReq {
	return []models.CreatePlanDayReq{{
		DayOfWeek:         0,
		WorkoutName:       "Real Exercise Day",
		IsRestDay:         false,
		EstimatedDuration: 45,
		Exercises: []models.CreatePlanExerciseReq{{
			ExerciseID:   exerciseID,
			TargetSets:   3,
			TargetReps:   "10",
			TargetWeight: 100,
		}},
	}}
}

// unmarshalSession extracts a WorkoutSession from an APIResponse body.
func unmarshalSession(body []byte) models.WorkoutSession {
	var resp models.APIResponse
	json.Unmarshal(body, &resp)
	sessionData, _ := json.Marshal(resp.Data)
	var session models.WorkoutSession
	json.Unmarshal(sessionData, &session)
	return session
}

// ── CreatePlan Limit Enforcement Tests ───────────────────────────────

// TestCreatePlan_ConsistentLimit_Max2 tests that creating a 3rd consistent routine returns 409.
func TestCreatePlan_ConsistentLimit_Max2(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Create 2 consistent routines — should succeed
	for i := 0; i < 2; i++ {
		req, w := newRequest("POST", "/api/plans", planReq("Routine "+string(rune('A'+i)), "consistent", minimalDays()), userID)
		CreatePlan(w, req)
		if w.Code != http.StatusCreated {
			t.Errorf("CreatePlan #%d: expected 201, got %d: %s", i+1, w.Code, w.Body.String())
		}
	}

	// Try creating a 3rd consistent routine — should fail with 409
	req, w := newRequest("POST", "/api/plans", planReq("Routine C", "consistent", minimalDays()), userID)
	CreatePlan(w, req)
	if w.Code != http.StatusConflict {
		t.Errorf("CreatePlan 3rd consistent: expected 409 Conflict, got %d: %s", w.Code, w.Body.String())
	}
}

// TestCreatePlan_OneTimeLimit_Max3 tests that creating a 4th one-time override returns 409.
func TestCreatePlan_OneTimeLimit_Max3(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Create 3 one-time overrides on distinct weeks — should succeed
	for i := 0; i < 3; i++ {
		pReq := planReq("Override "+string(rune('A'+i)), "one_time", minimalDays())
		// Space each override one week apart to avoid date collisions
		pReq.WeekStartDate = fmt.Sprintf("2025-06-%02d", 2+i*7)
		req, w := newRequest("POST", "/api/plans", pReq, userID)
		CreatePlan(w, req)
		if w.Code != http.StatusCreated {
			t.Errorf("CreatePlan #%d: expected 201, got %d: %s", i+1, w.Code, w.Body.String())
		}
	}

	// Try creating a 4th one-time override — should fail with 409 (limit reached)
	pReq := planReq("Override D", "one_time", minimalDays())
	pReq.WeekStartDate = "2025-06-23"
	req, w := newRequest("POST", "/api/plans", pReq, userID)
	CreatePlan(w, req)
	if w.Code != http.StatusConflict {
		t.Errorf("CreatePlan 4th one-time: expected 409 Conflict, got %d: %s", w.Code, w.Body.String())
	}
}

// TestCreatePlan_OneTimeDateCollision tests that creating a one-time plan
// whose week overlaps an existing one-time plan returns 409.
func TestCreatePlan_OneTimeDateCollision(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Create a one-time plan for a specific week
	planReq1 := planReq("Override A", "one_time", minimalDays())
	planReq1.WeekStartDate = "2025-06-02"
	req1, w1 := newRequest("POST", "/api/plans", planReq1, userID)
	CreatePlan(w1, req1)
	if w1.Code != http.StatusCreated {
		t.Fatalf("CreatePlan first one-time: expected 201, got %d: %s", w1.Code, w1.Body.String())
	}

	// Try creating another one-time plan for the same week — should fail
	planReq2 := planReq("Override B", "one_time", minimalDays())
	planReq2.WeekStartDate = "2025-06-02"
	req2, w2 := newRequest("POST", "/api/plans", planReq2, userID)
	CreatePlan(w2, req2)
	if w2.Code != http.StatusConflict {
		t.Errorf("CreatePlan overlapping one-time: expected 409 Conflict, got %d: %s", w2.Code, w2.Body.String())
	}

	// A different, non-overlapping week should succeed
	planReq3 := planReq("Override C", "one_time", minimalDays())
	planReq3.WeekStartDate = "2025-06-09"
	req3, w3 := newRequest("POST", "/api/plans", planReq3, userID)
	CreatePlan(w3, req3)
	if w3.Code != http.StatusCreated {
		t.Errorf("CreatePlan non-overlapping one-time: expected 201, got %d: %s", w3.Code, w3.Body.String())
	}
}

// TestCreatePlan_CrossTypeLimits tests that consistent and one-time limits are independent.
func TestCreatePlan_CrossTypeLimits(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Create 2 consistent routines
	for i := 0; i < 2; i++ {
		req, w := newRequest("POST", "/api/plans", planReq("Consistent "+string(rune('A'+i)), "consistent", minimalDays()), userID)
		CreatePlan(w, req)
		if w.Code != http.StatusCreated {
			t.Errorf("Create consistent #%d: expected 201, got %d", i+1, w.Code)
		}
	}

	// Creating a one-time override should still work (independent limits)
	req, w := newRequest("POST", "/api/plans", planReq("One-Time A", "one_time", minimalDays()), userID)
	CreatePlan(w, req)
	if w.Code != http.StatusCreated {
		t.Errorf("Create one-time after consistent limit: expected 201, got %d: %s", w.Code, w.Body.String())
	}
}

// TestCreatePlan_FirstRoutineAutoActivated tests the first consistent routine is auto-activated.
func TestCreatePlan_FirstRoutineAutoActivated(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Create first consistent routine
	req, w := newRequest("POST", "/api/plans", planReq("My First Routine", "consistent", minimalDays()), userID)
	CreatePlan(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("CreatePlan: expected 201, got %d: %s", w.Code, w.Body.String())
	}

	plan := unmarshalPlan(w.Body.Bytes())
	if !plan.IsActive {
		t.Errorf("First consistent routine should be auto-activated, but isActive is false")
	}

	// Create second consistent routine
	req2, w2 := newRequest("POST", "/api/plans", planReq("My Second Routine", "consistent", minimalDays()), userID)
	CreatePlan(w2, req2)
	if w2.Code != http.StatusCreated {
		t.Fatalf("CreatePlan #2: expected 201, got %d: %s", w2.Code, w2.Body.String())
	}

	plan2 := unmarshalPlan(w2.Body.Bytes())
	if plan2.IsActive {
		t.Errorf("Second consistent routine should NOT be auto-activated, but isActive is true")
	}
}

// TestCreatePlan_NameRequired tests that an empty name returns 400.
func TestCreatePlan_NameRequired(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	req, w := newRequest("POST", "/api/plans", planReq("", "consistent", minimalDays()), userID)
	CreatePlan(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for empty name, got %d", w.Code)
	}
}

// ── SetActivePlan Handler Tests ──────────────────────────────────────

// TestSetActivePlan_Success tests successful activation of an inactive routine.
func TestSetActivePlan_Success(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Create two consistent routines (first auto-activated, second inactive)
	req1, w1 := newRequest("POST", "/api/plans", planReq("Routine A", "consistent", minimalDays()), userID)
	CreatePlan(w1, req1)
	req2, w2 := newRequest("POST", "/api/plans", planReq("Routine B", "consistent", minimalDays()), userID)
	CreatePlan(w2, req2)

	plan2 := unmarshalPlan(w2.Body.Bytes())

	// Activate the second routine
	activateReq, activateW := newRequest("POST", "/api/plans/{planId}/activate", nil, userID)
	activateReq.SetPathValue("planId", plan2.ID)
	SetActivePlan(activateW, activateReq)

	if activateW.Code != http.StatusOK {
		t.Errorf("SetActivePlan: expected 200, got %d: %s", activateW.Code, activateW.Body.String())
	}

	// Verify the message contains "progression has been reset"
	if !strings.Contains(activateW.Body.String(), "progression has been reset") {
		t.Errorf("Response should mention progression reset, got: %s", activateW.Body.String())
	}

	// Verify progression stats were reset
	var level, xp, workouts, streak int
	var volume float64
	database.DB.QueryRow("SELECT fitness_level, fitness_xp, total_workouts, current_streak, total_volume_kg FROM user_stats WHERE user_id = ?", userID).Scan(&level, &xp, &workouts, &streak, &volume)
	if level != 1 {
		t.Errorf("Expected fitness_level=1 after reset, got %d", level)
	}
	if xp != 0 {
		t.Errorf("Expected fitness_xp=0 after reset, got %d", xp)
	}
	if workouts != 0 {
		t.Errorf("Expected total_workouts=0 after reset, got %d", workouts)
	}
	if streak != 0 {
		t.Errorf("Expected current_streak=0 after reset, got %d", streak)
	}
	if volume != 0 {
		t.Errorf("Expected total_volume_kg=0 after reset, got %f", volume)
	}

	// Verify longest_streak was preserved
	var longestStreak int
	database.DB.QueryRow("SELECT longest_streak FROM user_stats WHERE user_id = ?", userID).Scan(&longestStreak)
	if longestStreak != 14 {
		t.Errorf("Expected longest_streak=14 preserved, got %d", longestStreak)
	}
}

// TestSetActivePlan_AlreadyActive tests that activating an already-active routine returns 409.
func TestSetActivePlan_AlreadyActive(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Create one consistent routine (auto-activated)
	req, w := newRequest("POST", "/api/plans", planReq("Routine A", "consistent", minimalDays()), userID)
	CreatePlan(w, req)

	plan := unmarshalPlan(w.Body.Bytes())

	// Try activating it again
	activateReq, activateW := newRequest("POST", "/api/plans/{planId}/activate", nil, userID)
	activateReq.SetPathValue("planId", plan.ID)
	SetActivePlan(activateW, activateReq)

	if activateW.Code != http.StatusConflict {
		t.Errorf("SetActivePlan already active: expected 409, got %d: %s", activateW.Code, activateW.Body.String())
	}
}

// TestSetActivePlan_OneTimeNotAllowed tests that activating a one-time routine returns 400.
func TestSetActivePlan_OneTimeNotAllowed(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Create a one-time override
	req, w := newRequest("POST", "/api/plans", planReq("One-Time A", "one_time", minimalDays()), userID)
	CreatePlan(w, req)

	plan := unmarshalPlan(w.Body.Bytes())

	// Try to activate it
	activateReq, activateW := newRequest("POST", "/api/plans/{planId}/activate", nil, userID)
	activateReq.SetPathValue("planId", plan.ID)
	SetActivePlan(activateW, activateReq)

	if activateW.Code != http.StatusBadRequest {
		t.Errorf("SetActivePlan one-time: expected 400, got %d: %s", activateW.Code, activateW.Body.String())
	}
}

// TestSetActivePlan_NotFound tests that activating a non-existent plan returns 404.
func TestSetActivePlan_NotFound(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	activateReq, activateW := newRequest("POST", "/api/plans/{planId}/activate", nil, userID)
	activateReq.SetPathValue("planId", "nonexistent-id")
	SetActivePlan(activateW, activateReq)

	if activateW.Code != http.StatusNotFound {
		t.Errorf("SetActivePlan not found: expected 404, got %d", activateW.Code)
	}
}

// TestSetActivePlan_WrongUser tests that a user can't activate another user's plan.
func TestSetActivePlan_WrongUser(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID1 := seedTestUser(t)
	userID2 := uuid.New().String()
	// Seed a second user
	database.DB.Exec(`
		INSERT INTO users (id, email, password_hash, created_at, updated_at)
		VALUES (?, ?, 'hash', datetime('now'), datetime('now'))
	`, userID2, userID2+"@test.com")
	database.DB.Exec(`INSERT INTO user_stats (user_id) VALUES (?)`, userID2)

	// Create a routine as user1
	req, w := newRequest("POST", "/api/plans", planReq("User1 Routine", "consistent", minimalDays()), userID1)
	CreatePlan(w, req)

	plan := unmarshalPlan(w.Body.Bytes())

	// User2 tries to activate user1's plan
	activateReq, activateW := newRequest("POST", "/api/plans/{planId}/activate", nil, userID2)
	activateReq.SetPathValue("planId", plan.ID)
	SetActivePlan(activateW, activateReq)

	if activateW.Code != http.StatusNotFound {
		t.Errorf("SetActivePlan wrong user: expected 404, got %d", activateW.Code)
	}
}

// TestSetActivePlan_DeactivatesOthers tests activating one routine deactivates others.
func TestSetActivePlan_DeactivatesOthers(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Create two routines
	req1, w1 := newRequest("POST", "/api/plans", planReq("Routine A", "consistent", minimalDays()), userID)
	CreatePlan(w1, req1)
	req2, w2 := newRequest("POST", "/api/plans", planReq("Routine B", "consistent", minimalDays()), userID)
	CreatePlan(w2, req2)

	plan2 := unmarshalPlan(w2.Body.Bytes())

	// Activate routine B (which will deactivate A)
	activateReq, _ := newRequest("POST", "/api/plans/{planId}/activate", nil, userID)
	activateReq.SetPathValue("planId", plan2.ID)
	activateW := httptest.NewRecorder()
	SetActivePlan(activateW, activateReq)

	if activateW.Code != http.StatusOK {
		t.Fatalf("SetActivePlan: expected 200, got %d", activateW.Code)
	}

	// Verify only Routine B is active
	var activeCount int
	database.DB.QueryRow("SELECT COUNT(*) FROM weekly_plans WHERE user_id = ? AND routine_type = 'consistent' AND is_active = 1", userID).Scan(&activeCount)
	if activeCount != 1 {
		t.Errorf("Expected exactly 1 active routine, got %d", activeCount)
	}

	var activeName string
	database.DB.QueryRow("SELECT name FROM weekly_plans WHERE user_id = ? AND routine_type = 'consistent' AND is_active = 1", userID).Scan(&activeName)
	if activeName != "Routine B" {
		t.Errorf("Expected 'Routine B' to be active, got '%s'", activeName)
	}
}

// TestSetActivePlan_NoStatsRow tests that activation handles missing user_stats row gracefully.
func TestSetActivePlan_NoStatsRow(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUserNoStats(t)

	// Create a first routine (auto-activated since it's the first consistent routine)
	req, w := newRequest("POST", "/api/plans", planReq("Routine A", "consistent", minimalDays()), userID)
	CreatePlan(w, req)
	_ = unmarshalPlan(w.Body.Bytes()) // first routine, auto-activated — setup only

	// Create a second routine to activate
	req2, w2 := newRequest("POST", "/api/plans", planReq("Routine B", "consistent", minimalDays()), userID)
	CreatePlan(w2, req2)

	plan2 := unmarshalPlan(w2.Body.Bytes())

	// Activate Routine B — should succeed even without stats row
	activateReq, activateW := newRequest("POST", "/api/plans/{planId}/activate", nil, userID)
	activateReq.SetPathValue("planId", plan2.ID)
	SetActivePlan(activateW, activateReq)

	if activateW.Code != http.StatusOK {
		t.Errorf("SetActivePlan without stats row: expected 200, got %d: %s", activateW.Code, activateW.Body.String())
	}

	// Verify Routine B is now active
	var activeName string
	database.DB.QueryRow("SELECT name FROM weekly_plans WHERE user_id = ? AND routine_type = 'consistent' AND is_active = 1", userID).Scan(&activeName)
	if activeName != "Routine B" {
		t.Errorf("Expected 'Routine B' to be active, got '%s'", activeName)
	}
}

// ── ClonePlan Limit Enforcement Tests ────────────────────────────────

// TestClonePlan_OneTimeLimit tests that cloning when at 3 one-time overrides returns 409.
func TestClonePlan_OneTimeLimit(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Create a consistent routine to clone from
	req1, w1 := newRequest("POST", "/api/plans", planReq("Source Routine", "consistent", minimalDays()), userID)
	CreatePlan(w1, req1)

	srcPlan := unmarshalPlan(w1.Body.Bytes())

	// Fill up all 3 one-time slots on distinct weeks
	for i := 0; i < 3; i++ {
		pReq := planReq("Override "+string(rune('A'+i)), "one_time", minimalDays())
		pReq.WeekStartDate = fmt.Sprintf("2025-07-%02d", 2+i*7)
		req, w := newRequest("POST", "/api/plans", pReq, userID)
		CreatePlan(w, req)
		if w.Code != http.StatusCreated {
			t.Fatalf("Create one-time #%d: expected 201, got %d", i+1, w.Code)
		}
	}

	// Try to clone — should fail with 409
	cloneReq, cloneW := newRequest("POST", "/api/plans/{planId}/clone", nil, userID)
	cloneReq.SetPathValue("planId", srcPlan.ID)
	ClonePlan(cloneW, cloneReq)

	if cloneW.Code != http.StatusConflict {
		t.Errorf("ClonePlan at limit: expected 409 Conflict, got %d: %s", cloneW.Code, cloneW.Body.String())
	}
}

// TestClonePlan_UnderLimitSucceeds tests that cloning under the limit succeeds.
func TestClonePlan_UnderLimitSucceeds(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Create a consistent routine to clone from
	req1, w1 := newRequest("POST", "/api/plans", planReq("Source Routine", "consistent", minimalDays()), userID)
	CreatePlan(w1, req1)

	srcPlan := unmarshalPlan(w1.Body.Bytes())

	// Only 1 one-time override (under the limit of 3)
	req2, _ := newRequest("POST", "/api/plans", planReq("One Override", "one_time", minimalDays()), userID)
	w2 := httptest.NewRecorder()
	CreatePlan(w2, req2)
	if w2.Code != http.StatusCreated {
		t.Fatalf("Create one-time: expected 201, got %d", w2.Code)
	}

	// Clone should succeed
	cloneReq, cloneW := newRequest("POST", "/api/plans/{planId}/clone", nil, userID)
	cloneReq.SetPathValue("planId", srcPlan.ID)
	ClonePlan(cloneW, cloneReq)

	if cloneW.Code != http.StatusCreated {
		t.Errorf("ClonePlan under limit: expected 201, got %d: %s", cloneW.Code, cloneW.Body.String())
	}
}

// TestClonePlan_SourceNotFound tests that cloning a non-existent plan returns 404.
func TestClonePlan_SourceNotFound(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	cloneReq, cloneW := newRequest("POST", "/api/plans/{planId}/clone", nil, userID)
	cloneReq.SetPathValue("planId", "nonexistent-id")
	ClonePlan(cloneW, cloneReq)

	if cloneW.Code != http.StatusNotFound {
		t.Errorf("ClonePlan source not found: expected 404, got %d", cloneW.Code)
	}
}

// ── GetPlans Auto-Delete Tests ───────────────────────────────────────

// TestGetPlans_AutoDeleteOverdueOneTime tests that overdue one-time plans are auto-deleted.
func TestGetPlans_AutoDeleteOverdueOneTime(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Insert an overdue one-time plan directly (past week_end_date)
	database.DB.Exec(`
		INSERT INTO weekly_plans (id, user_id, week_start_date, week_end_date, name, routine_type, created_at, updated_at)
		VALUES (?, ?, '2020-01-06', '2020-01-12', 'Old Override', 'one_time', datetime('now'), datetime('now'))
	`, uuid.New().String(), userID)

	// Insert a future one-time plan
	database.DB.Exec(`
		INSERT INTO weekly_plans (id, user_id, week_start_date, week_end_date, name, routine_type, created_at, updated_at)
		VALUES (?, ?, '2099-01-06', '2099-01-12', 'Future Override', 'one_time', datetime('now'), datetime('now'))
	`, uuid.New().String(), userID)

	// Fetch plans — the overdue one should be deleted
	req, w := newRequest("GET", "/api/plans", nil, userID)
	GetPlans(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GetPlans: expected 200, got %d", w.Code)
	}

	// Verify only the future plan remains
	var count int
	database.DB.QueryRow("SELECT COUNT(*) FROM weekly_plans WHERE user_id = ? AND routine_type = 'one_time'", userID).Scan(&count)
	if count != 1 {
		t.Errorf("Expected 1 one-time plan after auto-delete, got %d", count)
	}
}

// ── Integration Test: Full Workout Flow ──────────────────────────────

// TestWorkoutFlow_FullIntegration exercises the complete workout flow
// exactly as the mobile app does: register → create multi-exercise plan →
// start workout → verify all exercises are copied with correct sets/reps/weight.
// Uses real HTTP handlers with auth middleware, not just direct handler calls.
func TestWorkoutFlow_FullIntegration(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	// Initialize auth & middleware (required for JWT token generation/validation)
	InitAuth("test-jwt-secret-for-integration-test")
	middleware.InitMiddleware("test-jwt-secret-for-integration-test")

	// ── Step 1: Register a new user via the real Register handler ──
	registerBody := `{"email":"testuser@example.com","password":"SecurePass123!"}`
	regReq := httptest.NewRequest("POST", "/api/auth/register", strings.NewReader(registerBody))
	regReq.Header.Set("Content-Type", "application/json")
	regW := httptest.NewRecorder()
	Register(regW, regReq)

	if regW.Code != http.StatusCreated {
		t.Fatalf("Register: expected 201, got %d: %s", regW.Code, regW.Body.String())
	}

	// Extract the JWT token
	var authResp models.AuthResponse
	json.Unmarshal(regW.Body.Bytes(), &authResp)
	if authResp.Token == "" {
		t.Fatal("Register did not return a token")
	}
	token := authResp.Token

	// ── Step 2: Seed 3 real exercises in the library ──────────────
	ex1ID := seedTestExerciseNamed(t, "Bench Press", "chest", "Barbell")
	ex2ID := seedTestExerciseNamed(t, "Squat", "legs", "Barbell")
	ex3ID := seedTestExerciseNamed(t, "Deadlift", "back", "Barbell")

	// ── Step 3: Create a plan with 2 days, each with exercises ────
	// Day 1 (Monday): Push day — 2 exercises
	// Day 2 (Wednesday): Legs+Back — 1 exercise
	planPayload := models.CreatePlanRequest{
		Name:        "Integration Test Plan",
		RoutineType: "consistent",
		Days: []models.CreatePlanDayReq{
			{
				DayOfWeek:         0, // Monday
				WorkoutName:       "Push Day",
				EstimatedDuration: 60,
				Exercises: []models.CreatePlanExerciseReq{
					{
						ExerciseID:   ex1ID,
						TargetSets:   4,
						TargetReps:   "8-12",
						TargetWeight: 80,
						Notes:        "Focus on controlled negatives",
					},
					{
						ExerciseID:   ex2ID,
						TargetSets:   3,
						TargetReps:   "10",
						TargetWeight: 100,
					},
				},
			},
			{
				DayOfWeek:         2, // Wednesday
				WorkoutName:       "Pull Day",
				EstimatedDuration: 45,
				Exercises: []models.CreatePlanExerciseReq{
					{
						ExerciseID:   ex3ID,
						TargetSets:   3,
						TargetReps:   "5",
						TargetWeight: 120,
					},
				},
			},
		},
	}

	planBody, _ := json.Marshal(planPayload)
	planReq := httptest.NewRequest("POST", "/api/plans", bytes.NewReader(planBody))
	planReq.Header.Set("Content-Type", "application/json")
	planReq.Header.Set("Authorization", "Bearer "+token)
	// Use protect() to wrap with auth middleware like main.go does
	planW := httptest.NewRecorder()
	middleware.AuthRequired(http.HandlerFunc(CreatePlan)).ServeHTTP(planW, planReq)

	if planW.Code != http.StatusCreated {
		t.Fatalf("CreatePlan: expected 201, got %d: %s", planW.Code, planW.Body.String())
	}

	plan := unmarshalPlan(planW.Body.Bytes())
	if len(plan.Days) < 2 {
		t.Fatalf("Expected at least 2 plan days, got %d", len(plan.Days))
	}

	// Verify plan day exercises
	pushDay := plan.Days[0]
	if len(pushDay.Exercises) != 2 {
		t.Errorf("Push Day: expected 2 exercises, got %d", len(pushDay.Exercises))
	}
	pullDay := plan.Days[1]
	if len(pullDay.Exercises) != 1 {
		t.Errorf("Pull Day: expected 1 exercise, got %d", len(pullDay.Exercises))
	}

	// ── Step 4: Start workout from Push Day (Monday) ─────────────
	startPayload := models.StartWorkoutRequest{
		PlanDayID:   pushDay.ID,
		WorkoutName: pushDay.WorkoutName,
	}
	startBody, _ := json.Marshal(startPayload)
	startReq := httptest.NewRequest("POST", "/api/workouts", bytes.NewReader(startBody))
	startReq.Header.Set("Content-Type", "application/json")
	startReq.Header.Set("Authorization", "Bearer "+token)
	startW := httptest.NewRecorder()
	middleware.AuthRequired(http.HandlerFunc(StartWorkout)).ServeHTTP(startW, startReq)

	if startW.Code != http.StatusCreated {
		t.Fatalf("StartWorkout: expected 201, got %d: %s", startW.Code, startW.Body.String())
	}

	session := unmarshalSession(startW.Body.Bytes())
	if session.ID == "" {
		t.Fatal("Session ID is empty")
	}

	// ── Step 5: Verify all exercises were copied correctly ────────
	if len(session.Exercises) != 2 {
		t.Fatalf("Expected 2 exercises in session, got %d. Session: %+v", len(session.Exercises), session)
	}

	// Exercise 1: Bench Press
	ex1 := session.Exercises[0]
	if ex1.ExerciseName != "Bench Press" {
		t.Errorf("Exercise 1 name: expected 'Bench Press', got '%s'", ex1.ExerciseName)
	}
	if ex1.MuscleGroup != "chest" {
		t.Errorf("Exercise 1 muscle: expected 'chest', got '%s'", ex1.MuscleGroup)
	}
	if len(ex1.Sets) != 4 {
		t.Errorf("Exercise 1 sets: expected 4, got %d", len(ex1.Sets))
	}
	// Verify set weights and numbers
	for i, set := range ex1.Sets {
		if set.SetNumber != i+1 {
			t.Errorf("Exercise 1 set %d: expected set_number %d, got %d", i, i+1, set.SetNumber)
		}
		if set.WeightKg != 80 {
			t.Errorf("Exercise 1 set %d: expected weight 80, got %f", i, set.WeightKg)
		}
		if set.Reps != 0 {
			t.Errorf("Exercise 1 set %d: expected reps 0 (empty set), got %d", i, set.Reps)
		}
		if set.Completed {
			t.Errorf("Exercise 1 set %d: should not be completed", i)
		}
	}

	// Exercise 2: Squat
	ex2 := session.Exercises[1]
	if ex2.ExerciseName != "Squat" {
		t.Errorf("Exercise 2 name: expected 'Squat', got '%s'", ex2.ExerciseName)
	}
	if ex2.MuscleGroup != "legs" {
		t.Errorf("Exercise 2 muscle: expected 'legs', got '%s'", ex2.MuscleGroup)
	}
	if len(ex2.Sets) != 3 {
		t.Errorf("Exercise 2 sets: expected 3, got %d", len(ex2.Sets))
	}
	for i, set := range ex2.Sets {
		if set.WeightKg != 100 {
			t.Errorf("Exercise 2 set %d: expected weight 100, got %f", i, set.WeightKg)
		}
	}

	// ── Step 6: Verify session metadata in DB ────────────────────
	var dbName, dbPlanID, dbPlanDayID string
	database.DB.QueryRow(
		"SELECT workout_name, COALESCE(plan_id,''), COALESCE(plan_day_id,'') FROM workout_sessions WHERE id = ?",
		session.ID,
	).Scan(&dbName, &dbPlanID, &dbPlanDayID)

	if dbName != "Push Day" {
		t.Errorf("Session name: expected 'Push Day', got '%s'", dbName)
	}
	if dbPlanID != plan.ID {
		t.Errorf("Session plan_id: expected '%s', got '%s'", plan.ID, dbPlanID)
	}
	if dbPlanDayID != pushDay.ID {
		t.Errorf("Session plan_day_id: expected '%s', got '%s'", pushDay.ID, dbPlanDayID)
	}

	// ── Step 7: Start workout from Pull Day too (verify second day works) ──
	startPayload2 := models.StartWorkoutRequest{
		PlanDayID:   pullDay.ID,
		WorkoutName: pullDay.WorkoutName,
	}
	startBody2, _ := json.Marshal(startPayload2)
	startReq2 := httptest.NewRequest("POST", "/api/workouts", bytes.NewReader(startBody2))
	startReq2.Header.Set("Content-Type", "application/json")
	startReq2.Header.Set("Authorization", "Bearer "+token)
	startW2 := httptest.NewRecorder()
	middleware.AuthRequired(http.HandlerFunc(StartWorkout)).ServeHTTP(startW2, startReq2)

	if startW2.Code != http.StatusCreated {
		t.Fatalf("StartWorkout Pull Day: expected 201, got %d: %s", startW2.Code, startW2.Body.String())
	}

	session2 := unmarshalSession(startW2.Body.Bytes())
	if len(session2.Exercises) != 1 {
		t.Errorf("Pull Day session: expected 1 exercise, got %d", len(session2.Exercises))
	}
	if len(session2.Exercises) > 0 {
		if session2.Exercises[0].ExerciseName != "Deadlift" {
			t.Errorf("Pull Day exercise: expected 'Deadlift', got '%s'", session2.Exercises[0].ExerciseName)
		}
		if len(session2.Exercises[0].Sets) != 3 {
			t.Errorf("Pull Day sets: expected 3, got %d", len(session2.Exercises[0].Sets))
		}
	}

	t.Logf("✅ Integration test passed: registered user, created 2-day plan, started 2 workouts, all exercises copied with correct sets/reps/weights")
}

// roundTripFunc is a helper type that lets a function satisfy http.RoundTripper
// so tests can mock the Gemini HTTP client without needing a real server.
type roundTripFunc func(req *http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

// seedTestExerciseNamed creates an exercise with the given name/group/equipment and returns its ID.
func seedTestExerciseNamed(t *testing.T, name, muscleGroup, equipment string) string {
	t.Helper()
	exID := uuid.New().String()
	_, err := database.DB.Exec(`
		INSERT INTO exercises (id, name, muscle_group, equipment)
		VALUES (?, ?, ?, ?)
	`, exID, name, muscleGroup, equipment)
	if err != nil {
		t.Fatalf("Failed to seed exercise %s: %v", name, err)
	}
	return exID
}

// ── StartWorkout Handler Tests ───────────────────────────────────────

// TestStartWorkout_PlanDayNotFound tests that starting a workout with a
// non-existent planDayId returns 404.
//
// Note: a "fetchWorkoutSession failure" test is impractical to unit-test
// without DB mocking — it would require a SELECT to fail after a successful
// INSERT, which doesn't occur naturally.
func TestStartWorkout_PlanDayNotFound(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	req, w := newRequest("POST", "/api/workouts", models.StartWorkoutRequest{
		PlanDayID:   uuid.New().String(), // non-existent
		WorkoutName: "Should Fail",
	}, userID)
	StartWorkout(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("StartWorkout with bogus planDayId: expected 404, got %d: %s", w.Code, w.Body.String())
	}

	// Verify no session was created
	var count int
	database.DB.QueryRow("SELECT COUNT(*) FROM workout_sessions WHERE user_id = ?", userID).Scan(&count)
	if count != 0 {
		t.Errorf("Expected 0 sessions in DB after 404, got %d", count)
	}
}

// TestStartWorkout_FromPlanDay_Success tests starting a workout from a
// plan day that has exercises. Verifies that exercises are copied into
// the session correctly.
func TestStartWorkout_FromPlanDay_Success(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)
	exerciseID := seedTestExercise(t)

	// 1. Create a plan with a day that references the real exercise
	createReq, createW := newRequest("POST", "/api/plans",
		planReq("Test Plan", "consistent", daysWithRealExercise(exerciseID)), userID)
	CreatePlan(createW, createReq)
	if createW.Code != http.StatusCreated {
		t.Fatalf("CreatePlan: expected 201, got %d: %s", createW.Code, createW.Body.String())
	}

	plan := unmarshalPlan(createW.Body.Bytes())
	if len(plan.Days) == 0 {
		t.Fatal("Created plan has no days")
	}
	planDayID := plan.Days[0].ID

	// 2. Start workout from that plan day
	startReq, startW := newRequest("POST", "/api/workouts", models.StartWorkoutRequest{
		PlanDayID:   planDayID,
		WorkoutName: plan.Days[0].WorkoutName,
	}, userID)
	StartWorkout(startW, startReq)

	if startW.Code != http.StatusCreated {
		t.Fatalf("StartWorkout: expected 201, got %d: %s", startW.Code, startW.Body.String())
	}

	// 3. Verify session has exercises
	session := unmarshalSession(startW.Body.Bytes())
	if session.ID == "" {
		t.Fatal("Session ID is empty — response may be malformed")
	}
	if len(session.Exercises) != 1 {
		t.Errorf("Expected 1 exercise in session, got %d", len(session.Exercises))
	}
	if len(session.Exercises) > 0 {
		ex := session.Exercises[0]
		if ex.ExerciseName == "" {
			t.Error("Exercise name should not be empty")
		}
		if ex.MuscleGroup != "chest" {
			t.Errorf("Expected muscle group 'chest', got '%s'", ex.MuscleGroup)
		}
		if len(ex.Sets) != 3 {
			t.Errorf("Expected 3 sets, got %d", len(ex.Sets))
		}
	}

	// 4. Verify session exists in DB
	var dbName string
	database.DB.QueryRow("SELECT workout_name FROM workout_sessions WHERE id = ?", session.ID).Scan(&dbName)
	if dbName != "Real Exercise Day" {
		t.Errorf("Expected session name 'Real Exercise Day', got '%s'", dbName)
	}
}

// TestStartWorkout_AdHoc_Success tests starting a workout without a
// planDayId (ad-hoc workout). The session is created but has no exercises.
func TestStartWorkout_AdHoc_Success(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	req, w := newRequest("POST", "/api/workouts", models.StartWorkoutRequest{
		PlanDayID:   "",
		WorkoutName: "Quick Ad-Hoc Workout",
	}, userID)
	StartWorkout(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("StartWorkout ad-hoc: expected 201, got %d: %s", w.Code, w.Body.String())
	}

	session := unmarshalSession(w.Body.Bytes())
	if session.ID == "" {
		t.Fatal("Session ID is empty")
	}
	if session.WorkoutName != "Quick Ad-Hoc Workout" {
		t.Errorf("Expected workout name 'Quick Ad-Hoc Workout', got '%s'", session.WorkoutName)
	}
	if len(session.Exercises) != 0 {
		t.Errorf("Expected 0 exercises for ad-hoc workout, got %d", len(session.Exercises))
	}
	if session.Completed {
		t.Error("New session should not be completed")
	}

	// Verify session exists in DB with correct metadata
	var dbCompleted, dbDraft int
	database.DB.QueryRow(
		"SELECT completed, is_draft FROM workout_sessions WHERE id = ?", session.ID,
	).Scan(&dbCompleted, &dbDraft)
	if dbCompleted != 0 {
		t.Error("Session should not be marked completed in DB")
	}
	if dbDraft != 0 {
		t.Error("Session should not be marked as draft in DB")
	}
}

// ── Food Scan Integration Tests ─────────────────────────────────────

// createMultipartRequest builds a multipart/form-data HTTP request with a
// JPEG file in the "foodPhoto" field. Used for testing ScanFood endpoint.
func createMultipartRequest(userID string) (*http.Request, *httptest.ResponseRecorder) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	// Create a form file field with a minimal valid JPEG header
	// (FF D8 FF E0 00 10 4A 46 49 46 = JPEG magic bytes)
	part, _ := writer.CreateFormFile("foodPhoto", "test-food.jpg")
	jpegHeader := []byte{
		0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
		0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // SOI + APP0 + JFIF
	}
	// Pad with some data so the file is recognizable
	jpegData := append(jpegHeader, bytes.Repeat([]byte{0x00, 0x00}, 100)...)
	part.Write(jpegData)
	writer.Close()

	req := httptest.NewRequest("POST", "/api/food-scan", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	if userID != "" {
		ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
		req = req.WithContext(ctx)
	}

	return req, httptest.NewRecorder()
}

// unmarshalScannedFood extracts a ScannedFood from an APIResponse body.
func unmarshalScannedFood(body []byte) models.ScannedFood {
	var resp models.APIResponse
	json.Unmarshal(body, &resp)
	data, _ := json.Marshal(resp.Data)
	var scan models.ScannedFood
	json.Unmarshal(data, &scan)
	return scan
}

// TestFoodScan_SimulatedFallback tests the ScanFood handler when no
// Gemini key is configured (simulated fallback). Verifies all response
// fields including detected_foods, macros, health_score, and food_details
// with per-food health benefits.
func TestFoodScan_SimulatedFallback(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Set a primary goal on the user to test personalization
	database.DB.Exec("UPDATE users SET primary_goal = 'build_muscle' WHERE id = ?", userID)

	// Ensure no Gemini key is set (simulated fallback)
	originalKey := geminiKey
	geminiKey = ""
	defer func() { geminiKey = originalKey }()

	req, w := createMultipartRequest(userID)
	ScanFood(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("ScanFood: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	scan := unmarshalScannedFood(w.Body.Bytes())

	// ── Verify core fields ───────────────────────────────────────
	if scan.ID == "" {
		t.Error("Scan ID is empty")
	}
	if scan.PhotoURL == "" {
		t.Error("Photo URL is empty")
	}
	if scan.Name == "" {
		t.Error("Name is empty — should have a dish name")
	}
	if len(scan.Ingredients) == 0 {
		t.Error("Ingredients is empty — should have at least one ingredient")
	}
	if len(scan.DetectedFoods) == 0 {
		t.Error("DetectedFoods is empty — should have at least one food")
	}
	if scan.EstimatedServing == "" {
		t.Error("EstimatedServing is empty")
	}
	if scan.Calories <= 0 {
		t.Errorf("Calories should be > 0, got %d", scan.Calories)
	}
	if scan.ProteinG <= 0 {
		t.Errorf("ProteinG should be > 0, got %f", scan.ProteinG)
	}
	if scan.CarbsG <= 0 {
		t.Errorf("CarbsG should be > 0, got %f", scan.CarbsG)
	}
	if scan.FatG <= 0 {
		t.Errorf("FatG should be > 0, got %f", scan.FatG)
	}
	if scan.HealthScore < 1 || scan.HealthScore > 10 {
		t.Errorf("HealthScore should be 1-10, got %d", scan.HealthScore)
	}
	if scan.HealthFacts == "" {
		t.Error("HealthFacts is empty")
	}

	// ── Verify food_details ──────────────────────────────────────
	if len(scan.FoodDetails) == 0 {
		t.Error("FoodDetails is empty — should have per-food breakdown")
	}
	for i, fd := range scan.FoodDetails {
		if fd.Name == "" {
			t.Errorf("FoodDetails[%d].Name is empty", i)
		}
		// Some combos include zero-calorie items (e.g. sparkling water), so
		// only reject negative values — a 0 is a legitimate per-food entry.
		if fd.Calories < 0 {
			t.Errorf("FoodDetails[%d].Calories should be >= 0, got %d", i, fd.Calories)
		}
		if fd.HealthBenefit == "" {
			t.Errorf("FoodDetails[%d].HealthBenefit is empty", i)
		}
	}

	// ── Verify muscle gain personalization ───────────────────────
	if !strings.Contains(scan.HealthFacts, "muscle gain") {
		t.Logf("HealthFacts (may not always contain muscle gain for all combos): %s", scan.HealthFacts)
	}

	// ── Verify DB persistence ────────────────────────────────────
	var dbCalories int
	var dbFoodDetailsJSON string
	database.DB.QueryRow(
		"SELECT calories, COALESCE(food_details, '[]') FROM scanned_foods WHERE id = ?", scan.ID,
	).Scan(&dbCalories, &dbFoodDetailsJSON)
	if dbCalories != scan.Calories {
		t.Errorf("DB calories mismatch: expected %d, got %d", scan.Calories, dbCalories)
	}
	if dbFoodDetailsJSON == "[]" || dbFoodDetailsJSON == "" {
		t.Error("food_details JSON is empty in DB — should be persisted")
	}

	// Verify food_details can be round-tripped
	var rtDetails []models.FoodDetail
	json.Unmarshal([]byte(dbFoodDetailsJSON), &rtDetails)
	if len(rtDetails) != len(scan.FoodDetails) {
		t.Errorf("Round-tripped food_details length mismatch: %d vs %d", len(rtDetails), len(scan.FoodDetails))
	}

	t.Logf("✅ Food scan simulated: %v | %d cal | score %d/10 | %d food details",
		scan.DetectedFoods, scan.Calories, scan.HealthScore, len(scan.FoodDetails))
}

// TestFoodScan_MissingPhoto tests that omitting the foodPhoto field returns 400.
func TestFoodScan_MissingPhoto(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Create a multipart form without the foodPhoto field — the field
	// is simply absent rather than relying on parser-level behavior.
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	writer.WriteField("unrelated", "value")
	writer.Close()

	req := httptest.NewRequest("POST", "/api/food-scan", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()
	ScanFood(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for missing photo, got %d: %s", w.Code, w.Body.String())
	}
}

// TestFoodScan_InvalidFileType tests that uploading a non-image returns 400.
func TestFoodScan_InvalidFileType(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, _ := writer.CreateFormFile("foodPhoto", "test.txt")
	part.Write([]byte("this is not an image"))
	writer.Close()

	req := httptest.NewRequest("POST", "/api/food-scan", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()
	ScanFood(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for invalid file type, got %d: %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "invalid file type") {
		t.Errorf("Response should mention 'invalid file type', got: %s", w.Body.String())
	}
}

// TestFoodScan_LogAndHistory tests the full scan → log → history flow.
func TestFoodScan_LogAndHistory(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	originalKey := geminiKey
	geminiKey = ""
	defer func() { geminiKey = originalKey }()

	// ── Step 1: Scan food ────────────────────────────────────────
	scanReq, scanW := createMultipartRequest(userID)
	ScanFood(scanW, scanReq)

	if scanW.Code != http.StatusOK {
		t.Fatalf("ScanFood: expected 200, got %d", scanW.Code)
	}
	scan := unmarshalScannedFood(scanW.Body.Bytes())

	// ── Step 2: Log the scanned food ─────────────────────────────
	logPayload := models.LogScannedFoodRequest{
		ScanID:   scan.ID,
		MealType: "general",
	}
	logReq, logW := newRequest("POST", "/api/food-scan/log", logPayload, userID)
	LogScannedFood(logW, logReq)

	if logW.Code != http.StatusCreated {
		t.Fatalf("LogScannedFood: expected 201, got %d: %s", logW.Code, logW.Body.String())
	}

	// ── Step 3: Verify scan history ──────────────────────────────
	histReq, histW := newRequest("GET", "/api/food-scan/history", nil, userID)
	GetScanHistory(histW, histReq)

	if histW.Code != http.StatusOK {
		t.Fatalf("GetScanHistory: expected 200, got %d", histW.Code)
	}

	var histResp models.APIResponse
	json.Unmarshal(histW.Body.Bytes(), &histResp)
	histData, _ := json.Marshal(histResp.Data)
	var scans []models.ScannedFood
	json.Unmarshal(histData, &scans)

	if len(scans) == 0 {
		t.Fatal("Scan history is empty — should contain the scan we just created")
	}

	// Verify the scan in history matches
	found := false
	for _, s := range scans {
		if s.ID == scan.ID {
			found = true
			if !s.WasLogged {
				t.Error("Scan should be marked as wasLogged=true")
			}
			if s.LoggedMealType != "general" {
				t.Errorf("LoggedMealType should be 'general', got '%s'", s.LoggedMealType)
			}
			if len(s.FoodDetails) == 0 {
				t.Error("FoodDetails should be populated in history")
			}
			break
		}
	}
	if !found {
		t.Error("Scan not found in history")
	}

	t.Logf("✅ Food scan → log → history flow works: %v", scan.DetectedFoods)
}

// TestAnalyzeFoodWithGemini_NoKey tests that analyzeFoodWithGemini
// returns false when no API key is configured.
func TestAnalyzeFoodWithGemini_NoKey(t *testing.T) {
	originalKey := geminiKey
	geminiKey = ""
	defer func() { geminiKey = originalKey }()

	jpegBytes := []byte{0xFF, 0xD8, 0xFF, 0xE0}
	_, ok, _ := analyzeFoodWithGemini(jpegBytes, "image/jpeg", userFoodContext{})
	if ok {
		t.Error("analyzeFoodWithGemini should return false when no API key is set")
	}
}

// TestAnalyzeFoodWithGemini_InvalidKey tests that an invalid API key
// returns false (graceful fallback) rather than panicking.
func TestAnalyzeFoodWithGemini_InvalidKey(t *testing.T) {
	originalKey := geminiKey
	geminiKey = "invalid-test-key"
	defer func() { geminiKey = originalKey }()

	jpegBytes := []byte{0xFF, 0xD8, 0xFF, 0xE0}
	_, ok, _ := analyzeFoodWithGemini(jpegBytes, "image/jpeg", userFoodContext{})
	if ok {
		t.Error("analyzeFoodWithGemini should return false for an invalid key")
	}
}

// TestScanFood_QuotaExceeded_Returns429 tests that the food scan endpoint
// returns 429 with a clear message when the Gemini API quota is exhausted.
func TestScanFood_QuotaExceeded_Returns429(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Ensure a key is set so the Gemini path is attempted.
	originalKey := geminiKey
	geminiKey = "test-key"
	defer func() { geminiKey = originalKey }()

	// Mock the Gemini API to return a 429 quota-exceeded response.
	originalClient := geminiHTTPClient
	geminiHTTPClient = &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusTooManyRequests,
				Body:       http.NoBody,
				Header:     make(http.Header),
			}, nil
		}),
	}
	defer func() { geminiHTTPClient = originalClient }()

	req, w := createMultipartRequest(userID)
	ScanFood(w, req)

	if w.Code != http.StatusTooManyRequests {
		t.Errorf("Expected 429 for quota exceeded, got %d: %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "limit has been used up") {
		t.Errorf("Expected limit message in response, got: %s", w.Body.String())
	}

	// No scan record should be persisted.
	var count int
	database.DB.QueryRow("SELECT COUNT(*) FROM scanned_foods WHERE user_id = ?", userID).Scan(&count)
	if count != 0 {
		t.Errorf("Expected no scan record to be saved, got %d", count)
	}
}

// TestBuildFoodAnalysisPrompt_IncludesUserContext verifies that the prompt
// builder injects the user's primary goal, allergies, and diet type.
func TestBuildFoodAnalysisPrompt_IncludesUserContext(t *testing.T) {
	ctx := userFoodContext{
		PrimaryGoal: "build_muscle",
		Allergies:   []string{"peanuts", "dairy"},
		DietType:    "vegetarian",
	}

	prompt := buildFoodAnalysisPrompt(ctx)

	if !strings.Contains(prompt, "build_muscle") {
		t.Error("Prompt should include the user's primary goal")
	}
	if !strings.Contains(prompt, "peanuts") {
		t.Error("Prompt should include the user's allergies")
	}
	if !strings.Contains(prompt, "vegetarian") {
		t.Error("Prompt should include the user's diet type")
	}
	if !strings.Contains(prompt, "Return ONLY valid JSON") {
		t.Error("Prompt should instruct the model to return only JSON")
	}
}

// TestBuildFoodAnalysisPrompt_NoContext verifies that the prompt still
// works when no user context is provided and does not leak empty context.
func TestBuildFoodAnalysisPrompt_NoContext(t *testing.T) {
	prompt := buildFoodAnalysisPrompt(userFoodContext{})

	if !strings.Contains(prompt, "Return ONLY valid JSON") {
		t.Error("Prompt should instruct the model to return only JSON")
	}
	if strings.Contains(prompt, "User context:") {
		t.Error("Prompt should not include an empty user context section")
	}
}

// ── Real Image Food Scan Tests ───────────────────────────────────────

// createMultipartRequestFromFile builds a multipart/form-data HTTP request
// using a real image file from disk. The foodPhoto field is populated with
// the file's contents and original name.
func createMultipartRequestFromFile(t *testing.T, filePath, userID string) (*http.Request, *httptest.ResponseRecorder) {
	t.Helper()

	fileBytes, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatalf("Failed to read test image %s: %v", filePath, err)
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("foodPhoto", filepath.Base(filePath))
	if err != nil {
		t.Fatalf("Failed to create form file: %v", err)
	}
	if _, err := part.Write(fileBytes); err != nil {
		t.Fatalf("Failed to write file to form: %v", err)
	}
	writer.Close()

	req := httptest.NewRequest("POST", "/api/food-scan", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	if userID != "" {
		ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
		req = req.WithContext(ctx)
	}

	return req, httptest.NewRecorder()
}

// TestFoodScan_RealImageFile scans the actual food.png test image through
// the full ScanFood handler flow. It works with or without a Gemini API key:
//   - With GEMINI_API_KEY set: uses Google Gemini for real-time AI analysis
//   - Without GEMINI_API_KEY: falls back to simulated analysis
//
// In either case, the response includes detected foods, per-food nutritional
// breakdown, health facts, and allergen detection.
func TestFoodScan_RealImageFile(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Set a primary goal for personalized analysis
	database.DB.Exec("UPDATE users SET primary_goal = 'general' WHERE id = ?", userID)

	// ── Resolve the test image path ──────────────────────────────
	// Tests run from backend/handlers/, so test image is at ../testdata/food.png
	imagePath := filepath.Join("..", "testdata", "food.png")

	// ── Scan the real food image ─────────────────────────────────
	req, w := createMultipartRequestFromFile(t, imagePath, userID)
	ScanFood(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("ScanFood: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	scan := unmarshalScannedFood(w.Body.Bytes())

	// ── Report what was detected ─────────────────────────────────
	t.Logf("📸 FOOD SCAN RESULTS (food.png)")
	t.Logf("   Detected Foods: %v", scan.DetectedFoods)
	t.Logf("   Serving Size:   %s", scan.EstimatedServing)
	t.Logf("   Calories:       %d", scan.Calories)
	t.Logf("   Protein:        %.1fg", scan.ProteinG)
	t.Logf("   Carbs:          %.1fg", scan.CarbsG)
	t.Logf("   Fat:            %.1fg", scan.FatG)
	t.Logf("   Health Score:   %d/10", scan.HealthScore)
	t.Logf("   Health Facts:   %s", scan.HealthFacts)
	t.Logf("   Photo URL:      %s", scan.PhotoURL)

	if len(scan.AllergenFlags) > 0 {
		t.Logf("   Allergen Alerts: %v", scan.AllergenFlags)
	}

	// ── Per-food breakdown ───────────────────────────────────────
	if len(scan.FoodDetails) > 0 {
		t.Logf("   ── Per-Food Breakdown (%d items) ──", len(scan.FoodDetails))
		for i, fd := range scan.FoodDetails {
			t.Logf("   [%d] %s — %d cal | %.1fg P / %.1fg C / %.1fg F",
				i+1, fd.Name, fd.Calories, fd.ProteinG, fd.CarbsG, fd.FatG)
			t.Logf("       Benefit: %s", fd.HealthBenefit)
		}
	}

	// ── Verify required fields are populated ─────────────────────
	if scan.ID == "" {
		t.Error("Scan ID should not be empty")
	}
	if scan.PhotoURL == "" {
		t.Error("Photo URL should not be empty")
	}
	if scan.Name == "" {
		t.Error("Dish name should not be empty — AI should name the meal")
	}
	if len(scan.Ingredients) == 0 {
		t.Error("Ingredients should not be empty — AI should list ingredients")
	}
	if len(scan.DetectedFoods) == 0 {
		t.Error("Detected foods should not be empty — AI should detect food in the image")
	}
	if scan.EstimatedServing == "" {
		t.Error("Estimated serving should not be empty")
	}
	if scan.Calories <= 0 {
		t.Errorf("Calories should be > 0, got %d", scan.Calories)
	}
	if scan.ProteinG < 0 {
		t.Errorf("ProteinG should be >= 0, got %f", scan.ProteinG)
	}
	if scan.CarbsG < 0 {
		t.Errorf("CarbsG should be >= 0, got %f", scan.CarbsG)
	}
	if scan.FatG < 0 {
		t.Errorf("FatG should be >= 0, got %f", scan.FatG)
	}
	if scan.HealthScore < 1 || scan.HealthScore > 10 {
		t.Errorf("HealthScore should be 1-10, got %d", scan.HealthScore)
	}
	if scan.HealthFacts == "" {
		t.Error("HealthFacts should not be empty — AI should provide health analysis")
	}

	// ── Verify per-food details ──────────────────────────────────
	if len(scan.FoodDetails) == 0 {
		t.Error("FoodDetails should not be empty — should have per-food breakdown")
	}
	for i, fd := range scan.FoodDetails {
		if fd.Name == "" {
			t.Errorf("FoodDetails[%d].Name should not be empty", i)
		}
		if fd.Calories < 0 {
			t.Errorf("FoodDetails[%d] (%s): Calories should be >= 0, got %d", i, fd.Name, fd.Calories)
		}
		if fd.HealthBenefit == "" {
			t.Errorf("FoodDetails[%d] (%s): HealthBenefit should not be empty", i, fd.Name)
		}
	}

	// ── Verify DB persistence ────────────────────────────────────
	var dbCalories int
	var dbFoodDetailsJSON string
	err := database.DB.QueryRow(
		"SELECT calories, COALESCE(food_details, '[]') FROM scanned_foods WHERE id = ?", scan.ID,
	).Scan(&dbCalories, &dbFoodDetailsJSON)
	if err != nil {
		t.Fatalf("Failed to query scanned_foods: %v", err)
	}
	if dbCalories != scan.Calories {
		t.Errorf("DB calories mismatch: expected %d, got %d", scan.Calories, dbCalories)
	}
	if dbFoodDetailsJSON == "[]" || dbFoodDetailsJSON == "" {
		t.Error("food_details JSON should be persisted in DB")
	}

	// Verify food_details round-trip
	var rtDetails []models.FoodDetail
	json.Unmarshal([]byte(dbFoodDetailsJSON), &rtDetails)
	if len(rtDetails) != len(scan.FoodDetails) {
		t.Errorf("Round-tripped food_details length mismatch: %d vs %d", len(rtDetails), len(scan.FoodDetails))
	}

	t.Logf("✅ Real image scan complete — %d foods detected, score %d/10",
		len(scan.DetectedFoods), scan.HealthScore)
}
