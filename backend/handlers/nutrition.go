// Package handlers — nutrition and food tracking endpoints.
// Covers meal logging, food scanning, water intake, and nutrition summaries.
package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"resolution-fitnessapp-backend/database"
	"resolution-fitnessapp-backend/models"
	"resolution-fitnessapp-backend/utils"

	"github.com/google/uuid"
)

// ── Daily Nutrition ─────────────────────────────────────────────────

// GetDailyNutrition handles GET /api/nutrition/daily.
// Returns today's nutrition summary with all meals and macros.
// Query param: ?date=2025-04-07 for a specific date.
func GetDailyNutrition(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	date := r.URL.Query().Get("date")
	if date == "" {
		date = utils.TodayString()
	}

	// Fetch meals for the date
	meals := fetchMealsByDate(userID, date)

	// Calculate totals
	var totalCal, totalWater int
	var totalProtein, totalCarbs, totalFat float64
	for _, meal := range meals {
		totalCal += meal.TotalCalories
		totalProtein += meal.TotalProteinG
		totalCarbs += meal.TotalCarbsG
		totalFat += meal.TotalFatG
	}

	// Fetch water intake
	database.DB.QueryRow(`
		SELECT COALESCE(SUM(amount_ml), 0) FROM water_logs WHERE user_id = ? AND log_date = ?
	`, userID, date).Scan(&totalWater)

	// Fetch targets from settings
	var calorieTarget, proteinTarget, waterGoal int
	database.DB.QueryRow(`
		SELECT calorie_target, protein_target_grams, water_goal_ml
		FROM user_settings WHERE user_id = ?
	`, userID).Scan(&calorieTarget, &proteinTarget, &waterGoal)

	summary := models.DailyNutrition{
		Date:          date,
		TotalCalories: totalCal,
		TotalProteinG: totalProtein,
		TotalCarbsG:   totalCarbs,
		TotalFatG:     totalFat,
		WaterMl:       totalWater,
		WaterGoalMl:   waterGoal,
		CalorieTarget: calorieTarget,
		ProteinTarget: float64(proteinTarget),
		Meals:         meals,
	}

	utils.WriteSuccess(w, summary, "Daily nutrition retrieved")
}

// ── Meal Logging ─────────────────────────────────────────────────────

