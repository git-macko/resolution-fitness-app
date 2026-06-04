// Package handlers — unit tests for workout plan handlers.
// Tests cover CreatePlan limit enforcement, SetActivePlan activation/progression reset,
// and ClonePlan one-time limit checks.
package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"resolution-fitnessapp-backend/database"
	"resolution-fitnessapp-backend/middleware"
	"resolution-fitnessapp-backend/models"

	"github.com/google/uuid"
)

// ── Test Setup Helpers ───────────────────────────────────────────────

// setupTestDB initializes an in-memory SQLite database and runs migrations.
// Returns a cleanup function that should be deferred.
func setupTestDB(t *testing.T) func() {
	t.Helper()
	if err := database.Initialize(":memory:"); err != nil {
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

	// Create 3 one-time overrides — should succeed
	for i := 0; i < 3; i++ {
		req, w := newRequest("POST", "/api/plans", planReq("Override "+string(rune('A'+i)), "one_time", minimalDays()), userID)
		CreatePlan(w, req)
		if w.Code != http.StatusCreated {
			t.Errorf("CreatePlan #%d: expected 201, got %d: %s", i+1, w.Code, w.Body.String())
		}
	}

	// Try creating a 4th one-time override — should fail with 409
	req, w := newRequest("POST", "/api/plans", planReq("Override D", "one_time", minimalDays()), userID)
	CreatePlan(w, req)
	if w.Code != http.StatusConflict {
		t.Errorf("CreatePlan 4th one-time: expected 409 Conflict, got %d: %s", w.Code, w.Body.String())
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

	// Fill up all 3 one-time slots
	for i := 0; i < 3; i++ {
		req, w := newRequest("POST", "/api/plans", planReq("Override "+string(rune('A'+i)), "one_time", minimalDays()), userID)
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
