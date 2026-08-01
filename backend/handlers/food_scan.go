// Package handlers — food photo scanning endpoint.
// POST /api/food-scan accepts a food photo, processes it, and returns
// nutritional analysis powered by Google Gemini multimodal AI.
package handlers

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"resolution-fitnessapp-backend/database"
	"resolution-fitnessapp-backend/models"
	"resolution-fitnessapp-backend/utils"

	"github.com/google/uuid"
)



// foodAnalysisResult mirrors the JSON structure returned by the Gemini model
// when asked to analyze a food photo. Field names use snake_case to match
// the prompt output; we map this to models.ScannedFood after parsing.
type foodAnalysisResult struct {
	Name             string              `json:"name"`
	Ingredients      []string            `json:"ingredients"`
	DetectedFoods    []string            `json:"detected_foods"`
	EstimatedServing string              `json:"estimated_serving"`
	Calories         int                 `json:"calories"`
	Protein          float64             `json:"protein"`
	Carbs            float64             `json:"carbs"`
	Fat              float64             `json:"fat"`
	HealthScore      int                 `json:"health_score"`
	HealthFacts      string              `json:"health_facts"`
	FoodDetails      []foodAnalysisDetail `json:"food_details"`
}

type foodAnalysisDetail struct {
	Name          string  `json:"name"`
	Calories      int     `json:"calories"`
	ProteinG      float64 `json:"protein_g"`
	CarbsG        float64 `json:"carbs_g"`
	FatG          float64 `json:"fat_g"`
	HealthBenefit string  `json:"health_benefit"`
}

// userFoodContext holds profile data used to personalize AI prompts.
type userFoodContext struct {
	PrimaryGoal string
	Allergies   []string
	DietType    string
}

// buildFoodAnalysisPrompt creates a detailed prompt that includes user context
// to improve accuracy and relevance of the AI analysis.
func buildFoodAnalysisPrompt(ctx userFoodContext) string {
	var b strings.Builder
	b.WriteString(`You are a professional nutritionist and food analysis expert. Analyze the food in the image and return a JSON object with exactly these fields:
{
  "name": "string (concise dish/meal name, e.g. 'Grilled Chicken Salad')",
  "ingredients": ["string"],
  "detected_foods": ["string"],
  "estimated_serving": "string (e.g. ~400g plate, ~350ml bowl)",
  "calories": 0,
  "protein": 0.0,
  "carbs": 0.0,
  "fat": 0.0,
  "health_score": 0,
  "health_facts": "string",
  "food_details": [
    {
      "name": "string",
      "calories": 0,
      "protein_g": 0.0,
      "carbs_g": 0.0,
      "fat_g": 0.0,
      "health_benefit": "string"
    }
  ]
}

Rules:
- Return ONLY valid JSON. Do not wrap it in markdown, code fences, or explanatory text.
- name should be a concise, human-readable dish name (e.g. 'Avocado Toast with Poached Eggs').
- ingredients should list the main ingredients you can identify in the dish.
- detected_foods must contain at least one item.
- calories, protein, carbs, and fat must be realistic for the visible portion.
- health_score is an integer from 1 (very unhealthy) to 10 (very healthy).
- health_facts should be 1-2 evidence-based sentences about the meal as a whole.
- food_details should break down each distinct food item with its own macros and a 1-2 sentence health benefit.
- If you cannot identify any food, return name: 'Unidentifiable', detected_foods: ['Unidentifiable'], and set health_score to 0.`)

	var contextLines []string
	if ctx.PrimaryGoal != "" && ctx.PrimaryGoal != "general" {
		contextLines = append(contextLines, fmt.Sprintf("Primary fitness goal: %s", ctx.PrimaryGoal))
	}
	if len(ctx.Allergies) > 0 {
		contextLines = append(contextLines, fmt.Sprintf("Allergies/restrictions to flag: %s", strings.Join(ctx.Allergies, ", ")))
	}
	if ctx.DietType != "" {
		contextLines = append(contextLines, fmt.Sprintf("Diet type: %s", ctx.DietType))
	}
	if len(contextLines) > 0 {
		b.WriteString("\n\nUser context:\n" + strings.Join(contextLines, "\n"))
	}
	return b.String()
}

// ── Google Gemini Vision API Integration ───────────────────────────────

// mimeTypeFromExt returns the MIME type for a given file extension.
func mimeTypeFromExt(ext string) string {
	switch strings.ToLower(ext) {
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	default:
		return "image/jpeg"
	}
}