// CreateMeal handles POST /api/nutrition/meals.
// Logs a new meal with food items.
func CreateMeal(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	var req models.CreateMealRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if errMsg := utils.ValidateMealType(req.MealType); errMsg != "" {
		utils.WriteError(w, http.StatusBadRequest, errMsg)
		return
	}

	logDate := req.LogDate
	if logDate == "" {
		logDate = utils.TodayString()
	}

	// Calculate totals from items
	var totalCal int
	var totalProtein, totalCarbs, totalFat float64
	for _, item := range req.Items {
		totalCal += item.Calories
		totalProtein += item.ProteinG
		totalCarbs += item.CarbsG
		totalFat += item.FatG
	}

	// Create food log
	mealID := uuid.New().String()
	linkedID := req.LinkedSessionID

	_, err := database.DB.Exec(`
		INSERT INTO food_logs (id, user_id, log_date, meal_type, linked_session_id,
			total_calories, total_protein_g, total_carbs_g, total_fat_g, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
	`, mealID, userID, logDate, req.MealType, linkedID,
		totalCal, totalProtein, totalCarbs, totalFat)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to log meal")
		return
	}

	// Create food items
	for i, item := range req.Items {
		itemID := uuid.New().String()
		flagsJSON, _ := json.Marshal(item.AllergenFlags)
		source := item.Source
		if source == "" {
			source = "manual"
		}
		database.DB.Exec(`
			INSERT INTO food_items (id, food_log_id, name, serving_size, calories,
				protein_g, carbs_g, fat_g, health_score, health_notes,
				allergen_flags, photo_url, source, sort_order)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, itemID, mealID, item.Name, item.ServingSize, item.Calories,
			item.ProteinG, item.CarbsG, item.FatG, item.HealthScore, item.HealthNotes,
			string(flagsJSON), item.PhotoURL, source, i)
	}

	meal, _ := fetchMealByID(mealID, userID)
	utils.WriteCreated(w, meal, "Meal logged")
}

// UpdateMeal handles PUT /api/nutrition/meals/{mealId}.
func UpdateMeal(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	mealID := r.PathValue("mealId")

	// Verify ownership
	var ownerID string
	err := database.DB.QueryRow("SELECT user_id FROM food_logs WHERE id = ?", mealID).Scan(&ownerID)
	if err != nil || ownerID != userID {
		utils.WriteError(w, http.StatusNotFound, "Meal not found")
		return
	}

	var req models.CreateMealRequest
	json.NewDecoder(r.Body).Decode(&req)

	// Recalculate totals
	var totalCal int
	var totalProtein, totalCarbs, totalFat float64
	for _, item := range req.Items {
		totalCal += item.Calories
		totalProtein += item.ProteinG
		totalCarbs += item.CarbsG
		totalFat += item.FatG
	}

	// Update food log
	database.DB.Exec(`
		UPDATE food_logs SET meal_type = ?, total_calories = ?, total_protein_g = ?,
		       total_carbs_g = ?, total_fat_g = ?
		WHERE id = ?
	`, req.MealType, totalCal, totalProtein, totalCarbs, totalFat, mealID)

	// Replace food items
	database.DB.Exec("DELETE FROM food_items WHERE food_log_id = ?", mealID)
	for i, item := range req.Items {
		itemID := uuid.New().String()
		flagsJSON, _ := json.Marshal(item.AllergenFlags)
		source := item.Source
		if source == "" { source = "manual" }
		database.DB.Exec(`
			INSERT INTO food_items (id, food_log_id, name, serving_size, calories,
				protein_g, carbs_g, fat_g, health_score, health_notes,
				allergen_flags, photo_url, source, sort_order)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, itemID, mealID, item.Name, item.ServingSize, item.Calories,
			item.ProteinG, item.CarbsG, item.FatG, item.HealthScore, item.HealthNotes,
			string(flagsJSON), item.PhotoURL, source, i)
	}

	meal, _ := fetchMealByID(mealID, userID)
	utils.WriteSuccess(w, meal, "Meal updated")
}

// DeleteMeal handles DELETE /api/nutrition/meals/{mealId}.
func DeleteMeal(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	mealID := r.PathValue("mealId")

	var ownerID string
	err := database.DB.QueryRow("SELECT user_id FROM food_logs WHERE id = ?", mealID).Scan(&ownerID)
	if err != nil || ownerID != userID {
		utils.WriteError(w, http.StatusNotFound, "Meal not found")
		return
	}

	database.DB.Exec("DELETE FROM food_logs WHERE id = ?", mealID)
	utils.WriteSuccess(w, nil, "Meal deleted")
}

// ── Water Intake ─────────────────────────────────────────────────────

// LogWater handles POST /api/nutrition/water.
// Logs water intake (adds to today's total).
func LogWater(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	var req models.LogWaterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.AmountMl <= 0 || req.AmountMl > 5000 {
		utils.WriteError(w, http.StatusBadRequest, "Amount must be between 1 and 5000 ml")
		return
	}

	logDate := req.LogDate
	if logDate == "" {
		logDate = utils.TodayString()
	}

	id := uuid.New().String()
	database.DB.Exec(`
		INSERT INTO water_logs (id, user_id, log_date, amount_ml, logged_at)
		VALUES (?, ?, ?, ?, datetime('now'))
	`, id, userID, logDate, req.AmountMl)

	// Return updated total
	var totalMl int
	var waterGoal int
	database.DB.QueryRow(`
		SELECT COALESCE(SUM(amount_ml), 0) FROM water_logs WHERE user_id = ? AND log_date = ?
	`, userID, logDate).Scan(&totalMl)
	database.DB.QueryRow("SELECT water_goal_ml FROM user_settings WHERE user_id = ?", userID).Scan(&waterGoal)

	utils.WriteCreated(w, map[string]interface{}{
		"entry":    models.WaterLog{ID: id, UserID: userID, LogDate: logDate, AmountMl: req.AmountMl},
		"totalMl":  totalMl,
		"goalMl":   waterGoal,
		"glasses":  totalMl / 250,
	}, "Water logged")
}

