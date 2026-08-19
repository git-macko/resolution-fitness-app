// Package handlers — unit tests for personalized meal suggestion ranking.
package handlers

import (
	"testing"

	"resolution-fitnessapp-backend/models"
)

// TestMealGoalRelevance verifies the goal-based relevance scoring puts the
// right meals first for each primary fitness goal.
func TestMealGoalRelevance(t *testing.T) {
	highProtein := models.MealSuggestion{ProteinG: 40, Calories: 580}
	lowCal := models.MealSuggestion{ProteinG: 15, Calories: 280}
	balanced := models.MealSuggestion{ProteinG: 25, Calories: 450}

	// Muscle gain / strength favor protein-forward meals.
	if mealGoalRelevance("build_muscle", highProtein) <= mealGoalRelevance("build_muscle", balanced) {
		t.Error("build_muscle should rank high-protein meals above balanced ones")
	}
	// Weight loss favors lower-calorie meals.
	if mealGoalRelevance("lose_weight", lowCal) <= mealGoalRelevance("lose_weight", balanced) {
		t.Error("lose_weight should rank lower-calorie meals above heavier ones")
	}
	// Generic goals treat everything equally.
	if mealGoalRelevance("general", lowCal) != 1 {
		t.Error("general goal should give every suggestion the same base relevance")
	}
}

// TestGenerateMealSuggestions_GoalRanked verifies the returned suggestions
// are ordered by the user's primary goal: protein-forward first for muscle
// gain, lower-calorie first for weight loss.
func TestGenerateMealSuggestions_GoalRanked(t *testing.T) {
	muscle := generateMealSuggestions("build_muscle", nil, nil)
	if len(muscle) == 0 {
		t.Fatal("Expected at least one suggestion")
	}
	if muscle[0].ProteinG < muscle[len(muscle)-1].ProteinG {
		t.Errorf("Muscle goal: first suggestion (%s, %.0fg protein) should have >= protein than last (%s, %.0fg)",
			muscle[0].Title, muscle[0].ProteinG, muscle[len(muscle)-1].Title, muscle[len(muscle)-1].ProteinG)
	}

	loss := generateMealSuggestions("lose_weight", nil, nil)
	if loss[0].Calories > loss[len(loss)-1].Calories {
		t.Errorf("Weight-loss goal: first suggestion (%s, %d cal) should have <= calories than last (%s, %d cal)",
			loss[0].Title, loss[0].Calories, loss[len(loss)-1].Title, loss[len(loss)-1].Calories)
	}

	// Dietary filtering still applies after ranking.
	vegan := generateMealSuggestions("general", nil, []string{"vegan"})
	if len(vegan) == 0 {
		t.Fatal("Expected plant-based suggestions for a vegan user")
	}
	for _, s := range vegan {
		if !hasTag(s.Tags, "vegan") && !hasTag(s.Tags, "plant-based") {
			t.Errorf("Vegan user received non-vegan suggestion: %s (%v)", s.Title, s.Tags)
		}
	}
}

// hasTag reports whether tags contains the given value.
func hasTag(tags []string, value string) bool {
	for _, tag := range tags {
		if tag == value {
			return true
		}
	}
	return false
}
