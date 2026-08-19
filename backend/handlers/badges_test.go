// Package handlers — unit tests for the progression badges endpoint.
// Covers the three badge paths: no activity, fitness-only activity, and
// health-only activity (meal tracking).
package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"resolution-fitnessapp-backend/database"
	"resolution-fitnessapp-backend/models"
)

// unmarshalBadges extracts the badge list from an APIResponse body.
func unmarshalBadges(body []byte) []models.Badge {
	var resp models.APIResponse
	json.Unmarshal(body, &resp)
	data, _ := json.Marshal(resp.Data)
	var badges []models.Badge
	json.Unmarshal(data, &badges)
	return badges
}

// badgeByID finds a badge by ID in a list.
func badgeByID(t *testing.T, badges []models.Badge, id string) models.Badge {
	t.Helper()
	for _, b := range badges {
		if b.ID == id {
			return b
		}
	}
	t.Fatalf("badge %q not found in response", id)
	return models.Badge{}
}

// seedFoodLogs inserts count food logs on distinct consecutive dates.
func seedFoodLogs(t *testing.T, userID string, count int) {
	t.Helper()
	for i := 0; i < count; i++ {
		date := "2026-08-01"
		switch i {
		case 1:
			date = "2026-08-02"
		case 2:
			date = "2026-08-03"
		case 3:
			date = "2026-08-04"
		case 4:
			date = "2026-08-05"
		}
		_, err := database.DB.Exec(`
			INSERT INTO food_logs (id, user_id, log_date, meal_type, total_calories, total_protein_g)
			VALUES (?, ?, ?, 'general', 400, 30)
		`, userID+"-meal-"+date, userID, date)
		if err != nil {
			t.Fatalf("Failed to seed food log: %v", err)
		}
	}
}

// TestGetBadges_NoActivity verifies a fresh user (no stats row, no meals)
// receives four unearned badges with zero progress.
func TestGetBadges_NoActivity(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUserNoStats(t)

	req, w := newRequest("GET", "/api/badges", nil, userID)
	GetBadges(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GetBadges: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	badges := unmarshalBadges(w.Body.Bytes())
	if len(badges) != 4 {
		t.Fatalf("Expected 4 badges, got %d", len(badges))
	}
	for _, b := range badges {
		if b.Earned {
			t.Errorf("Badge %s should not be earned with no activity", b.ID)
		}
		if b.Progress != 0 {
			t.Errorf("Badge %s progress should be 0, got %f", b.ID, b.Progress)
		}
		if b.Name == "" || b.Emoji == "" || b.Description == "" {
			t.Errorf("Badge %s is missing display fields (name/emoji/description)", b.ID)
		}
	}
}

// TestGetBadges_FitnessActivity verifies a veteran lifter (42 workouts,
// 7-day current streak, 14-day longest streak) earns all four badges.
func TestGetBadges_FitnessActivity(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t) // seeds 42 workouts, streak 7, longest 14

	req, w := newRequest("GET", "/api/badges", nil, userID)
	GetBadges(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GetBadges: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	badges := unmarshalBadges(w.Body.Bytes())
	for _, id := range []string{"rookie", "casual_goer", "motivated", "gym_rat"} {
		b := badgeByID(t, badges, id)
		if !b.Earned {
			t.Errorf("Badge %s should be earned after 42 workouts", id)
		}
		if b.Progress != 1 {
			t.Errorf("Badge %s progress should be 1, got %f", id, b.Progress)
		}
	}
}

// TestGetBadges_HealthOnly verifies badge progress can come entirely from
// Health tab activity (meal tracking) — 3 tracked days earns Rookie and
// Motivated Temporarily, but not Casual Goer or Gym Rat.
func TestGetBadges_HealthOnly(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUserNoStats(t)
	seedFoodLogs(t, userID, 3)

	req, w := newRequest("GET", "/api/badges", nil, userID)
	GetBadges(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GetBadges: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	badges := unmarshalBadges(w.Body.Bytes())

	rookie := badgeByID(t, badges, "rookie")
	if !rookie.Earned {
		t.Error("Rookie should be earned after logging 3 meals")
	}

	motivated := badgeByID(t, badges, "motivated")
	if !motivated.Earned {
		t.Error("Motivated Temporarily should be earned after tracking meals on 3 days")
	}

	casual := badgeByID(t, badges, "casual_goer")
	if casual.Earned {
		t.Error("Casual Goer should NOT be earned with only 3 tracked days (needs 5)")
	}
	if casual.Progress != 0.6 {
		t.Errorf("Casual Goer progress should be 3/5 (0.6), got %f", casual.Progress)
	}

	gymRat := badgeByID(t, badges, "gym_rat")
	if gymRat.Earned {
		t.Error("Gym Rat should NOT be earned with only 3 tracked days (needs 14)")
	}
}
