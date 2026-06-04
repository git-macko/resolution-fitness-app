package models

// ── Daily Quote ──────────────────────────────────────────────────────
// DailyQuote is a motivational quote shown on the dashboard.
type DailyQuote struct {
	ID       string `json:"id"`
	Text     string `json:"text"`
	Author   string `json:"author"`
	Category string `json:"category"`
}

// ── Health Fact ──────────────────────────────────────────────────────
// HealthFact is a rotating health/gym science fact for the dashboard.
type HealthFact struct {
	ID       string `json:"id"`
	Text     string `json:"text"`
	Category string `json:"category"`
	Source   string `json:"source,omitempty"`
}

// ── Dashboard Data ───────────────────────────────────────────────────
// DashboardData is the single response from GET /api/dashboard.
// It contains all widgets needed for the Dashboard tab.
type DashboardData struct {
	// Greeting is a time-based greeting (e.g., "Good morning, Alex! ☀️")
	Greeting string `json:"greeting"`

	// DailyQuote is today's motivational quote.
	DailyQuote DailyQuote `json:"dailyQuote"`

	// HealthFact is today's rotating health/gym fact.
	HealthFact HealthFact `json:"healthFact"`

	// FitnessSummary shows weekly workout completion and trend.
	FitnessSummary FitnessSummary `json:"fitnessSummary"`

	// HealthSummary shows nutrition adherence and macros.
	HealthSummary HealthSummary `json:"healthSummary"`

	// Progression shows the user's XP, level, and progression.
	Progression Progression `json:"progression"`

	// TodaySummary is a quick at-a-glance stats row.
	TodaySummary TodaySummary `json:"todaySummary"`

	// NextWorkout is the user's next scheduled workout.
	NextWorkout *NextWorkout `json:"nextWorkout,omitempty"`

	// StreakInfo shows the current streak and recent 7-day calendar.
	StreakInfo StreakInfo `json:"streakInfo"`
}

// ── Dashboard Sub-types ──────────────────────────────────────────────

// FitnessSummary shows weekly workout completion data.
type FitnessSummary struct {
	WorkoutsCompleted int     `json:"workoutsCompleted"`
	WorkoutsPlanned   int     `json:"workoutsPlanned"`
	CompletionRate    float64 `json:"completionRate"`
	TotalVolumeKg     float64 `json:"totalVolumeKg"`
	VolumeTrend       float64 `json:"volumeTrend"` // Percentage change from last week
	TotalMinutes      int     `json:"totalMinutes"`
}

// HealthSummary shows daily nutrition adherence data.
type HealthSummary struct {
	CalorieAdherence float64 `json:"calorieAdherence"`
	ProteinG         float64 `json:"proteinG"`
	CarbsG           float64 `json:"carbsG"`
	FatG             float64 `json:"fatG"`
	WaterMl          int     `json:"waterMl"`
	WaterGoalMl      int     `json:"waterGoalMl"`
}

// Progression shows gamification level/XP data.
type Progression struct {
	Level           int     `json:"level"`
	XP              int     `json:"xp"`
	XPToNextLevel   int     `json:"xpToNextLevel"`
	LevelProgress   float64 `json:"levelProgress"` // 0.0 to 1.0
	CurrentStreak   int     `json:"currentStreak"`
	LongestStreak   int     `json:"longestStreak"`
}

// TodaySummary is a compact stats row for the dashboard.
type TodaySummary struct {
	CaloriesBurned int `json:"caloriesBurned"`
	WaterGlasses   int `json:"waterGlasses"`
	WorkoutMinutes int `json:"workoutMinutes"`
}

// NextWorkout previews the user's upcoming scheduled workout.
type NextWorkout struct {
	WorkoutName string `json:"workoutName"`
	Date        string `json:"date"`
	MuscleGroup string `json:"muscleGroup"`
	Duration    int    `json:"duration"`
}

// StreakInfo shows current streak and recent 7-day mini calendar.
type StreakInfo struct {
	CurrentStreak int     `json:"currentStreak"`
	Last7Days     []bool  `json:"last7Days"` // true = worked out that day
}

// ── Chat Message ─────────────────────────────────────────────────────
// ChatMessage is a single message in the AI Coach chat history.
type ChatMessage struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	Role      string `json:"role"`
	Content   string `json:"content"`
	CreatedAt string `json:"createdAt"`
}

// ChatRequest is the JSON body for POST /api/chat.
type ChatRequest struct {
	Message string         `json:"message"`
	History []ChatMessage  `json:"history,omitempty"`
}

// ChatResponse is returned from POST /api/chat.
type ChatResponse struct {
	Reply    string `json:"reply"`
	Metadata *ChatMetadata `json:"metadata,omitempty"`
}

// ChatMetadata contains additional context from the AI response.
type ChatMetadata struct {
	TokensUsed int    `json:"tokensUsed"`
	Model      string `json:"model"`
}

// ChatSuggestion is a contextual prompt suggestion shown to the user.
type ChatSuggestion struct {
	Prompt      string `json:"prompt"`
	Description string `json:"description"`
	Category    string `json:"category"` // workout | nutrition | motivation | general
}