// ── Weekly Nutrition ─────────────────────────────────────────────────

// GetWeeklyNutrition handles GET /api/nutrition/weekly.
// Returns aggregated nutrition data for the past 7 days.
func GetWeeklyNutrition(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	startDate := utils.WeekStartString()
	endDate := utils.WeekEndString()

	// Sum calories and macros for the week
	var totalCal, daysTracked int
	var totalProtein, totalCarbs, totalFat float64
	rows, _ := database.DB.Query(`
		SELECT log_date, SUM(total_calories), SUM(total_protein_g),
		       SUM(total_carbs_g), SUM(total_fat_g)
		FROM food_logs
		WHERE user_id = ? AND log_date BETWEEN ? AND ?
		GROUP BY log_date
	`, userID, startDate, endDate)
	defer rows.Close()

	for rows.Next() {
		var date string
		var cal int
		var pro, carb, fat float64
		rows.Scan(&date, &cal, &pro, &carb, &fat)
		totalCal += cal
		totalProtein += pro
		totalCarbs += carb
		totalFat += fat
		daysTracked++
	}

	// Average water
	var totalWater int
	database.DB.QueryRow(`
		SELECT COALESCE(SUM(amount_ml), 0) FROM water_logs
		WHERE user_id = ? AND log_date BETWEEN ? AND ?
	`, userID, startDate, endDate).Scan(&totalWater)

	// Adherence rate: days that hit calorie target (>80%)
	var calorieTarget, adherenceDays int
	database.DB.QueryRow("SELECT calorie_target FROM user_settings WHERE user_id = ?", userID).Scan(&calorieTarget)
	rows2, _ := database.DB.Query(`
		SELECT SUM(total_calories) FROM food_logs
		WHERE user_id = ? AND log_date BETWEEN ? AND ?
		GROUP BY log_date
	`, userID, startDate, endDate)
	defer rows2.Close()
	for rows2.Next() {
		var cal int
		rows2.Scan(&cal)
		if calorieTarget > 0 && float64(cal) >= float64(calorieTarget)*0.8 {
			adherenceDays++
		}
	}

	adherenceRate := 0.0
	if daysTracked > 0 {
		adherenceRate = float64(adherenceDays) / 7.0 * 100
	}

	weekly := models.WeeklyNutrition{
		StartDate:        startDate,
		EndDate:          endDate,
		AvgDailyCalories: safeDiv(float64(totalCal), float64(daysTracked)),
		AvgProteinG:      safeDiv(totalProtein, float64(daysTracked)),
		AvgCarbsG:        safeDiv(totalCarbs, float64(daysTracked)),
		AvgFatG:          safeDiv(totalFat, float64(daysTracked)),
		AvgWaterMl:       safeDiv(float64(totalWater), 7.0),
		AdherenceRate:    adherenceRate,
	}

	utils.WriteSuccess(w, weekly, "Weekly nutrition retrieved")
}

// ── Food Scanner Placeholders ────────────────────────────────────────
// Full food scanning implementation lives in handlers/food_scan.go

