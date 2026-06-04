// Package handlers — food photo scanning endpoint.
// POST /api/food-scan accepts a food photo, processes it, and returns
// nutritional analysis. In production, this sends the image to OpenAI Vision API.
// For development, it returns a simulated analysis.
package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"resolution-fitnessapp-backend/database"
	"resolution-fitnessapp-backend/models"
	"resolution-fitnessapp-backend/utils"

	"github.com/google/uuid"
)

// ScanFood handles POST /api/food-scan.
// Accepts a multipart form with a "foodPhoto" file field.
// Returns AI-generated nutritional analysis of the food.
//
// In production: sends photo to OpenAI Vision API for real analysis.
// In development: returns a simulated response based on common foods.
func ScanFood(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	// ── Limit upload size ─────────────────────────────────────────
	r.Body = http.MaxBytesReader(w, r.Body, utils.MaxUploadSize)

	if err := r.ParseMultipartForm(utils.MaxUploadSize); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "File too large. Max 10MB")
		return
	}

	file, header, err := r.FormFile("foodPhoto")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "No food photo provided")
		return
	}
	defer file.Close()

	// ── Save the photo ────────────────────────────────────────────
	photoURL, err := utils.SaveUpload(file, header.Filename, "uploads")
	if err != nil {
		if strings.Contains(err.Error(), "invalid file type") {
			utils.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		utils.WriteError(w, http.StatusInternalServerError, "Failed to save photo")
		return
	}

	// ── Generate simulated analysis ───────────────────────────────
	// In production, this is where you'd call OpenAI Vision API.
	// For now, we simulate a response based on the user's context.
	analysis := simulateFoodAnalysis(userID)

	// ── Check for user allergies ──────────────────────────────────
	var allergiesJSON string
	database.DB.QueryRow(
		"SELECT COALESCE(allergies, '[]') FROM users WHERE id = ?", userID,
	).Scan(&allergiesJSON)
	var userAllergies []string
	json.Unmarshal([]byte(allergiesJSON), &userAllergies)

	// Simulate allergen flagging
	allergenFlags := []string{}
	for _, allergy := range userAllergies {
		for _, food := range analysis.DetectedFoods {
			if containsAllergen(food, allergy) {
				allergenFlags = append(allergenFlags, allergy)
			}
		}
	}
	analysis.AllergenFlags = allergenFlags

	// ── Save scan to history ──────────────────────────────────────
	scanID := uuid.New().String()
	detectedJSON, _ := json.Marshal(analysis.DetectedFoods)
	flagsJSON, _ := json.Marshal(allergenFlags)

	database.DB.Exec(`
		INSERT INTO scanned_foods (id, user_id, photo_url, detected_foods,
			estimated_serving, calories, protein_g, carbs_g, fat_g,
			health_score, health_facts, allergen_flags, was_logged, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
	`, scanID, userID, photoURL, string(detectedJSON),
		analysis.EstimatedServing, analysis.Calories, analysis.ProteinG,
		analysis.CarbsG, analysis.FatG, analysis.HealthScore,
		analysis.HealthFacts, string(flagsJSON))

	analysis.ID = scanID
	analysis.PhotoURL = photoURL

	utils.WriteSuccess(w, analysis, "Food analyzed!")
}

// LogScannedFood handles POST /api/food-scan/log.
// Confirms a scanned food result and logs it as a meal.
func LogScannedFood(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	var req models.LogScannedFoodRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.ScanID == "" {
		utils.WriteError(w, http.StatusBadRequest, "Scan ID is required")
		return
	}
	if errMsg := utils.ValidateMealType(req.MealType); errMsg != "" {
		utils.WriteError(w, http.StatusBadRequest, errMsg)
		return
	}

	// Fetch scan result
	var scan models.ScannedFood
	var detectedJSON, flagsJSON string
	err := database.DB.QueryRow(`
		SELECT id, user_id, photo_url, detected_foods, COALESCE(estimated_serving, ''),
		       calories, protein_g, carbs_g, fat_g, health_score,
		       COALESCE(health_facts, ''), COALESCE(allergen_flags, '[]'), created_at
		FROM scanned_foods WHERE id = ? AND user_id = ?
	`, req.ScanID, userID).Scan(&scan.ID, &scan.UserID, &scan.PhotoURL,
		&detectedJSON, &scan.EstimatedServing,
		&scan.Calories, &scan.ProteinG, &scan.CarbsG, &scan.FatG,
		&scan.HealthScore, &scan.HealthFacts, &flagsJSON, &scan.CreatedAt)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "Scanned food not found")
		return
	}

	json.Unmarshal([]byte(detectedJSON), &scan.DetectedFoods)
	json.Unmarshal([]byte(flagsJSON), &scan.AllergenFlags)

	// Create food log from scan
	mealID := uuid.New().String()
	database.DB.Exec(`
		INSERT INTO food_logs (id, user_id, log_date, meal_type, total_calories,
			total_protein_g, total_carbs_g, total_fat_g, created_at)
		VALUES (?, ?, date('now'), ?, ?, ?, ?, ?, datetime('now'))
	`, mealID, userID, req.MealType, scan.Calories, scan.ProteinG, scan.CarbsG, scan.FatG)

	// Create food items from detected foods
	for i, foodName := range scan.DetectedFoods {
		itemID := uuid.New().String()
		flagsJSON, _ := json.Marshal(scan.AllergenFlags)
		database.DB.Exec(`
			INSERT INTO food_items (id, food_log_id, name, serving_size, calories,
				protein_g, carbs_g, fat_g, health_score, health_notes,
				allergen_flags, photo_url, source, sort_order)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scan', ?)
		`, itemID, mealID, foodName, scan.EstimatedServing,
			scan.Calories, scan.ProteinG, scan.CarbsG, scan.FatG,
			scan.HealthScore, scan.HealthFacts,
			string(flagsJSON), scan.PhotoURL, i)
	}

	// Mark scan as logged
	database.DB.Exec(`
		UPDATE scanned_foods SET was_logged = 1, logged_meal_type = ? WHERE id = ?
	`, req.MealType, req.ScanID)

	meal, _ := fetchMealByID(mealID, userID)
	utils.WriteCreated(w, meal, "Scanned food logged as "+req.MealType+" meal")
}

