package models

// ── Exercise ─────────────────────────────────────────────────────────
// Exercise represents a single exercise in the library.
// Arrays (instructions, tips, etc.) are stored as JSON strings in SQLite
// and parsed to/from []string in Go.
type Exercise struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	MuscleGroup    string   `json:"muscleGroup"`
	Equipment      string   `json:"equipment"`
	Description    string   `json:"description,omitempty"`
	Instructions   []string `json:"instructions,omitempty"`
	Tips           []string `json:"tips,omitempty"`
	CommonMistakes []string `json:"commonMistakes,omitempty"`
	Alternatives   []string `json:"alternatives,omitempty"`
	ImageURL       string   `json:"imageUrl,omitempty"`
	GifURL         string   `json:"gifUrl,omitempty"`
	IsActive       bool     `json:"isActive"`
	CreatedAt      string   `json:"createdAt,omitempty"`
}

// ── Weekly Plan ──────────────────────────────────────────────────────
// WeeklyPlan represents a user's workout plan.
// routineType: "consistent" (repeats every week) or "one_time" (overrides a specific week).
// For consistent routines, WeekStartDate/WeekEndDate are empty — they apply to every week.
// For one-time routines, WeekStartDate/WeekEndDate specify the exact week being overridden.
// IsActive: only meaningful for consistent routines — only one can be active at a time.
type WeeklyPlan struct {
	ID            string    `json:"id"`
	UserID        string    `json:"userId"`
	WeekStartDate string    `json:"weekStartDate"`
	WeekEndDate   string    `json:"weekEndDate"`
	Name          string    `json:"name"`
	Mode          string    `json:"mode,omitempty"`
	ModeGoal      string    `json:"modeGoal,omitempty"`
	RoutineType   string    `json:"routineType,omitempty"`
	IsActive      bool      `json:"isActive"`
	IsTemplate    bool      `json:"isTemplate"`
	TemplateName  string    `json:"templateName,omitempty"`
	Days          []PlanDay `json:"days,omitempty"`
	CreatedAt     string    `json:"createdAt"`
	UpdatedAt     string    `json:"updatedAt"`
}

// CreatePlanRequest is the JSON body for POST /api/plans.
type CreatePlanRequest struct {
	WeekStartDate string              `json:"weekStartDate"`
	Name          string              `json:"name"`
	Mode          string              `json:"mode,omitempty"`
	ModeGoal      string              `json:"modeGoal,omitempty"`
	RoutineType   string              `json:"routineType,omitempty"`
	Days          []CreatePlanDayReq  `json:"days"`
}

// CreatePlanDayReq is a single day within a plan creation request.
type CreatePlanDayReq struct {
	DayOfWeek         int                   `json:"dayOfWeek"`
	WorkoutName       string                `json:"workoutName"`
	IsRestDay         bool                  `json:"isRestDay,omitempty"`
	EstimatedDuration int                   `json:"estimatedDuration,omitempty"`
	Exercises         []CreatePlanExerciseReq `json:"exercises,omitempty"`
}

// CreatePlanExerciseReq is an exercise within a plan day creation.
type CreatePlanExerciseReq struct {
	ExerciseID         string  `json:"exerciseId"`
	CustomExerciseName string  `json:"customExerciseName,omitempty"`
	TargetSets         int     `json:"targetSets"`
	TargetReps         string  `json:"targetReps"`
	TargetWeight       float64 `json:"targetWeight,omitempty"`
	Notes              string  `json:"notes,omitempty"`
}

// ── Plan Day ─────────────────────────────────────────────────────────
// PlanDay is a single day's workout within a weekly plan.
type PlanDay struct {
	ID                string         `json:"id"`
	PlanID            string         `json:"planId"`
	DayOfWeek         int            `json:"dayOfWeek"`
	WorkoutName       string         `json:"workoutName"`
	IsRestDay         bool           `json:"isRestDay"`
	EstimatedDuration int            `json:"estimatedDuration"`
	Completed         bool           `json:"completed"`
	CompletedDate     string         `json:"completedDate,omitempty"`
	SortOrder         int            `json:"sortOrder"`
	Exercises         []PlanExercise `json:"exercises,omitempty"`
	CreatedAt         string         `json:"createdAt,omitempty"`
}

