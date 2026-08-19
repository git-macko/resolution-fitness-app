// Package handlers — tests for daily goal recommendations.
package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"resolution-fitnessapp-backend/models"
)

// TestRecommendedGoals verifies the goal formulas produce sensible,
// goal-aware targets that stay within the documented clamps.
func TestRecommendedGoals(t *testing.T) {
	// 80kg user — maintenance ≈ 2640 kcal.
	base := recommendedGoals(180, 80, "general")
	if base.CalorieTarget != 2640 {
		t.Errorf("general: expected 2640 kcal, got %d", base.CalorieTarget)
	}
	if base.ProteinTargetGrams != 110 { // 80 * 1.4, rounded to nearest 5
		t.Errorf("general: expected 110 g protein, got %d", base.ProteinTargetGrams)
	}
	if base.WaterGoalMl != 2800 { // 80 * 35
		t.Errorf("general: expected 2800 ml water, got %d", base.WaterGoalMl)
	}

	// Weight loss creates a deficit; muscle gain creates a surplus.
	loss := recommendedGoals(180, 80, "lose_weight")
	if loss.CalorieTarget >= base.CalorieTarget {
		t.Errorf("lose_weight should cut calories below maintenance: %d vs %d", loss.CalorieTarget, base.CalorieTarget)
	}
	muscle := recommendedGoals(180, 80, "build_muscle")
	if muscle.CalorieTarget <= base.CalorieTarget {
		t.Errorf("build_muscle should add calories above maintenance: %d vs %d", muscle.CalorieTarget, base.CalorieTarget)
	}
	if muscle.ProteinTargetGrams < loss.ProteinTargetGrams {
		t.Errorf("build_muscle protein (%d) should be at least weight-loss protein (%d)", muscle.ProteinTargetGrams, loss.ProteinTargetGrams)
	}

	// Clamps keep extreme inputs sane.
	tiny := recommendedGoals(150, 40, "lose_weight")
	if tiny.CalorieTarget < 1200 {
		t.Errorf("tiny user calories should be clamped to >= 1200, got %d", tiny.CalorieTarget)
	}
	huge := recommendedGoals(200, 200, "build_muscle")
	if huge.ProteinTargetGrams > 250 {
		t.Errorf("huge user protein should be clamped to <= 250, got %d", huge.ProteinTargetGrams)
	}

	// Unknown goals fall back to general.
	unknown := recommendedGoals(180, 80, "be_a_llama")
	if unknown.CalorieTarget != base.CalorieTarget {
		t.Errorf("unknown goal should fall back to general targets, got %d", unknown.CalorieTarget)
	}
}

// TestRecalculateGoals verifies the endpoint computes targets from body
// stats, persists them to user_settings, and keeps the profile in sync.
func TestRecalculateGoals(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	req, w := newRequest(http.MethodPost, "/api/profile/goals", map[string]interface{}{
		"heightCm": 175,
		"weightKg": 70,
		"primaryGoal": "lose_weight",
	}, userID)
	RecalculateGoals(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp models.APIResponse
	json.Unmarshal(w.Body.Bytes(), &resp)
	goalsData, _ := json.Marshal(resp.Data)
	var goals models.RecommendedGoals
	json.Unmarshal(goalsData, &goals)

	if goals.CalorieTarget <= 0 || goals.ProteinTargetGrams <= 0 || goals.WaterGoalMl <= 0 {
		t.Fatalf("expected positive targets, got %+v", goals)
	}

	// Targets must have been persisted to settings.
	var saved models.UserSettings
	settings, err := fetchSettingsByUserID(userID)
	if err != nil {
		t.Fatalf("failed to fetch settings: %v", err)
	}
	saved = *settings
	if saved.CalorieTarget != goals.CalorieTarget || saved.ProteinTargetGrams != goals.ProteinTargetGrams || saved.WaterGoalMl != goals.WaterGoalMl {
		t.Errorf("settings not in sync with response: settings=%+v goals=%+v", saved, goals)
	}

	// Profile height/weight updated too.
	user, err := fetchUserByID(userID)
	if err != nil {
		t.Fatalf("failed to fetch user: %v", err)
	}
	if user.HeightCm != 175 || user.WeightKg != 70 {
		t.Errorf("profile not updated: height=%v weight=%v", user.HeightCm, user.WeightKg)
	}
}

// TestCompleteOnboarding_SetsGoals verifies onboarding with body stats seeds
// the user_settings daily targets for the new account.
func TestCompleteOnboarding_SetsGoals(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	req, w := newRequest(http.MethodPost, "/api/profile/onboarding", map[string]interface{}{
		"displayName":  "Test Athlete",
		"fitnessLevel": "intermediate",
		"primaryGoal":  "build_muscle",
		"heightCm":     180,
		"weightKg":     80,
		"gender":       "male",
		"allergies":    []string{"Nuts"},
	}, userID)
	CompleteOnboarding(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	settings, err := fetchSettingsByUserID(userID)
	if err != nil {
		t.Fatalf("failed to fetch settings: %v", err)
	}
	if settings.CalorieTarget != 2900 { // 80 * 33 * 1.1, rounded to nearest 10
		t.Errorf("expected 2900 kcal for muscle gain, got %d", settings.CalorieTarget)
	}
	if settings.ProteinTargetGrams != 160 { // 80 * 2.0
		t.Errorf("expected 160 g protein for muscle gain, got %d", settings.ProteinTargetGrams)
	}
	if settings.WaterGoalMl != 2800 {
		t.Errorf("expected 2800 ml water, got %d", settings.WaterGoalMl)
	}

	user, err := fetchUserByID(userID)
	if err != nil {
		t.Fatalf("failed to fetch user: %v", err)
	}
	if user.HeightCm != 180 || user.WeightKg != 80 {
		t.Errorf("onboarding did not store body stats: height=%v weight=%v", user.HeightCm, user.WeightKg)
	}
	if !user.OnboardingCompleted {
		t.Error("onboarding should mark the user complete")
	}
}

// TestRecalculateGoals_RequiresBodyStats verifies the endpoint rejects
// requests when no height/weight is available anywhere.
func TestRecalculateGoals_RequiresBodyStats(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	req, w := newRequest(http.MethodPost, "/api/profile/goals", map[string]interface{}{}, userID)
	RecalculateGoals(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 without body stats, got %d: %s", w.Code, w.Body.String())
	}
}