// GetScanHistory handles GET /api/food-scan/history.
// Lists previously scanned foods for the authenticated user.
func GetScanHistory(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	rows, err := database.DB.Query(`
		SELECT id, user_id, photo_url, detected_foods, COALESCE(estimated_serving, ''),
		       calories, protein_g, carbs_g, fat_g, health_score,
		       COALESCE(health_facts, ''), COALESCE(allergen_flags, '[]'),
		       was_logged, COALESCE(logged_meal_type, ''), created_at
		FROM scanned_foods WHERE user_id = ?
		ORDER BY created_at DESC LIMIT 30
	`, userID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to fetch scan history")
		return
	}
	defer rows.Close()

	var scans []models.ScannedFood
	for rows.Next() {
		var scan models.ScannedFood
		var detectedJSON, flagsJSON string
		var wasLogged int
		rows.Scan(&scan.ID, &scan.UserID, &scan.PhotoURL, &detectedJSON,
			&scan.EstimatedServing, &scan.Calories, &scan.ProteinG,
			&scan.CarbsG, &scan.FatG, &scan.HealthScore,
			&scan.HealthFacts, &flagsJSON, &wasLogged, &scan.LoggedMealType,
			&scan.CreatedAt)
		json.Unmarshal([]byte(detectedJSON), &scan.DetectedFoods)
		json.Unmarshal([]byte(flagsJSON), &scan.AllergenFlags)
		scan.WasLogged = wasLogged == 1
		scans = append(scans, scan)
	}

	if scans == nil {
		scans = []models.ScannedFood{}
	}

	utils.WriteSuccess(w, scans, "Scan history retrieved")
}

// ── Helper Functions ─────────────────────────────────────────────────

// simulateFoodAnalysis returns a simulated food analysis.
// In production, replace with OpenAI Vision API call.
func simulateFoodAnalysis(userID string) models.ScannedFood {
	// Fetch user's goal for context-aware analysis
	var primaryGoal, displayName string
	database.DB.QueryRow(
		"SELECT COALESCE(display_name, 'Athlete'), COALESCE(primary_goal, 'general') FROM users WHERE id = ?",
		userID,
	).Scan(&displayName, &primaryGoal)

	// Return a realistic simulated analysis
	analysis := models.ScannedFood{
		DetectedFoods:    []string{"Grilled Chicken Breast", "Brown Rice", "Steamed Broccoli"},
		EstimatedServing: "~400g total plate",
		Calories:         480,
		ProteinG:         42,
		CarbsG:           45,
		FatG:             12,
		HealthScore:      8,
		HealthFacts:      "This is a well-balanced meal! High in lean protein (42g) for muscle repair, complex carbs for sustained energy, and fiber from broccoli. Low in saturated fat. A very healthy choice for muscle gain and general fitness. 💪",
	}

	_ = primaryGoal
	_ = displayName

	return analysis
}

// containsAllergen checks if a food name contains an allergen keyword.
// This is a simplified simulation — in production, the AI would provide this.
func containsAllergen(foodName, allergen string) bool {
	food := strings.ToLower(foodName)
	allergen = strings.ToLower(allergen)

	allergenMap := map[string][]string{
		"peanuts":  {"peanut", "satay"},
		"dairy":    {"cheese", "milk", "cream", "butter", "yogurt", "whey"},
		"gluten":   {"bread", "pasta", "wheat", "flour", "noodle", "barley", "rye"},
		"eggs":     {"egg", "mayo", "mayonnaise"},
		"soy":      {"soy", "tofu", "edamame", "soya"},
		"fish":     {"fish", "salmon", "tuna", "cod", "tilapia"},
		"shellfish": {"shrimp", "crab", "lobster", "prawn", "mussel", "oyster"},
		"sesame":   {"sesame", "tahini"},
		"tree nuts": {"almond", "walnut", "cashew", "pecan", "pistachio", "hazelnut"},
	}

	keywords, ok := allergenMap[allergen]
	if !ok {
		return false
	}

	for _, keyword := range keywords {
		if strings.Contains(food, keyword) {
			return true
		}
	}
	return false
}