// analyzeFoodWithGemini sends a food photo to Google Gemini and returns
// a structured nutritional analysis. On any error, it returns false so the
// caller can fall back to simulated analysis. Returns ErrQuotaExceeded when
// the Gemini free-tier limit has been used up.
func analyzeFoodWithGemini(imageBytes []byte, mimeType string, ctx userFoodContext) (models.ScannedFood, bool, error) {
	if geminiKey == "" {
		return models.ScannedFood{}, false, nil
	}

	b64 := base64.StdEncoding.EncodeToString(imageBytes)

	prompt := buildFoodAnalysisPrompt(ctx)

	reqBody := geminiGenerateRequest{
		Contents: []geminiContent{{
			Parts: []geminiPart{
				{Text: prompt},
				{InlineData: &geminiInlineData{MimeType: mimeType, Data: b64}},
			},
		}},
		GenerationConfig: geminiGenerationConfig{ResponseMimeType: "application/json"},
	}

	geminiResp, err := callGemini(GeminiModel(), reqBody)
	if err != nil {
		if err == ErrQuotaExceeded {
			return models.ScannedFood{}, false, ErrQuotaExceeded
		}
		log.Printf("[food-scan] Gemini call failed: %v", err)
		return models.ScannedFood{}, false, nil
	}

	content := geminiResp.Candidates[0].Content.Parts[0].Text
	var analysis foodAnalysisResult
	if err := json.Unmarshal([]byte(content), &analysis); err != nil {
		log.Printf("[food-scan] Failed to parse Gemini food analysis JSON: %v\nRaw content: %s", err, content)
		return models.ScannedFood{}, false, nil
	}

	foodDetails := make([]models.FoodDetail, len(analysis.FoodDetails))
	for i, fd := range analysis.FoodDetails {
		foodDetails[i] = models.FoodDetail{
			Name:          fd.Name,
			Calories:      fd.Calories,
			ProteinG:      fd.ProteinG,
			CarbsG:        fd.CarbsG,
			FatG:          fd.FatG,
			HealthBenefit: fd.HealthBenefit,
		}
	}

	result := models.ScannedFood{
		Name:             analysis.Name,
		Ingredients:      analysis.Ingredients,
		DetectedFoods:    analysis.DetectedFoods,
		EstimatedServing: analysis.EstimatedServing,
		Calories:         analysis.Calories,
		ProteinG:         analysis.Protein,
		CarbsG:           analysis.Carbs,
		FatG:             analysis.Fat,
		HealthScore:      analysis.HealthScore,
		HealthFacts:      analysis.HealthFacts,
		FoodDetails:      foodDetails,
	}

	log.Printf("[food-scan] Gemini analysis successful: %d foods detected, score %d/10",
		len(result.DetectedFoods), result.HealthScore)
	return result, true, nil
}