// ── Meal Suggestions ─────────────────────────────────────────────────
// GetMealSuggestions handles GET /api/nutrition/suggestions.
// Returns personalized meal suggestions based on user profile, goals, and gaps.
func GetMealSuggestions(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	// Fetch user allergies/dietary prefs
	var allergiesJSON, dietaryJSON, primaryGoal string
	database.DB.QueryRow(`
		SELECT COALESCE(allergies, '[]'), COALESCE(dietary_prefs, '[]'), primary_goal
		FROM users WHERE id = ?
	`, userID).Scan(&allergiesJSON, &dietaryJSON, &primaryGoal)

	var allergies, dietaryPrefs []string
	json.Unmarshal([]byte(allergiesJSON), &allergies)
	json.Unmarshal([]byte(dietaryJSON), &dietaryPrefs)

	// Generate suggestions based on user profile
	suggestions := generateMealSuggestions(primaryGoal, allergies, dietaryPrefs)

	// Add context-aware suggestions based on today's workout
	var recentWorkout string
	database.DB.QueryRow(`
		SELECT workout_name FROM workout_sessions
		WHERE user_id = ? AND completed = 1
		ORDER BY date DESC LIMIT 1
	`, userID).Scan(&recentWorkout)

	if recentWorkout != "" {
		suggestions = append([]models.MealSuggestion{{
			Title:       "Post-Workout Recovery 🏋️",
			Description: "After your \"" + recentWorkout + "\", refuel with this protein-rich meal.",
			Foods:       []string{"Grilled chicken breast", "Sweet potato", "Steamed broccoli"},
			Calories:    450,
			ProteinG:    42,
			CarbsG:      45,
			FatG:        12,
			Reason:      "Protein aids muscle repair. Sweet potato replenishes glycogen stores.",
			Tags:        []string{"postworkout", "high-protein"},
		}}, suggestions...)
	}

	if len(suggestions) > 5 {
		suggestions = suggestions[:5]
	}

	utils.WriteSuccess(w, suggestions, "Suggestions retrieved")
}

// ── Helper Functions ─────────────────────────────────────────────────

// fetchMealsByDate retrieves all meals for a user on a specific date.
func fetchMealsByDate(userID, date string) []models.FoodLog {
	rows, err := database.DB.Query(`
		SELECT id, user_id, log_date, meal_type,
		       COALESCE(linked_session_id, ''), total_calories,
		       total_protein_g, total_carbs_g, total_fat_g, created_at
		FROM food_logs
		WHERE user_id = ? AND log_date = ?
		ORDER BY created_at
	`, userID, date)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var meals []models.FoodLog
	for rows.Next() {
		var m models.FoodLog
		rows.Scan(&m.ID, &m.UserID, &m.LogDate, &m.MealType,
			&m.LinkedSessionID, &m.TotalCalories,
			&m.TotalProteinG, &m.TotalCarbsG, &m.TotalFatG, &m.CreatedAt)

		m.Items = fetchFoodItems(m.ID)
		meals = append(meals, m)
	}

	if meals == nil {
		meals = []models.FoodLog{}
	}
	return meals
}

// fetchMealByID retrieves a single meal with its items.
func fetchMealByID(mealID, userID string) (*models.FoodLog, error) {
	var m models.FoodLog
	err := database.DB.QueryRow(`
		SELECT id, user_id, log_date, meal_type,
		       COALESCE(linked_session_id, ''), total_calories,
		       total_protein_g, total_carbs_g, total_fat_g, created_at
		FROM food_logs WHERE id = ? AND user_id = ?
	`, mealID, userID).Scan(&m.ID, &m.UserID, &m.LogDate, &m.MealType,
		&m.LinkedSessionID, &m.TotalCalories,
		&m.TotalProteinG, &m.TotalCarbsG, &m.TotalFatG, &m.CreatedAt)
	if err != nil {
		return nil, err
	}

	m.Items = fetchFoodItems(m.ID)
	return &m, nil
}

