package models

// ── User ─────────────────────────────────────────────────────────────
// User is the core account model. Stored in the 'users' table.
// PasswordHash is never serialized to JSON (json:"-" tag).
type User struct {
	ID                  string   `json:"id"`
	Email               string   `json:"email"`
	PasswordHash        string   `json:"-"`
	DisplayName         string   `json:"displayName"`
	PhoneNumber         string   `json:"phoneNumber,omitempty"`
	DateOfBirth         string   `json:"dateOfBirth,omitempty"`
	Gender              string   `json:"gender,omitempty"`
	HeightCm            float64  `json:"heightCm,omitempty"`
	FitnessLevel        string   `json:"fitnessLevel"`
	PrimaryGoal         string   `json:"primaryGoal"`
	Allergies           []string `json:"allergies"`
	DietaryPrefs        []string `json:"dietaryPrefs"`
	PhotoURL            string   `json:"photoUrl,omitempty"`
	OnboardingCompleted bool     `json:"onboardingCompleted"`
	CreatedAt           string   `json:"createdAt"`
	UpdatedAt           string   `json:"updatedAt"`
}

// ── User Settings ────────────────────────────────────────────────────
// UserSettings holds all app preferences. One-to-one with User.
type UserSettings struct {
	UserID             string `json:"userId"`
	Units              string `json:"units"`
	Notifications      bool   `json:"notifications"`
	WorkoutReminderTime string `json:"workoutReminderTime"`
	RestTimerSeconds   int    `json:"restTimerSeconds"`
	WeeklyWorkoutGoal  int    `json:"weeklyWorkoutGoal"`
	CalorieTarget      int    `json:"calorieTarget"`
	ProteinTargetGrams int    `json:"proteinTargetGrams"`
	WaterGoalMl        int    `json:"waterGoalMl"`
	Theme              string `json:"theme"`
	AiModel            string `json:"aiModel"`
	OpenAIKeyEnc       string `json:"-"`
	CreatedAt          string `json:"createdAt"`
	UpdatedAt          string `json:"updatedAt"`
}

// ── User Stats ───────────────────────────────────────────────────────
// UserStats tracks gamification and progression data.
type UserStats struct {
	UserID         string  `json:"userId"`
	TotalWorkouts  int     `json:"totalWorkouts"`
	TotalMinutes   int     `json:"totalMinutes"`
	TotalVolumeKg  float64 `json:"totalVolumeKg"`
	CurrentStreak  int     `json:"currentStreak"`
	LongestStreak  int     `json:"longestStreak"`
	FitnessLevel   int     `json:"fitnessLevel"`
	FitnessXP      int     `json:"fitnessXp"`
	LastWorkoutDate string `json:"lastWorkoutDate,omitempty"`
	JoinDate       string  `json:"joinDate"`
	UpdatedAt      string  `json:"updatedAt"`
}

// ── User Goal ────────────────────────────────────────────────────────
// UserGoal is a single fitness objective with progress tracking.
type UserGoal struct {
	ID        string  `json:"id"`
	UserID    string  `json:"userId"`
	Title     string  `json:"title"`
	Target    float64 `json:"target"`
	Current   float64 `json:"current"`
	Unit      string  `json:"unit"`
	Deadline  string  `json:"deadline,omitempty"`
	Completed bool    `json:"completed"`
	CreatedAt string  `json:"createdAt"`
}

// ── Auth Request/Response DTOs ───────────────────────────────────────

// RegisterRequest is the JSON body for POST /api/auth/register.
type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// LoginRequest is the JSON body for POST /api/auth/login.
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// AuthResponse is returned after successful login or registration.
type AuthResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

// ── Profile Request DTOs ─────────────────────────────────────────────

// UpdateProfileRequest is the JSON body for PUT /api/profile.
type UpdateProfileRequest struct {
	DisplayName  string   `json:"displayName"`
	PhoneNumber  string   `json:"phoneNumber,omitempty"`
	DateOfBirth  string   `json:"dateOfBirth,omitempty"`
	Gender       string   `json:"gender,omitempty"`
	HeightCm     float64  `json:"heightCm,omitempty"`
	FitnessLevel string   `json:"fitnessLevel,omitempty"`
	PrimaryGoal  string   `json:"primaryGoal,omitempty"`
	Allergies    []string `json:"allergies,omitempty"`
	DietaryPrefs []string `json:"dietaryPrefs,omitempty"`
}

// UpdateSettingsRequest is the JSON body for PUT /api/profile/settings.
type UpdateSettingsRequest struct {
	Units              string `json:"units,omitempty"`
	Notifications      *bool  `json:"notifications,omitempty"`
	WorkoutReminderTime string `json:"workoutReminderTime,omitempty"`
	RestTimerSeconds   *int   `json:"restTimerSeconds,omitempty"`
	WeeklyWorkoutGoal  *int   `json:"weeklyWorkoutGoal,omitempty"`
	CalorieTarget      *int   `json:"calorieTarget,omitempty"`
	ProteinTargetGrams *int   `json:"proteinTargetGrams,omitempty"`
	WaterGoalMl        *int   `json:"waterGoalMl,omitempty"`
	Theme              string `json:"theme,omitempty"`
	AiModel            string `json:"aiModel,omitempty"`
	OpenAIKey          string `json:"openAiKey,omitempty"`
}
