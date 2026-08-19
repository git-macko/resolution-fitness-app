// Package handlers — daily goal recommendations.
// Computes personalized calorie / protein / water targets from the user's
// body stats (height, weight) and primary fitness goal. Targets are written
// into user_settings so they flow to the Health tab and dashboard, and can
// still be overridden manually from Settings.
package handlers

import (
	"encoding/json"
	"log"
	"math"
	"net/http"

	"resolution-fitnessapp-backend/database"
	"resolution-fitnessapp-backend/models"
	"resolution-fitnessapp-backend/utils"
)

// ── Goal Recommendation Logic ────────────────────────────────────────

// recommendedGoals estimates daily targets from body stats and goal.
//
//   - Calories: maintenance ≈ 33 kcal per kg of body weight, then adjusted
//     for the goal (deficit for weight loss, surplus for muscle gain).
//   - Protein:  1.4–2.0 g per kg depending on the goal.
//   - Water:    ~35 ml per kg of body weight.
//
// These are starting estimates — the user can fine-tune any target from
// Settings (Daily Targets).
func recommendedGoals(heightCm, weightKg float64, primaryGoal string) models.RecommendedGoals {
	goal := normalizeGoal(primaryGoal)

	// ── Calories ────────────────────────────────────────────────
	maintenance := weightKg * 33.0
	var factor float64
	switch goal {
	case "lose_weight":
		factor = 0.80 // 20% deficit
	case "build_muscle", "strength":
		factor = 1.10 // 10% surplus
	case "get_toned":
		factor = 0.95 // mild deficit
	default:
		factor = 1.0 // general fitness → maintenance
	}
	calories := clamp(roundTo(maintenance*factor, 10), 1200, 4000)

	// ── Protein ─────────────────────────────────────────────────
	var proteinPerKg float64
	switch goal {
	case "build_muscle", "strength", "lose_weight":
		proteinPerKg = 2.0
	case "get_toned":
		proteinPerKg = 1.6
	default:
		proteinPerKg = 1.4
	}
	protein := clamp(roundTo(weightKg*proteinPerKg, 5), 40, 250)

	// ── Water ───────────────────────────────────────────────────
	water := clamp(roundTo(weightKg*35.0, 50), 1000, 5000)

	_ = heightCm // height is stored for reference; not needed by the estimate

	return models.RecommendedGoals{
		CalorieTarget:      int(calories),
		ProteinTargetGrams: int(protein),
		WaterGoalMl:        int(water),
	}
}

// applyRecommendedGoals computes targets from body stats and persists them
// into the user's settings row (creating it if needed). Returns the goals.
func applyRecommendedGoals(userID string, heightCm, weightKg float64, primaryGoal string) (models.RecommendedGoals, error) {
	goals := recommendedGoals(heightCm, weightKg, primaryGoal)

	// Ensure a settings row exists before updating it.
	if _, err := database.DB.Exec(`
		INSERT OR IGNORE INTO user_settings (user_id, created_at, updated_at)
		VALUES (?, datetime('now'), datetime('now'))
	`, userID); err != nil {
		return goals, err
	}

	_, err := database.DB.Exec(`
		UPDATE user_settings SET
			calorie_target = ?, protein_target_grams = ?, water_goal_ml = ?,
			updated_at = datetime('now')
		WHERE user_id = ?
	`, goals.CalorieTarget, goals.ProteinTargetGrams, goals.WaterGoalMl, userID)
	return goals, err
}

// RecalculateGoals handles POST /api/profile/goals.
// Recomputes the user's daily calorie / protein / water targets from their
// current height, weight, and goal. Accepts optional heightCm / weightKg /
// primaryGoal in the body; when omitted, existing profile values are used.
func RecalculateGoals(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	if userID == "" {
		utils.WriteError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	var req struct {
		HeightCm    float64 `json:"heightCm,omitempty"`
		WeightKg    float64 `json:"weightKg,omitempty"`
		PrimaryGoal string  `json:"primaryGoal,omitempty"`
		Gender      string  `json:"gender,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Fall back to stored profile values for anything not provided.
	var storedHeight, storedWeight float64
	var storedGoal string
	database.DB.QueryRow(`
		SELECT COALESCE(height_cm, 0), COALESCE(weight_kg, 0), COALESCE(primary_goal, 'general')
		FROM users WHERE id = ?
	`, userID).Scan(&storedHeight, &storedWeight, &storedGoal)

	heightCm := req.HeightCm
	if heightCm <= 0 {
		heightCm = storedHeight
	}
	weightKg := req.WeightKg
	if weightKg <= 0 {
		weightKg = storedWeight
	}
	primaryGoal := req.PrimaryGoal
	if primaryGoal == "" {
		primaryGoal = storedGoal
	}

	if heightCm <= 0 || weightKg <= 0 {
		utils.WriteError(w, http.StatusBadRequest, "Height and weight are required to assess goals")
		return
	}

	// Keep the profile in sync when new stats were provided.
	if req.HeightCm > 0 || req.WeightKg > 0 || req.Gender != "" {
		if _, err := database.DB.Exec(`
			UPDATE users SET
				height_cm = ?, weight_kg = ?, gender = CASE WHEN ? = '' THEN gender ELSE ? END,
				updated_at = datetime('now')
			WHERE id = ?
		`, heightCm, weightKg, req.Gender, req.Gender, userID); err != nil {
			log.Printf("ERROR updating body stats (id=%s): %v", userID, err)
		}
	}

	goals, err := applyRecommendedGoals(userID, heightCm, weightKg, primaryGoal)
	if err != nil {
		log.Printf("ERROR persisting recommended goals (id=%s): %v", userID, err)
		utils.WriteError(w, http.StatusInternalServerError, "Failed to save recommended goals")
		return
	}

	utils.WriteSuccess(w, goals, "Daily goals updated from your body stats")
}

// ── Small numeric helpers ────────────────────────────────────────────

func normalizeGoal(goal string) string {
	switch goal {
	case "build_muscle", "muscle_gain", "strength", "lose_weight", "weight_loss", "get_toned", "endurance":
		if goal == "muscle_gain" {
			return "build_muscle"
		}
		if goal == "weight_loss" {
			return "lose_weight"
		}
		return goal
	default:
		return "general"
	}
}

func roundTo(v, step float64) float64 {
	return math.Round(v/step) * step
}

func clamp(v, min, max float64) float64 {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}