// fetchFoodItems retrieves all items for a food log.
func fetchFoodItems(foodLogID string) []models.FoodItem {
	rows, err := database.DB.Query(`
		SELECT id, food_log_id, name, COALESCE(serving_size, ''), calories,
		       protein_g, carbs_g, fat_g, COALESCE(health_score, 0),
		       COALESCE(health_notes, ''), COALESCE(allergen_flags, '[]'),
		       COALESCE(photo_url, ''), COALESCE(source, 'manual'), sort_order
		FROM food_items WHERE food_log_id = ? ORDER BY sort_order
	`, foodLogID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var items []models.FoodItem
	for rows.Next() {
		var item models.FoodItem
		var flagsJSON string
		rows.Scan(&item.ID, &item.FoodLogID, &item.Name, &item.ServingSize,
			&item.Calories, &item.ProteinG, &item.CarbsG, &item.FatG,
			&item.HealthScore, &item.HealthNotes, &flagsJSON,
			&item.PhotoURL, &item.Source, &item.SortOrder)
		json.Unmarshal([]byte(flagsJSON), &item.AllergenFlags)
		if item.AllergenFlags == nil { item.AllergenFlags = []string{} }
		items = append(items, item)
	}

	if items == nil {
		items = []models.FoodItem{}
	}
	return items
}

// generateMealSuggestions returns personalized meal suggestions based on user profile.
func generateMealSuggestions(goal string, allergies, dietaryPrefs []string) []models.MealSuggestion {
	allSuggestions := []models.MealSuggestion{
		{
			Title: "Lean & Green 🥗", Description: "Balanced meal for weight management.",
			Foods: []string{"Grilled salmon", "Quinoa", "Steamed asparagus"},
			Calories: 420, ProteinG: 35, CarbsG: 30, FatG: 18,
			Reason: "Salmon provides omega-3s and protein. Quinoa is a complete plant protein.",
			Tags:   []string{"balanced", "omega-3"},
		},
		{
			Title: "Muscle Builder 💪", Description: "High-protein meal for muscle gain.",
			Foods: []string{"Lean beef steak", "Brown rice", "Roasted vegetables"},
			Calories: 580, ProteinG: 45, CarbsG: 55, FatG: 15,
			Reason: "Beef is rich in creatine and amino acids for muscle synthesis.",
			Tags:   []string{"high-protein", "muscle-gain"},
		},
		{
			Title: "Quick Energy ⚡", Description: "Light pre-workout energy boost.",
			Foods: []string{"Banana", "Greek yogurt", "Honey drizzle"},
			Calories: 280, ProteinG: 15, CarbsG: 45, FatG: 3,
			Reason: "Fast-digesting carbs with moderate protein. Great 60min before training.",
			Tags:   []string{"preworkout", "energy"},
		},
		{
			Title: "Recovery Bowl 🍚", Description: "Post-workout recovery meal.",
			Foods: []string{"Chicken breast", "Sweet potato mash", "Spinach"},
			Calories: 480, ProteinG: 40, CarbsG: 50, FatG: 10,
			Reason: "Lean protein for repair + complex carbs to replenish glycogen.",
			Tags:   []string{"postworkout", "recovery"},
		},
		{
			Title: "Plant Power 🌱", Description: "Vegan protein-packed meal.",
			Foods: []string{"Lentil curry", "Brown rice", "Roasted chickpeas"},
			Calories: 450, ProteinG: 25, CarbsG: 60, FatG: 12,
			Reason: "Lentils and chickpeas provide complete amino acid profile when combined with rice.",
			Tags:   []string{"vegan", "plant-based"},
		},
	}

	// Filter by dietary preferences
	var filtered []models.MealSuggestion
	for _, s := range allSuggestions {
		skip := false
		for _, pref := range dietaryPrefs {
			if pref == "vegan" || pref == "vegetarian" {
				// Keep plant-based options
				hasVegan := false
				for _, tag := range s.Tags {
					if tag == "vegan" || tag == "plant-based" {
						hasVegan = true
					}
				}
				if !hasVegan && pref == "vegan" {
					skip = true
				}
			}
		}
		if !skip {
			filtered = append(filtered, s)
		}
	}

	if len(filtered) == 0 {
		filtered = allSuggestions
	}
	return filtered
}

// safeDiv handles division by zero for float values.
func safeDiv(a, b float64) float64 {
	if b == 0 {
		return 0
	}
	return a / b
}

// Ensure strconv is used
var _ = strconv.Itoa
