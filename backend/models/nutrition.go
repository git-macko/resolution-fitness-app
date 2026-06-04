package models

// ── Food Log ─────────────────────────────────────────────────────────
// FoodLog represents a single meal entry with type categorization.
type FoodLog struct {
	ID              string     `json:"id"`
	UserID          string     `json:"userId"`
	LogDate         string     `json:"logDate"`
	MealType        string     `json:"mealType"`
	LinkedSessionID string     `json:"linkedSessionId,omitempty"`
	TotalCalories   int        `json:"totalCalories"`
	TotalProteinG   float64    `json:"totalProteinG"`
	TotalCarbsG     float64    `json:"totalCarbsG"`
	TotalFatG       float64    `json:"totalFatG"`
	Items           []FoodItem `json:"items,omitempty"`
	CreatedAt       string     `json:"createdAt"`
}

// CreateMealRequest is the JSON body for POST /api/nutrition/meals.
type CreateMealRequest struct {
	LogDate         string              `json:"logDate,omitempty"`
	MealType        string              `json:"mealType"`
	LinkedSessionID string              `json:"linkedSessionId,omitempty"`
	Items           []CreateFoodItemReq `json:"items"`
}

// CreateFoodItemReq is a food item within a meal creation request.
type CreateFoodItemReq struct {
	Name         string  `json:"name"`
	ServingSize  string  `json:"servingSize,omitempty"`
	Calories     int     `json:"calories"`
	ProteinG     float64 `json:"proteinG,omitempty"`
	CarbsG       float64 `json:"carbsG,omitempty"`
	FatG         float64 `json:"fatG,omitempty"`
	HealthScore  int     `json:"healthScore,omitempty"`
	HealthNotes  string  `json:"healthNotes,omitempty"`
	AllergenFlags []string `json:"allergenFlags,omitempty"`
	PhotoURL     string  `json:"photoUrl,omitempty"`
	Source       string  `json:"source,omitempty"`
}

// ── Food Item ────────────────────────────────────────────────────────
// FoodItem is a single food/drink item within a meal log.
type FoodItem struct {
	ID            string   `json:"id"`
	FoodLogID     string   `json:"foodLogId"`
	Name          string   `json:"name"`
	ServingSize   string   `json:"servingSize,omitempty"`
	Calories      int      `json:"calories"`
	ProteinG      float64  `json:"proteinG"`
	CarbsG        float64  `json:"carbsG"`
	FatG          float64  `json:"fatG"`
	HealthScore   int      `json:"healthScore"`
	HealthNotes   string   `json:"healthNotes,omitempty"`
	AllergenFlags []string `json:"allergenFlags,omitempty"`
	PhotoURL      string   `json:"photoUrl,omitempty"`
	Source        string   `json:"source"`
	SortOrder     int      `json:"sortOrder"`
}

// ── Nutrition Summary ────────────────────────────────────────────────
// DailyNutrition summarizes a single day's nutrition data.
type DailyNutrition struct {
	Date         string  `json:"date"`
	TotalCalories int    `json:"totalCalories"`
	TotalProteinG float64 `json:"totalProteinG"`
	TotalCarbsG  float64 `json:"totalCarbsG"`
	TotalFatG    float64 `json:"totalFatG"`
	WaterMl      int     `json:"waterMl"`
	WaterGoalMl  int     `json:"waterGoalMl"`
	CalorieTarget int    `json:"calorieTarget"`
	ProteinTarget float64 `json:"proteinTarget"`
	Meals        []FoodLog `json:"meals,omitempty"`
}

// WeeklyNutrition summarizes nutrition across 7 days.
type WeeklyNutrition struct {
	StartDate        string  `json:"startDate"`
	EndDate          string  `json:"endDate"`
	AvgDailyCalories float64 `json:"avgDailyCalories"`
	AvgProteinG      float64 `json:"avgProteinG"`
	AvgCarbsG        float64 `json:"avgCarbsG"`
	AvgFatG          float64 `json:"avgFatG"`
	AvgWaterMl       float64 `json:"avgWaterMl"`
	AdherenceRate    float64 `json:"adherenceRate"`
	Days             []DailyNutrition `json:"days,omitempty"`
}

// ── Water Log ────────────────────────────────────────────────────────
// WaterLog is a single water intake record.
type WaterLog struct {
	ID       string `json:"id"`
	UserID   string `json:"userId"`
	LogDate  string `json:"logDate"`
	AmountMl int    `json:"amountMl"`
	LoggedAt string `json:"loggedAt"`
}

// LogWaterRequest is the JSON body for POST /api/nutrition/water.
type LogWaterRequest struct {
	AmountMl int    `json:"amountMl"`
	LogDate  string `json:"logDate,omitempty"`
}

// ── Scanned Food ─────────────────────────────────────────────────────
// ScannedFood represents a food photo analysis result.
type ScannedFood struct {
	ID               string   `json:"id"`
	UserID           string   `json:"userId"`
	PhotoURL         string   `json:"photoUrl"`
	DetectedFoods    []string `json:"detectedFoods"`
	EstimatedServing string   `json:"estimatedServing,omitempty"`
	Calories         int      `json:"calories"`
	ProteinG         float64  `json:"proteinG"`
	CarbsG           float64  `json:"carbsG"`
	FatG             float64  `json:"fatG"`
	HealthScore      int      `json:"healthScore"`
	HealthFacts      string   `json:"healthFacts"`
	AllergenFlags    []string `json:"allergenFlags,omitempty"`
	WasLogged        bool     `json:"wasLogged"`
	LoggedMealType   string   `json:"loggedMealType,omitempty"`
	CreatedAt        string   `json:"createdAt"`
}

// LogScannedFoodRequest is the JSON body for POST /api/food-scan/log.
type LogScannedFoodRequest struct {
	ScanID   string `json:"scanId"`
	MealType string `json:"mealType"`
}

// ── Meal Suggestion ──────────────────────────────────────────────────
// MealSuggestion is a personalized food recommendation.
type MealSuggestion struct {
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Foods       []string `json:"foods"`
	Calories    int      `json:"calories"`
	ProteinG    float64  `json:"proteinG"`
	CarbsG      float64  `json:"carbsG"`
	FatG        float64  `json:"fatG"`
	Reason      string   `json:"reason"`
	Tags        []string `json:"tags,omitempty"`
}