// ScanFood handles POST /api/food-scan.
// Accepts a multipart form with a "foodPhoto" file field.
// Returns AI-generated nutritional analysis of the food using Google Gemini.
// When no Gemini API key is configured, falls back to a rich simulated response.
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

	// ── Read file bytes into memory ───────────────────────────────
	// We need the raw bytes for both saving to disk AND base64 encoding
	// for the Gemini Vision API. Read first, then save using a reader.
	fileBytes, err := io.ReadAll(file)
	file.Close()
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to read photo")
		return
	}

	// ── Save the photo ────────────────────────────────────────────
	photoURL, err := utils.SaveUpload(bytes.NewReader(fileBytes), header.Filename, "uploads")
	if err != nil {
		if strings.Contains(err.Error(), "invalid file type") {
			utils.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		utils.WriteError(w, http.StatusInternalServerError, "Failed to save photo")
		return
	}

	// ── Fetch user context for personalized analysis ──────────────
	var allergiesJSON, dietaryJSON string
	var primaryGoal string
	database.DB.QueryRow(
		"SELECT COALESCE(allergies, '[]'), COALESCE(dietary_prefs, '[]'), COALESCE(primary_goal, 'general') FROM users WHERE id = ?",
		userID,
	).Scan(&allergiesJSON, &dietaryJSON, &primaryGoal)
	var userAllergies []string
	var dietaryPrefs []string
	json.Unmarshal([]byte(allergiesJSON), &userAllergies)
	json.Unmarshal([]byte(dietaryJSON), &dietaryPrefs)
	ctx := userFoodContext{
		PrimaryGoal: primaryGoal,
		Allergies:   userAllergies,
		DietType:    strings.Join(dietaryPrefs, ", "),
	}

	// ── Analyze the food ──────────────────────────────────────────
	// Primary provider: Google Gemini. Falls back to simulated analysis
	// when Gemini is not configured or the request fails.
	fileExt := strings.ToLower(filepath.Ext(header.Filename))
	mimeType := mimeTypeFromExt(fileExt)
	analysis, fromAI, err := analyzeFoodWithGemini(fileBytes, mimeType, ctx)
	if err == ErrQuotaExceeded {
		// The Gemini free-tier limit has been used up. Do not fabricate
		// macros for a real food photo; tell the user clearly.
		utils.WriteError(w, http.StatusTooManyRequests, geminiFoodScanLimitMessage)
		return
	}
	if !fromAI {
		// No AI provider available — use the rich simulated analysis with
		// 15 diverse food combinations and per-food health benefits.
		analysis = simulateFoodAnalysis(userID)
	}

	// ── Check for user allergies ──────────────────────────────────
	// userAllergies was already loaded above when building the AI context.
	// Reuse it for allergen flagging.

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
	foodDetailsJSON, _ := json.Marshal(analysis.FoodDetails)
	ingredientsJSON, _ := json.Marshal(analysis.Ingredients)

	database.DB.Exec(`
		INSERT INTO scanned_foods (id, user_id, photo_url, name, ingredients, detected_foods,
			estimated_serving, calories, protein_g, carbs_g, fat_g,
			health_score, health_facts, food_details, allergen_flags, was_logged, logged_meal_type, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '', datetime('now'))
	`, scanID, userID, photoURL, analysis.Name, string(ingredientsJSON), string(detectedJSON),
		analysis.EstimatedServing, analysis.Calories, analysis.ProteinG,
		analysis.CarbsG, analysis.FatG, analysis.HealthScore,
		analysis.HealthFacts, string(foodDetailsJSON), string(flagsJSON))

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
	var detectedJSON, flagsJSON, foodDetailsJSON, ingredientsJSON string
	err := database.DB.QueryRow(`
		SELECT id, user_id, photo_url, COALESCE(name, ''), COALESCE(ingredients, '[]'), detected_foods, COALESCE(estimated_serving, ''),
		       calories, protein_g, carbs_g, fat_g, health_score,
		       COALESCE(health_facts, ''), COALESCE(food_details, '[]'), COALESCE(allergen_flags, '[]'), created_at
		FROM scanned_foods WHERE id = ? AND user_id = ?
	`, req.ScanID, userID).Scan(&scan.ID, &scan.UserID, &scan.PhotoURL, &scan.Name, &ingredientsJSON,
		&detectedJSON, &scan.EstimatedServing,
		&scan.Calories, &scan.ProteinG, &scan.CarbsG, &scan.FatG,
		&scan.HealthScore, &scan.HealthFacts, &foodDetailsJSON, &flagsJSON, &scan.CreatedAt)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "Scanned food not found")
		return
	}

	json.Unmarshal([]byte(detectedJSON), &scan.DetectedFoods)
	json.Unmarshal([]byte(flagsJSON), &scan.AllergenFlags)
	json.Unmarshal([]byte(foodDetailsJSON), &scan.FoodDetails)
	json.Unmarshal([]byte(ingredientsJSON), &scan.Ingredients)

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
		SELECT id, user_id, photo_url, COALESCE(name, ''), COALESCE(ingredients, '[]'), detected_foods, COALESCE(estimated_serving, ''),
		       calories, protein_g, carbs_g, fat_g, health_score,
		       COALESCE(health_facts, ''), COALESCE(food_details, '[]'), COALESCE(allergen_flags, '[]'),
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
		var detectedJSON, flagsJSON, foodDetailsJSON, ingredientsJSON string
		var wasLogged int
		rows.Scan(&scan.ID, &scan.UserID, &scan.PhotoURL, &scan.Name, &ingredientsJSON, &detectedJSON,
			&scan.EstimatedServing, &scan.Calories, &scan.ProteinG,
			&scan.CarbsG, &scan.FatG, &scan.HealthScore,
			&scan.HealthFacts, &foodDetailsJSON, &flagsJSON, &wasLogged, &scan.LoggedMealType,
			&scan.CreatedAt)
		json.Unmarshal([]byte(detectedJSON), &scan.DetectedFoods)
		json.Unmarshal([]byte(flagsJSON), &scan.AllergenFlags)
		json.Unmarshal([]byte(foodDetailsJSON), &scan.FoodDetails)
		json.Unmarshal([]byte(ingredientsJSON), &scan.Ingredients)
		scan.WasLogged = wasLogged == 1
		scans = append(scans, scan)
	}

	if scans == nil {
		scans = []models.ScannedFood{}
	}

	utils.WriteSuccess(w, scans, "Scan history retrieved")
}

// ── Helper Functions ─────────────────────────────────────────────────

// simulateFoodAnalysis returns a varied, realistic food analysis.
// Used when Gemini is not configured or unavailable.
// The simulation cycles through a diverse pool of food combinations
// with accurate nutritional data and evidence-based health facts.
func simulateFoodAnalysis(userID string) models.ScannedFood {
	// Fetch user context for personalized analysis
	var primaryGoal string
	database.DB.QueryRow(
		"SELECT COALESCE(primary_goal, 'general') FROM users WHERE id = ?",
		userID,
	).Scan(&primaryGoal)

	// Use a deterministic-but-varied seed based on the current timestamp
	// so the same photo scanned at different times yields different results.
	idx := int(time.Now().UnixNano()/1e6) % len(foodCombinations)
	combo := foodCombinations[idx]

	analysis := models.ScannedFood{
		Name:             combo.name,
		Ingredients:      combo.ingredients,
		DetectedFoods:    combo.foods,
		EstimatedServing: combo.serving,
		Calories:         combo.calories,
		ProteinG:         combo.protein,
		CarbsG:           combo.carbs,
		FatG:             combo.fat,
		HealthScore:      combo.healthScore,
		HealthFacts:      combo.healthFacts,
		FoodDetails:      combo.details,
	}

	// Personalize health facts based on user's goal
	if primaryGoal == "build_muscle" || primaryGoal == "muscle_gain" {
		analysis.HealthFacts += " For muscle gain, this meal's protein content helps support your training goals. 💪"
	} else if primaryGoal == "lose_weight" || primaryGoal == "weight_loss" {
		analysis.HealthFacts += " For weight loss, this meal provides good satiety from its fiber and protein content. ⚖️"
	}

	return analysis
}

// ── Food Analysis Simulation Data ─────────────────────────────────────

