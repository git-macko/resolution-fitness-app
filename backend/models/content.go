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

	// GymCrowd shows the user's gym crowd estimate.
	GymCrowd *GymCrowdInfo `json:"gymCrowd,omitempty"`
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

// ChatPlanRequest is the JSON body for POST /api/chat/plan.
// It asks Mimi to turn a natural-language workout request into a
// structured weekly plan that can be saved for the user.
type ChatPlanRequest struct {
	Message     string `json:"message"`
	RoutineType string `json:"routineType"` // "consistent" or "one_time"
}

// ── Gym Crowd ──────────────────────────────────────────────────────────
// GymCrowdInfo is the dashboard widget showing estimated gym occupancy.

type GymCrowdInfo struct {
	Type         string                    `json:"type"`       // "commercial" | "home"
	Name         string                    `json:"name"`       // gym name or "My Home Gym"
	Address      string                    `json:"address,omitempty"`      // gym address displayed under the name
	Percentage   int                       `json:"percentage"` // 0-100 estimated occupancy
	Label        string                    `json:"label"`      // "Not too busy", "Busy", etc.
	Capacity     int                       `json:"capacity"`   // estimated max capacity
	Phone        string                    `json:"phone,omitempty"`        // contact phone number
	Website      string                    `json:"website,omitempty"`        // gym website URL
	Source       string                    `json:"source"`     // "besttime", "simulated", "home", "closed", "user_report" or "community"
	IsOpen       bool                      `json:"isOpen"`     // true when the gym is currently open per its hours
	StatusText   string                    `json:"statusText,omitempty"`   // "Open now · Closes at 10 PM" or "Closed now"
	OpeningHours string                    `json:"openingHours,omitempty"` // JSON string of regular opening hours
	UserReport   *GymCrowdReportSummary    `json:"userReport,omitempty"`   // this user's latest report for this gym
	Community    *GymCrowdCommunitySummary `json:"community,omitempty"`    // recent community report summary
}

// GymCrowdReportRequest is the JSON body for POST /api/gym-crowd/report.
type GymCrowdReportRequest struct {
	Level int `json:"level"` // 1 (not busy) to 5 (very busy)
}

// GymCrowdReportSummary is embedded in GymCrowdInfo to show the current
// user's latest report for the configured gym.
type GymCrowdReportSummary struct {
	Level      int    `json:"level"`
	ReportedAt string `json:"reportedAt"`
}

// GymCrowdCommunitySummary shows an aggregated recent community report.
type GymCrowdCommunitySummary struct {
	Level int `json:"level"` // rounded average level (1-5)
	Count int `json:"count"` // number of reports in the window
}

// OpeningHours represents a venue's regular weekly hours.
// It supports both structured Google Places data and raw OSM fallback text.
type OpeningHours struct {
	OpenNow     bool     `json:"openNow,omitempty"`
	Periods     []Period `json:"periods,omitempty"`
	WeekdayText []string `json:"weekdayText,omitempty"`
	RawText     string   `json:"rawText,omitempty"` // raw OSM opening_hours tag, e.g. "Mo-Fr 06:00-22:00"
}

// Period is a single open/close period for a venue.
type Period struct {
	Open  TimePoint `json:"open"`
	Close TimePoint `json:"close"`
}

// TimePoint is a day/hour/minute point used inside Period.
type TimePoint struct {
	Day    int `json:"day"`    // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
	Hour   int `json:"hour"`
	Minute int `json:"minute"`
}

// UserGym holds the user's gym preference.
type UserGym struct {
	Type              string  `json:"type"`     // "commercial" | "home"
	Name              string  `json:"name"`     // gym name
	Address           string  `json:"address"`  // gym address (used for BestTime lookups)
	PlaceID           string  `json:"placeId"`  // Google Maps place_id
	Phone             string  `json:"phone,omitempty"`     // contact phone number
	Website           string  `json:"website,omitempty"`   // gym website URL
	Lat               float64 `json:"lat"`      // latitude
	Lng               float64 `json:"lng"`      // longitude
	Capacity          int     `json:"capacity"` // estimated max capacity
	OpeningHours      string  `json:"openingHours,omitempty"`     // JSON string of regular opening hours
	HoursRefreshAt    string  `json:"hoursRefreshAt,omitempty"`   // timestamp of last hours auto-refresh attempt
}

// UpdateUserGymRequest is the JSON body for PUT /api/profile/gym.
type UpdateUserGymRequest struct {
	Type         string  `json:"type"`
	Name         string  `json:"name"`
	Address      string  `json:"address"`
	PlaceID      string  `json:"placeId"`
	Phone        string  `json:"phone,omitempty"`
	Website      string  `json:"website,omitempty"`
	Lat          float64 `json:"lat"`
	Lng          float64 `json:"lng"`
	Capacity     int     `json:"capacity"`
	OpeningHours string  `json:"openingHours,omitempty"` // JSON string of regular opening hours
}

// GymSearchResult is a single gym suggestion returned by /api/gyms/search.
type GymSearchResult struct {
	Name         string  `json:"name"`
	Address      string  `json:"address"`
	PlaceID      string  `json:"placeId"`
	Phone        string  `json:"phone,omitempty"` // contact phone number
	Website      string  `json:"website,omitempty"` // gym website URL
	Lat          float64 `json:"lat"`
	Lng          float64 `json:"lng"`
	OpeningHours string  `json:"openingHours,omitempty"` // JSON string of regular opening hours
}