// ── Plan Exercise ────────────────────────────────────────────────────
// PlanExercise is an exercise assigned to a plan day.
type PlanExercise struct {
	ID                 string  `json:"id"`
	PlanDayID          string  `json:"planDayId"`
	ExerciseID         string  `json:"exerciseId"`
	CustomExerciseName string  `json:"customExerciseName,omitempty"`
	ExerciseName       string  `json:"exerciseName,omitempty"`
	MuscleGroup        string  `json:"muscleGroup,omitempty"`
	TargetSets         int     `json:"targetSets"`
	TargetReps         string  `json:"targetReps"`
	TargetWeight       float64 `json:"targetWeight,omitempty"`
	Notes              string  `json:"notes,omitempty"`
	SortOrder          int     `json:"sortOrder"`
	CreatedAt          string  `json:"createdAt,omitempty"`
}

// ── Workout Session ──────────────────────────────────────────────────
// WorkoutSession represents a real workout execution (locked-in session).
type WorkoutSession struct {
	ID              string            `json:"id"`
	UserID          string            `json:"userId"`
	PlanID          string            `json:"planId,omitempty"`
	PlanDayID       string            `json:"planDayId,omitempty"`
	WorkoutName     string            `json:"workoutName"`
	Date            string            `json:"date"`
	DurationMinutes int               `json:"durationMinutes"`
	TotalVolumeKg   float64           `json:"totalVolumeKg"`
	Completed       bool              `json:"completed"`
	IsDraft         bool              `json:"isDraft"`
	Notes           string            `json:"notes,omitempty"`
	Exercises       []SessionExercise `json:"exercises,omitempty"`
	CreatedAt       string            `json:"createdAt"`
}

// StartWorkoutRequest is the JSON body for POST /api/workouts.
type StartWorkoutRequest struct {
	PlanDayID   string `json:"planDayId,omitempty"`
	WorkoutName string `json:"workoutName"`
}

// UpdateWorkoutRequest is the JSON body for PUT /api/workouts/{id}.
type UpdateWorkoutRequest struct {
	Exercises []UpdateSessionExerciseReq `json:"exercises,omitempty"`
	Notes     string                     `json:"notes,omitempty"`
}

// UpdateSessionExerciseReq updates a single exercise's sets within a session.
type UpdateSessionExerciseReq struct {
	ExerciseID string         `json:"exerciseId"`
	Sets       []UpdateSetReq `json:"sets"`
}

// UpdateSetReq updates an individual set's weight, reps, and completion.
type UpdateSetReq struct {
	SetNumber int     `json:"setNumber"`
	WeightKg  float64 `json:"weightKg"`
	Reps      int     `json:"reps"`
	Completed bool    `json:"completed"`
}

// ── Session Exercise ─────────────────────────────────────────────────
// SessionExercise is an exercise performed during a workout session.
type SessionExercise struct {
	ID           string        `json:"id"`
	SessionID    string        `json:"sessionId"`
	ExerciseID   string        `json:"exerciseId"`
	ExerciseName string        `json:"exerciseName"`
	MuscleGroup  string        `json:"muscleGroup"`
	SortOrder    int           `json:"sortOrder"`
	Notes        string        `json:"notes,omitempty"`
	Sets         []SessionSet  `json:"sets,omitempty"`
}

// ── Session Set ──────────────────────────────────────────────────────
// SessionSet is one set within a session exercise.
type SessionSet struct {
	ID                 string  `json:"id"`
	SessionExerciseID  string  `json:"sessionExerciseId"`
	SetNumber          int     `json:"setNumber"`
	WeightKg           float64 `json:"weightKg"`
	Reps               int     `json:"reps"`
	Completed          bool    `json:"completed"`
	RestSeconds        int     `json:"restSeconds"`
}

// ── Workout Template ─────────────────────────────────────────────────
// WorkoutTemplate is a pre-built workout plan template (e.g., PPL, Upper/Lower).
type WorkoutTemplate struct {
	Name        string              `json:"name"`
	Description string              `json:"description"`
	Days        []TemplateDay       `json:"days"`
}

// TemplateDay defines a day in a workout template.
type TemplateDay struct {
	DayOfWeek    int               `json:"dayOfWeek"`
	WorkoutName  string            `json:"workoutName"`
	Description  string            `json:"description,omitempty"`
	Exercises    []TemplateExercise `json:"exercises"`
}

// TemplateExercise is an exercise in a template day.
type TemplateExercise struct {
	Name        string `json:"name"`
	MuscleGroup string `json:"muscleGroup"`
	Equipment   string `json:"equipment"`
	TargetSets  int    `json:"targetSets"`
	TargetReps  string `json:"targetReps"`
}