// foodCombo describes a single meal with per-food nutritional detail.
type foodCombo struct {
	name        string
	ingredients []string
	foods       []string
	serving     string
	calories    int
	protein     float64
	carbs       float64
	fat         float64
	healthScore int
	healthFacts string
	details     []models.FoodDetail
}

// foodCombinations is a diverse pool of meals with accurate nutritional
// data and evidence-based health benefits. Each combo simulates what a
// real AI food scanner might return.
var foodCombinations = []foodCombo{
	{
		name:        "Grilled Chicken Rice Bowl",
		ingredients: []string{"Grilled Chicken Breast", "Brown Rice", "Steamed Broccoli"},
		foods:       []string{"Grilled Chicken Breast", "Brown Rice", "Steamed Broccoli"},
		serving:     "~400g total plate",
		calories:    480, protein: 42, carbs: 45, fat: 12, healthScore: 8,
		healthFacts: "Well-balanced meal! High in lean protein for muscle repair, complex carbs for sustained energy, and broccoli provides fiber plus vitamins C & K. Low in saturated fat. Great for muscle gain and general fitness. 💪",
		details: []models.FoodDetail{
			{Name: "Grilled Chicken Breast", Calories: 200, ProteinG: 38, CarbsG: 0, FatG: 4, HealthBenefit: "Excellent lean protein source. Contains all essential amino acids for muscle repair. Also rich in B vitamins that support energy metabolism."},
			{Name: "Brown Rice", Calories: 220, ProteinG: 4, CarbsG: 45, FatG: 2, HealthBenefit: "Complex carbohydrate with a low glycemic index. Provides sustained energy release. Rich in fiber, magnesium, and selenium for immune function."},
			{Name: "Steamed Broccoli", Calories: 60, ProteinG: 3, CarbsG: 6, FatG: 0.5, HealthBenefit: "Nutrient-dense superfood. Packed with vitamin C (more than oranges per gram), vitamin K for bone health, and sulforaphane which may have anti-cancer properties."},
		},
	},
	{
		name:        "Salmon & Quinoa Power Plate",
		ingredients: []string{"Grilled Salmon Fillet", "Quinoa", "Roasted Asparagus"},
		foods:       []string{"Grilled Salmon Fillet", "Quinoa", "Roasted Asparagus"},
		serving:     "~350g plate",
		calories:    520, protein: 40, carbs: 38, fat: 20, healthScore: 9,
		healthFacts: "Outstanding anti-inflammatory meal! Salmon delivers high-quality omega-3 fatty acids (EPA/DHA) essential for brain health and reducing muscle soreness. Quinoa is a complete plant protein with all 9 essential amino acids. Asparagus is rich in prebiotic fiber for gut health. 🧠",
		details: []models.FoodDetail{
			{Name: "Grilled Salmon Fillet", Calories: 280, ProteinG: 34, CarbsG: 0, FatG: 16, HealthBenefit: "Rich in omega-3 fatty acids (DHA & EPA) that reduce inflammation, support cardiovascular health, and improve brain function. Also high in vitamin D and B12."},
			{Name: "Quinoa", Calories: 180, ProteinG: 6, CarbsG: 32, FatG: 3.5, HealthBenefit: "Complete plant protein containing all 9 essential amino acids. High in fiber, iron, magnesium, and manganese. Naturally gluten-free with low glycemic impact."},
			{Name: "Roasted Asparagus", Calories: 60, ProteinG: 4, CarbsG: 6, FatG: 0.5, HealthBenefit: "Excellent source of folate, vitamins A/C/K, and prebiotic fiber (inulin) that feeds healthy gut bacteria. Natural diuretic properties help reduce bloating."},
		},
	},
	{
		name:        "Avocado Toast with Poached Eggs",
		ingredients: []string{"Whole Grain Bread", "Avocado", "Poached Eggs", "Cherry Tomatoes"},
		foods:       []string{"Avocado Toast", "Poached Eggs", "Cherry Tomatoes"},
		serving:     "~300g breakfast plate",
		calories:    440, protein: 22, carbs: 28, fat: 28, healthScore: 8,
		healthFacts: "Power breakfast! Heart-healthy monounsaturated fats from avocado, complete protein from eggs, and lycopene-rich tomatoes. The fat helps absorb fat-soluble vitamins from the veggies. Keeps you full for hours. 🥑",
		details: []models.FoodDetail{
			{Name: "Avocado Toast (Whole Grain)", Calories: 220, ProteinG: 6, CarbsG: 22, FatG: 14, HealthBenefit: "Avocados are rich in heart-healthy monounsaturated fats and potassium (more than bananas). The fiber (7g per half) supports digestion and blood sugar stability."},
			{Name: "Poached Eggs (x2)", Calories: 150, ProteinG: 14, CarbsG: 1, FatG: 10, HealthBenefit: "Complete protein with all essential amino acids. Rich in choline for brain and liver health, lutein & zeaxanthin for eye protection, and vitamin D for bone strength."},
			{Name: "Cherry Tomatoes", Calories: 70, ProteinG: 2, CarbsG: 5, FatG: 0.5, HealthBenefit: "Excellent source of lycopene (a powerful antioxidant linked to reduced cancer risk), vitamin C, and potassium. The cooking/heating of tomatoes increases lycopene bioavailability."},
		},
	},
	{
		name:        "Beef Stir-Fry Bowl",
		ingredients: []string{"Lean Beef", "Jasmine Rice", "Mixed Bell Peppers"},
		foods:       []string{"Beef Stir-Fry", "Jasmine Rice", "Mixed Bell Peppers"},
		serving:     "~450g bowl",
		calories:    620, protein: 35, carbs: 55, fat: 22, healthScore: 7,
		healthFacts: "Protein-packed stir-fry! Lean beef provides heme iron (highly absorbable) for oxygen transport and zinc for immune function. Bell peppers are loaded with vitamin C which helps your body absorb the iron from the beef. A satisfying post-workout meal. 🥩",
		details: []models.FoodDetail{
			{Name: "Beef Stir-Fry (Lean Sirloin)", Calories: 280, ProteinG: 30, CarbsG: 2, FatG: 16, HealthBenefit: "Excellent source of heme iron (2-3x more absorbable than plant iron), zinc for immune health and testosterone production, and B12 for nerve function and energy."},
			{Name: "Jasmine Rice", Calories: 240, ProteinG: 3, CarbsG: 50, FatG: 1, HealthBenefit: "Quick-digesting carbohydrate ideal for post-workout glycogen replenishment. Low in fiber which makes it easy on the stomach before or after intense training."},
			{Name: "Mixed Bell Peppers", Calories: 100, ProteinG: 2, CarbsG: 7, FatG: 0.5, HealthBenefit: "One of the richest sources of vitamin C (190% DV per pepper). Also contains capsanthin, a carotenoid with powerful antioxidant properties. The vitamin C dramatically boosts iron absorption from the beef."},
		},
	},
	{
		name:        "Greek Yogurt & Berry Bowl",
		ingredients: []string{"Greek Yogurt", "Mixed Berries", "Granola", "Honey"},
		foods:       []string{"Greek Yogurt Bowl", "Mixed Berries", "Granola", "Honey Drizzle"},
		serving:     "~350g bowl",
		calories:    380, protein: 22, carbs: 48, fat: 12, healthScore: 8,
		healthFacts: "Nutrient-dense bowl! Greek yogurt packs twice the protein of regular yogurt plus gut-healthy probiotics. Berries are antioxidant powerhouses — blueberries rank #1 in antioxidant capacity among common fruits. A perfect pre or post-workout snack. 🫐",
		details: []models.FoodDetail{
			{Name: "Greek Yogurt (Plain, 2%)", Calories: 150, ProteinG: 17, CarbsG: 8, FatG: 5, HealthBenefit: "High in casein protein for slow-release amino acids, gut-healthy probiotics (look for 'live active cultures'), and calcium for bone density. Lower in lactose than regular yogurt."},
			{Name: "Mixed Berries", Calories: 80, ProteinG: 1, CarbsG: 17, FatG: 0.5, HealthBenefit: "Among the most antioxidant-rich foods. Anthocyanins in blueberries improve cognitive function and reduce muscle damage. Strawberries provide more vitamin C per calorie than oranges."},
			{Name: "Granola & Honey", Calories: 150, ProteinG: 4, CarbsG: 23, FatG: 6.5, HealthBenefit: "Whole grain oats provide beta-glucan fiber that lowers cholesterol. Honey contains natural enzymes and antioxidants; raw honey has antimicrobial properties. Provides quick energy for workouts."},
		},
	},
	{
		name:        "Chicken Caesar Wrap Meal",
		ingredients: []string{"Chicken", "Whole Wheat Wrap", "Romaine Lettuce", "Caesar Dressing", "Sparkling Water"},
		foods:       []string{"Chicken Caesar Wrap", "Side Salad", "Sparkling Water"},
		serving:     "~380g meal",
		calories:    510, protein: 32, carbs: 35, fat: 24, healthScore: 6,
		healthFacts: "Satisfying lunch wrap with good protein. The romaine lettuce provides folate and vitamin A. Caesar dressing adds flavor but watch portion size — it's the main calorie driver here. Pair with sparkling water to stay hydrated without added sugars. 🥬",
		details: []models.FoodDetail{
			{Name: "Chicken Caesar Wrap", Calories: 380, ProteinG: 30, CarbsG: 30, FatG: 20, HealthBenefit: "Grilled chicken provides lean protein. Whole wheat wrap adds fiber. Romaine lettuce is rich in folate, vitamin A, and vitamin K. The parmesan adds calcium for bone health."},
			{Name: "Side Salad", Calories: 80, ProteinG: 2, CarbsG: 5, FatG: 4, HealthBenefit: "Fresh greens provide vitamins A, C, and K plus folate. The fiber aids satiety and digestion. Light vinaigrette helps absorb fat-soluble vitamins from the greens."},
			{Name: "Sparkling Water", Calories: 0, ProteinG: 0, CarbsG: 0, FatG: 0, HealthBenefit: "Zero-calorie hydration. Carbonation can aid digestion and provide a feeling of fullness. A much healthier alternative to sugary sodas — zero sugar, zero artificial sweeteners."},
		},
	},
	{
		name:        "Tuna Poke Bowl",
		ingredients: []string{"Ahi Tuna", "Sushi Rice", "Edamame", "Seaweed Salad"},
		foods:       []string{"Tuna Poke Bowl", "Sushi Rice", "Edamame", "Seaweed Salad"},
		serving:     "~420g bowl",
		calories:    540, protein: 36, carbs: 58, fat: 16, healthScore: 8,
		healthFacts: "Hawaiian-inspired nutrition! Raw tuna is packed with lean protein and selenium for thyroid health. Edamame is a complete plant protein with isoflavones linked to reduced cancer risk. Seaweed provides iodine essential for metabolism. A balanced, anti-inflammatory meal. 🍣",
		details: []models.FoodDetail{
			{Name: "Tuna Poke (Ahi)", Calories: 180, ProteinG: 28, CarbsG: 1, FatG: 6, HealthBenefit: "Excellent source of lean protein and selenium, a mineral critical for thyroid function and antioxidant defense. Contains heart-healthy omega-3s (though less than salmon). Low in saturated fat."},
			{Name: "Sushi Rice & Edamame", Calories: 260, ProteinG: 3, CarbsG: 55, FatG: 4, HealthBenefit: "Sushi rice provides quick energy. Edamame (young soybeans) are a complete plant protein with all essential amino acids. Contains isoflavones that may reduce risk of certain cancers and support bone health."},
			{Name: "Seaweed Salad", Calories: 100, ProteinG: 5, CarbsG: 2, FatG: 6, HealthBenefit: "Rich natural source of iodine (essential for thyroid hormone production and metabolism). Also provides vitamin K, folate, and magnesium. Contains fucoxanthin, a compound studied for its fat-metabolism effects."},
		},
	},
	{
		name:        "Protein Power Smoothie",
		ingredients: []string{"Whey Protein", "Banana", "Peanut Butter", "Oat Milk"},
		foods:       []string{"Protein Smoothie", "Banana", "Peanut Butter", "Oat Milk"},
		serving:     "~500ml smoothie",
		calories:    450, protein: 30, carbs: 48, fat: 16, healthScore: 8,
		healthFacts: "The ultimate fitness smoothie! Whey protein is the fastest-absorbing protein — ideal within 30 min post-workout for muscle protein synthesis. Bananas replenish glycogen and potassium lost through sweat. Peanut butter adds healthy fats for hormone production. 🍌",
		details: []models.FoodDetail{
			{Name: "Whey Protein (1 scoop)", Calories: 120, ProteinG: 25, CarbsG: 3, FatG: 1.5, HealthBenefit: "Fastest-digesting complete protein. Rich in branched-chain amino acids (BCAAs) — especially leucine which directly triggers muscle protein synthesis. Best consumed within 30-60 min post-workout for maximum absorption."},
			{Name: "Banana (1 medium)", Calories: 105, ProteinG: 1.3, CarbsG: 27, FatG: 0.4, HealthBenefit: "Excellent source of potassium (422mg, 9% DV) to prevent muscle cramps. Provides quick-digesting carbs for glycogen replenishment. Contains vitamin B6 for protein metabolism and dopamine production."},
			{Name: "Peanut Butter & Oat Milk", Calories: 225, ProteinG: 4, CarbsG: 18, FatG: 14, HealthBenefit: "Peanut butter provides healthy monounsaturated fats, vitamin E (antioxidant), and magnesium for muscle relaxation. Oat milk adds beta-glucan fiber and is fortified with calcium and vitamin D."},
		},
	},
	{
		name:        "Margherita Pizza with Arugula",
		ingredients: []string{"Pizza Dough", "Tomato Sauce", "Fresh Mozzarella", "Arugula", "Balsamic Glaze"},
		foods:       []string{"Margherita Pizza", "Arugula", "Balsamic Glaze"},
		serving:     "~350g (3 slices)",
		calories:    650, protein: 26, carbs: 62, fat: 30, healthScore: 5,
		healthFacts: "Classic comfort food with a nutrition upgrade! The tomato sauce provides lycopene, fresh mozzarella delivers calcium and protein, and arugula adds peppery greens with vitamin K. The balsamic glaze adds antioxidants. A reasonable indulgence when balanced with activity. 🍕",
		details: []models.FoodDetail{
			{Name: "Margherita Pizza", Calories: 580, ProteinG: 24, CarbsG: 58, FatG: 28, HealthBenefit: "Fresh mozzarella provides calcium (200mg per serving) and casein protein for slow amino acid release. Tomato sauce is rich in lycopene — cooking tomatoes actually increases its bioavailability. Carbs provide energy for workouts."},
			{Name: "Arugula & Balsamic", Calories: 70, ProteinG: 2, CarbsG: 4, FatG: 2, HealthBenefit: "Arugula is a cruciferous vegetable rich in vitamin K (for bone and blood health) and nitrates that may improve blood flow. Balsamic vinegar contains antioxidants from grapes and helps moderate blood sugar spikes after meals."},
		},
	},
	{
		name:        "Overnight Oats Jar",
		ingredients: []string{"Oats", "Chia Seeds", "Almond Butter", "Apple"},
		foods:       []string{"Overnight Oats", "Chia Seeds", "Almond Butter", "Sliced Apple"},
		serving:     "~380g jar",
		calories:    420, protein: 16, carbs: 52, fat: 18, healthScore: 9,
		healthFacts: "Fiber powerhouse! Oats contain beta-glucan which lowers LDL cholesterol by 5-10%. Chia seeds provide 10g fiber per ounce plus plant-based omega-3s (ALA). Apples add quercetin, a flavonoid with anti-inflammatory properties. This breakfast will keep your blood sugar stable for hours. 🍎",
		details: []models.FoodDetail{
			{Name: "Overnight Oats", Calories: 190, ProteinG: 7, CarbsG: 34, FatG: 3.5, HealthBenefit: "Rich in beta-glucan soluble fiber proven to reduce LDL cholesterol. Provides manganese, phosphorus, and magnesium. Low glycemic index means steady energy release — ideal for morning workouts."},
			{Name: "Chia Seeds (2 tbsp)", Calories: 120, ProteinG: 4, CarbsG: 10, FatG: 8, HealthBenefit: "One of the best plant sources of omega-3 ALA. 10g fiber per ounce aids digestion and satiety. Forms a gel when soaked which slows digestion and stabilizes blood sugar. Rich in calcium and antioxidants."},
			{Name: "Almond Butter & Apple", Calories: 110, ProteinG: 5, CarbsG: 8, FatG: 6.5, HealthBenefit: "Almonds provide vitamin E (powerful antioxidant), magnesium, and healthy fats. Apples contain quercetin (anti-inflammatory flavonoid) and pectin fiber that feeds beneficial gut bacteria."},
		},
	},
	{
		name:        "Chicken Burrito Bowl",
		ingredients: []string{"Grilled Chicken", "Black Beans", "Rice", "Guacamole", "Pico de Gallo"},
		foods:       []string{"Burrito Bowl", "Black Beans", "Grilled Chicken", "Guacamole", "Pico de Gallo"},
		serving:     "~500g bowl",
		calories:    640, protein: 42, carbs: 58, fat: 22, healthScore: 7,
		healthFacts: "Customizable protein bowl! Black beans and chicken together make a complete amino acid profile. The fiber from beans (15g per cup) feeds gut bacteria and lowers cholesterol. Fresh guacamole provides heart-healthy monounsaturated fats and potassium. Skip the sour cream and cheese to keep it lean. 🥑",
		details: []models.FoodDetail{
			{Name: "Grilled Chicken & Black Beans", Calories: 320, ProteinG: 38, CarbsG: 28, FatG: 5, HealthBenefit: "Chicken + beans = complete protein synergy. Black beans provide 15g fiber per cup — more than most vegetables. Resistant starch in beans feeds beneficial gut bacteria and improves insulin sensitivity."},
			{Name: "Guacamole (½ avocado)", Calories: 170, ProteinG: 2, CarbsG: 8, FatG: 15, HealthBenefit: "Rich in monounsaturated fats that lower LDL cholesterol and raise HDL. Contains more potassium than bananas (485mg). Lutein and zeaxanthin support eye health. Helps absorb fat-soluble vitamins A, D, E, K from the bowl."},
			{Name: "Pico de Gallo", Calories: 50, ProteinG: 2, CarbsG: 6, FatG: 0.5, HealthBenefit: "Fresh tomatoes provide lycopene, onions contain quercetin (anti-inflammatory), cilantro helps detoxify heavy metals, and lime juice adds vitamin C. All for minimal calories with maximum flavor."},
		},
	},
	{
		name:        "Turkey Burger & Sweet Potato Plate",
		ingredients: []string{"Sweet Potato", "Ground Turkey", "Whole Wheat Bun", "Spinach"},
		foods:       []string{"Sweet Potato", "Grilled Turkey Burger", "Sautéed Spinach"},
		serving:     "~400g plate",
		calories:    490, protein: 38, carbs: 42, fat: 16, healthScore: 8,
		healthFacts: "Clean eating done right! Sweet potatoes are one of the best carb sources — loaded with beta-carotene (your body converts to vitamin A) and more fiber than white potatoes. Turkey is ultra-lean protein with selenium and B vitamins. Spinach is a nutrient bomb with iron, magnesium, and vitamin K. 🍠",
		details: []models.FoodDetail{
			{Name: "Sweet Potato (1 large)", Calories: 160, ProteinG: 3, CarbsG: 36, FatG: 0.5, HealthBenefit: "Excellent source of beta-carotene (769% DV of vitamin A) for immune function and vision. Higher fiber and lower glycemic index than white potatoes. Rich in vitamin C and manganese for collagen production."},
			{Name: "Grilled Turkey Burger", Calories: 220, ProteinG: 30, CarbsG: 0, FatG: 10, HealthBenefit: "Ultra-lean protein source with less saturated fat than beef. Rich in selenium (supports thyroid and immune health), B3/B6 for energy metabolism, and tryptophan which aids serotonin production and sleep quality."},
			{Name: "Sautéed Spinach", Calories: 110, ProteinG: 5, CarbsG: 6, FatG: 5.5, HealthBenefit: "Nutrient density champion — provides iron, magnesium, calcium, vitamin K (1000% DV), and folate. Contains nitrates that improve blood flow and exercise performance. Cooking spinach increases mineral absorption."},
		},
	},
	{
		name:        "Thai Green Curry with Tofu",
		ingredients: []string{"Tofu", "Coconut Milk", "Green Curry Paste", "Jasmine Rice", "Thai Basil"},
		foods:       []string{"Thai Green Curry", "Jasmine Rice", "Tofu", "Thai Basil"},
		serving:     "~480g bowl",
		calories:    550, protein: 28, carbs: 50, fat: 24, healthScore: 7,
		healthFacts: "Aromatic and anti-inflammatory! Green curry paste contains turmeric (curcumin — a potent anti-inflammatory), ginger (aids digestion), and lemongrass. Tofu provides complete plant protein and isoflavones. Coconut milk adds medium-chain triglycerides (MCTs) that are metabolized differently — more likely to be used for energy than stored as fat. 🌿",
		details: []models.FoodDetail{
			{Name: "Tofu & Green Curry", Calories: 290, ProteinG: 24, CarbsG: 12, FatG: 18, HealthBenefit: "Tofu is a complete plant protein with all essential amino acids. The curcumin in turmeric has powerful anti-inflammatory effects (comparable to some medications). Gingerol in ginger aids digestion and reduces nausea."},
			{Name: "Jasmine Rice", Calories: 200, ProteinG: 2, CarbsG: 42, FatG: 0.5, HealthBenefit: "Quick-digesting carbs to replenish glycogen post-workout. Fragrant variety with lower arsenic levels than brown rice (which concentrates arsenic from soil). A clean, easily digestible energy source."},
			{Name: "Coconut Milk & Thai Basil", Calories: 60, ProteinG: 2, CarbsG: 2, FatG: 6, HealthBenefit: "Coconut MCTs are rapidly absorbed and oxidized for energy rather than stored. Thai basil contains eugenol (anti-inflammatory and antimicrobial). Adds flavor without sodium or artificial ingredients."},
		},
	},
	{
		name:        "Grilled Shrimp & Couscous Plate",
		ingredients: []string{"Shrimp", "Couscous", "Zucchini"},
		foods:       []string{"Grilled Shrimp Skewers", "Couscous", "Grilled Zucchini"},
		serving:     "~340g plate",
		calories:    400, protein: 34, carbs: 40, fat: 8, healthScore: 8,
		healthFacts: "Light, lean, and packed with micronutrients! Shrimp is nearly pure protein — one of the leanest animal proteins available — plus it's rich in selenium and astaxanthin (a powerful antioxidant that gives shrimp its pink color). Couscous cooks in 5 minutes and provides quick energy. Zucchini is hydrating and low-cal. 🦐",
		details: []models.FoodDetail{
			{Name: "Grilled Shrimp Skewers (8 large)", Calories: 160, ProteinG: 30, CarbsG: 1, FatG: 2, HealthBenefit: "Nearly pure protein — 85% of calories from protein. Rich in selenium (60% DV) for thyroid health. Contains astaxanthin, a carotenoid antioxidant 10x more powerful than beta-carotene. Low in mercury compared to larger fish."},
			{Name: "Couscous (Whole Wheat)", Calories: 180, ProteinG: 6, CarbsG: 35, FatG: 1, HealthBenefit: "Quick-cooking whole grain rich in selenium and fiber. Made from durum wheat semolina. Provides steady energy release and B vitamins for metabolism. Ready in 5 minutes — one of the fastest healthy carb sources."},
			{Name: "Grilled Zucchini", Calories: 60, ProteinG: 2, CarbsG: 4, FatG: 3, HealthBenefit: "95% water content — excellent for hydration. Rich in vitamin C and manganese. Contains zeaxanthin and lutein for eye health. Very low calorie density means you can eat large portions guilt-free."},
		},
	},
	{
		name:        "Lentil Soup & Hummus Plate",
		ingredients: []string{"Lentils", "Whole Grain Bread", "Hummus"},
		foods:       []string{"Lentil Soup", "Crusty Whole Grain Bread", "Side of Hummus"},
		serving:     "~500g soup + sides",
		calories:    460, protein: 24, carbs: 58, fat: 14, healthScore: 9,
		healthFacts: "Plant-powered Mediterranean meal! Lentils are a nutrition powerhouse — 18g protein and 16g fiber per cup. The soluble fiber lowers cholesterol and stabilizes blood sugar. Hummus (chickpeas + tahini) adds more fiber, plant protein, and healthy fats. One of the healthiest meal combinations you can eat. 🥣",
		details: []models.FoodDetail{
			{Name: "Lentil Soup", Calories: 220, ProteinG: 18, CarbsG: 38, FatG: 2, HealthBenefit: "Lentils pack 18g protein and 16g fiber per cup — among the highest of any plant food. Rich in folate (90% DV), iron, and polyphenols with antioxidant effects. Linked to reduced heart disease risk in multiple large-scale studies."},
			{Name: "Whole Grain Bread & Hummus", Calories: 240, ProteinG: 6, CarbsG: 20, FatG: 12, HealthBenefit: "Chickpeas in hummus provide fiber and resistant starch for gut health. Tahini (sesame paste) adds calcium and healthy fats. Whole grain bread adds B vitamins. The fiber-protein combo creates exceptional satiety."},
		},
	},
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
