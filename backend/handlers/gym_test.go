// Resolution Fitness App — Gym preference + crowd estimation tests.
//
// The regression test below guards the "dashboard asks user to set up gym
// even after they saved one" bug fix in fetchUserGym:
//   - Lazy-seed a user_settings row if one is missing for the user, so any
//     subsequent UpdateUserGym UPDATE has a row to affect.
//   - Mirror the same self-heal pattern as fetchSettingsByUserID.
//
// Shared helpers (setupTestDB, seedTestUser, seedTestUserNoStats, newRequest)
// live in workouts_test.go in the same package.
package handlers

import (
	"net/http"
	"testing"

	"resolution-fitnessapp-backend/database"
	"resolution-fitnessapp-backend/models"
)

// TestFetchUserGym_SelfHealsMissingUserSettingsRow is the regression test
// for the user-reported scenario where the dashboard kept asking the user
// to set up their gym even after they had saved a preference.
//
// Earlier behavior: if Register's INSERT into user_settings silently failed,
// the user had a row in `users` but none in `user_settings`. fetchUserGym
// hit sql.ErrNoRows and returned (nil, err); fetchGymCrowd then returned
// (nil, nil); the dashboard JSON omitted the gymCrowd field via `omitempty`;
// the mobile GymCrowdCard falls back to the "Set up gym" prompt. The user
// could never persist a gym preference because UpdateUserGym's UPDATE
// affected 0 rows silently.
//
// Fix: fetchUserGym self-heals. On ErrNoRows it INSERT OR IGNORE's a
// default row, then re-scans. The freshly-created row carries the column
// defaults (gym_type='', capacity=150, etc.) which fetchGymCrowd treats
// correctly as "not configured yet" — but the row now exists for any
// later UpdateUserGym to actually update.
func TestFetchUserGym_SelfHealsMissingUserSettingsRow(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	// seedTestUserNoStats creates the user + user_stats rows but
	// deliberately skips user_settings. This mirrors the bug scenario in
	// production where Register's user_settings insert failed.
	userID := seedTestUserNoStats(t)

	// Sanity: confirm no user_settings row exists yet.
	var beforeCount int
	if err := database.DB.QueryRow(
		"SELECT COUNT(*) FROM user_settings WHERE user_id = ?", userID,
	).Scan(&beforeCount); err != nil {
		t.Fatalf("count before self-heal: %v", err)
	}
	if beforeCount != 0 {
		t.Fatalf("expected 0 user_settings rows before self-heal, got %d", beforeCount)
	}

	// First call to fetchUserGym hits ErrNoRows and triggers the self-heal.
	// Must return a non-nil UserGym with default values, not an error.
	gym, err := fetchUserGym(userID)
	if err != nil {
		t.Fatalf("fetchUserGym should self-heal; got err: %v", err)
	}
	if gym == nil {
		t.Fatal("fetchUserGym returned nil gym after self-heal")
	}
	if gym.Type != "" {
		t.Errorf("expected default gym_type='' after self-heal, got %q", gym.Type)
	}

	// The self-heal must have created exactly one user_settings row.
	var afterCount int
	if err := database.DB.QueryRow(
		"SELECT COUNT(*) FROM user_settings WHERE user_id = ?", userID,
	).Scan(&afterCount); err != nil {
		t.Fatalf("count after self-heal: %v", err)
	}
	if afterCount != 1 {
		t.Fatalf("expected 1 user_settings row after self-heal, got %d", afterCount)
	}

	// Now a real UpdateUserGym call must succeed because the row exists.
	// Pre-fix, this UPDATE would silently affect 0 rows and return 200
	// anyway — leaving the user in an inconsistent state.
	payload := models.UpdateUserGymRequest{
		Type:    "commercial",
		Name:    "Test Gym",
		Address: "123 Main St",
		PlaceID: "places/test-self-heal",
		Lat:     47.61,
		Lng:     -122.2,
	}
	req, w := newRequest(http.MethodPut, "/api/profile/gym", payload, userID)
	UpdateUserGym(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("UpdateUserGym after self-heal: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// And a re-fetch should now return the freshly-persisted gym.
	gym2, err := fetchUserGym(userID)
	if err != nil {
		t.Fatalf("fetchUserGym after Update: %v", err)
	}
	if gym2.Type != "commercial" {
		t.Errorf("expected gym_type='commercial' after Update, got %q", gym2.Type)
	}
	if gym2.Name != "Test Gym" {
		t.Errorf("expected gym_name='Test Gym' after Update, got %q", gym2.Name)
	}
}
