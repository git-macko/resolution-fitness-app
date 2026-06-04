// Package handlers — profile management endpoints.
// These cover user profile CRUD, settings, and profile picture upload.
package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"resolution-fitnessapp-backend/database"
	"resolution-fitnessapp-backend/models"
	"resolution-fitnessapp-backend/utils"
)

// ── Profile CRUD ─────────────────────────────────────────────────────

// GetProfile handles GET /api/profile.
// Returns the authenticated user's full profile data.
// The user ID is extracted from the JWT token (injected into context by middleware).
func GetProfile(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	if userID == "" {
		utils.WriteError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	user, err := fetchUserByID(userID)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "User not found")
		return
	}

	// Also fetch stats for the profile screen
	stats, _ := fetchStatsByUserID(userID)

	utils.WriteSuccess(w, map[string]interface{}{
		"user":  user,
		"stats": stats,
	}, "Profile retrieved")
}

// UpdateProfile handles PUT /api/profile.
// Updates the authenticated user's profile fields.
func UpdateProfile(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	if userID == "" {
		utils.WriteError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	var req models.UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// ── Validate inputs ───────────────────────────────────────────
	if req.DisplayName != "" {
		if errMsg := utils.ValidateDisplayName(req.DisplayName); errMsg != "" {
			utils.WriteError(w, http.StatusBadRequest, errMsg)
			return
		}
	}
	if req.Gender != "" {
		if errMsg := utils.ValidateGender(req.Gender); errMsg != "" {
			utils.WriteError(w, http.StatusBadRequest, errMsg)
			return
		}
	}
	if req.FitnessLevel != "" {
		if errMsg := utils.ValidateFitnessLevel(req.FitnessLevel); errMsg != "" {
			utils.WriteError(w, http.StatusBadRequest, errMsg)
			return
		}
	}
	if req.PrimaryGoal != "" {
		if errMsg := utils.ValidatePrimaryGoal(req.PrimaryGoal); errMsg != "" {
			utils.WriteError(w, http.StatusBadRequest, errMsg)
			return
		}
	}

	// ── Serialize arrays to JSON for SQLite TEXT storage ──────────
	allergiesJSON, _ := json.Marshal(req.Allergies)
	dietaryPrefsJSON, _ := json.Marshal(req.DietaryPrefs)

	// ── Update in database ────────────────────────────────────────
	_, err := database.DB.Exec(`
		UPDATE users SET
			display_name = ?, phone_number = ?, date_of_birth = ?,
			gender = ?, height_cm = ?, fitness_level = ?, primary_goal = ?,
			allergies = ?, dietary_prefs = ?, updated_at = datetime('now')
		WHERE id = ?
	`, req.DisplayName, req.PhoneNumber, req.DateOfBirth,
		req.Gender, req.HeightCm, req.FitnessLevel, req.PrimaryGoal,
		string(allergiesJSON), string(dietaryPrefsJSON),
		userID)

	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to update profile")
		return
	}

	user, err := fetchUserByID(userID)
	if err != nil {
		log.Printf("ERROR refetching user after update (id=%s): %v", userID, err)
		utils.WriteError(w, http.StatusInternalServerError, "Profile updated but failed to retrieve")
		return
	}
	utils.WriteSuccess(w, user, "Profile updated")
}

// ── Profile Picture ──────────────────────────────────────────────────

// UploadProfilePic handles POST /api/profile/picture.
// Accepts multipart form data with a "profilePic" file field.
// Validates file type, saves with UUID filename, deletes old picture.
func UploadProfilePic(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	if userID == "" {
		utils.WriteError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	// ── Limit upload size to 10 MB ────────────────────────────────
	r.Body = http.MaxBytesReader(w, r.Body, utils.MaxUploadSize)

	if err := r.ParseMultipartForm(utils.MaxUploadSize); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "File too large. Max 10MB")
		return
	}

	file, header, err := r.FormFile("profilePic")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "No profile picture provided")
		return
	}
	defer file.Close()

	// ── Save the file with UUID-based filename ────────────────────
	picURL, err := utils.SaveUpload(file, header.Filename, "uploads")
	if err != nil {
		// Check if it's a file-type validation error
		if strings.Contains(err.Error(), "invalid file type") {
			utils.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		utils.WriteError(w, http.StatusInternalServerError, "Failed to save picture")
		return
	}

	// ── Delete old profile picture if exists ──────────────────────
	var oldPic string
	database.DB.QueryRow("SELECT photo_url FROM users WHERE id = ?", userID).Scan(&oldPic)
	if oldPic != "" {
		utils.DeleteFile(oldPic)
	}

	// ── Store new picture URL in database ─────────────────────────
	// Store only the relative path (e.g., "/uploads/abc.jpg")
	_, err = database.DB.Exec(
		"UPDATE users SET photo_url = ?, updated_at = datetime('now') WHERE id = ?",
		picURL, userID,
	)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to update picture")
		return
	}

	utils.WriteSuccess(w, map[string]string{"photoUrl": picURL}, "Profile picture uploaded")
}

// ── Settings ─────────────────────────────────────────────────────────

// GetSettings handles GET /api/profile/settings.
// Returns the authenticated user's app settings.
func GetSettings(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	if userID == "" {
		utils.WriteError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	settings, err := fetchSettingsByUserID(userID)
	if err != nil {
		// Create default settings if they don't exist
		database.DB.Exec("INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)", userID)
		settings, _ = fetchSettingsByUserID(userID)
	}

	utils.WriteSuccess(w, settings, "Settings retrieved")
}

// UpdateSettings handles PUT /api/profile/settings.
// Updates the authenticated user's app preferences.
func UpdateSettings(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	if userID == "" {
		utils.WriteError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	var req models.UpdateSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// ── Build dynamic UPDATE query ────────────────────────────────
	// Only update fields that were provided in the request.
	query := "UPDATE user_settings SET updated_at = datetime('now')"
	args := []interface{}{}

	if req.Units != "" {
		query += ", units = ?"
		args = append(args, req.Units)
	}
	if req.Notifications != nil {
		query += ", notifications = ?"
		args = append(args, *req.Notifications)
	}
	if req.WorkoutReminderTime != "" {
		query += ", workout_reminder_time = ?"
		args = append(args, req.WorkoutReminderTime)
	}
	if req.RestTimerSeconds != nil {
		query += ", rest_timer_seconds = ?"
		args = append(args, *req.RestTimerSeconds)
	}
	if req.WeeklyWorkoutGoal != nil {
		query += ", weekly_workout_goal = ?"
		args = append(args, *req.WeeklyWorkoutGoal)
	}
	if req.CalorieTarget != nil {
		query += ", calorie_target = ?"
		args = append(args, *req.CalorieTarget)
	}
	if req.ProteinTargetGrams != nil {
		query += ", protein_target_grams = ?"
		args = append(args, *req.ProteinTargetGrams)
	}
	if req.WaterGoalMl != nil {
		query += ", water_goal_ml = ?"
		args = append(args, *req.WaterGoalMl)
	}
	if req.Theme != "" {
		query += ", theme = ?"
		args = append(args, req.Theme)
	}
	if req.AiModel != "" {
		query += ", ai_model = ?"
		args = append(args, req.AiModel)
	}
	if req.OpenAIKey != "" {
		query += ", openai_api_key_enc = ?"
		args = append(args, req.OpenAIKey) // In production, encrypt this!
	}

	query += " WHERE user_id = ?"
	args = append(args, userID)

	_, err := database.DB.Exec(query, args...)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to update settings")
		return
	}

	settings, _ := fetchSettingsByUserID(userID)
	utils.WriteSuccess(w, settings, "Settings updated")
}

// ── Account Deletion ─────────────────────────────────────────────────

// DeleteAccount handles DELETE /api/profile.
// Permanently deletes the user account and all associated data (CASCADE).
// Requires the user's password for confirmation.
func DeleteAccount(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	if userID == "" {
		utils.WriteError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	// The All handler typically requires password confirmation
	var req struct {
		Password string `json:"password"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	// ── Verify password before deletion ────────────────────────
	var hash string
	err := database.DB.QueryRow(
		"SELECT password_hash FROM users WHERE id = ?", userID,
	).Scan(&hash)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "User not found")
		return
	}

	// Require password confirmation for account deletion
	if req.Password == "" {
		utils.WriteError(w, http.StatusBadRequest, "Password confirmation required")
		return
	}
	if !VerifyPassword(hash, req.Password) {
		utils.WriteError(w, http.StatusUnauthorized, "Incorrect password")
		return
	}

	// ── Delete user (CASCADE removes all related data) ────────────
	_, err = database.DB.Exec("DELETE FROM users WHERE id = ?", userID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to delete account")
		return
	}

	utils.WriteSuccess(w, nil, "Account deleted")
}

// ── Onboarding ───────────────────────────────────────────────────────

// CompleteOnboarding handles POST /api/profile/onboarding.
// Marks the user as having completed the onboarding flow.
func CompleteOnboarding(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	if userID == "" {
		utils.WriteError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	// Update profile fields from onboarding form
	var req struct {
		DisplayName  string   `json:"displayName"`
		FitnessLevel string   `json:"fitnessLevel"`
		PrimaryGoal  string   `json:"primaryGoal"`
		Allergies    []string `json:"allergies"`
		DietaryPrefs []string `json:"dietaryPrefs"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	allergiesJSON, _ := json.Marshal(req.Allergies)
	dietaryJSON, _ := json.Marshal(req.DietaryPrefs)

	_, err := database.DB.Exec(`
		UPDATE users SET
			display_name = ?, fitness_level = ?, primary_goal = ?,
			allergies = ?, dietary_prefs = ?,
			onboarding_completed = 1,
			updated_at = datetime('now')
		WHERE id = ?
	`, req.DisplayName, req.FitnessLevel, req.PrimaryGoal,
		string(allergiesJSON), string(dietaryJSON),
		userID)

	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to complete onboarding")
		return
	}

	user, err := fetchUserByID(userID)
	if err != nil {
		log.Printf("ERROR refetching user after onboarding (id=%s): %v", userID, err)
		utils.WriteError(w, http.StatusInternalServerError, "Onboarding completed but failed to retrieve user")
		return
	}
	utils.WriteSuccess(w, user, "Onboarding completed")
}

// ── Database Helpers ─────────────────────────────────────────────────

// fetchUserByID retrieves a user from the database by ID.
// Handles JSON array parsing for allergies and dietary_prefs columns.
func fetchUserByID(userID string) (*models.User, error) {
	var user models.User
	var allergiesJSON, dietaryPrefsJSON string
	var onboardingInt int

	err := database.DB.QueryRow(`
		SELECT id, email, display_name, phone_number, date_of_birth,
		       gender, height_cm, fitness_level, primary_goal,
		       allergies, dietary_prefs, photo_url,
		       CASE WHEN onboarding_completed THEN 1 ELSE 0 END,
		       created_at, updated_at
		FROM users WHERE id = ?
	`, userID).Scan(
		&user.ID, &user.Email, &user.DisplayName, &user.PhoneNumber, &user.DateOfBirth,
		&user.Gender, &user.HeightCm, &user.FitnessLevel, &user.PrimaryGoal,
		&allergiesJSON, &dietaryPrefsJSON, &user.PhotoURL,
		&onboardingInt,
		&user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	user.OnboardingCompleted = onboardingInt == 1
	json.Unmarshal([]byte(allergiesJSON), &user.Allergies)
	json.Unmarshal([]byte(dietaryPrefsJSON), &user.DietaryPrefs)

	// Handle nil arrays
	if user.Allergies == nil {
		user.Allergies = []string{}
	}
	if user.DietaryPrefs == nil {
		user.DietaryPrefs = []string{}
	}

	user.PhotoURL = formatPictureURL(user.PhotoURL)
	return &user, nil
}

// fetchSettingsByUserID retrieves user settings from the database.
func fetchSettingsByUserID(userID string) (*models.UserSettings, error) {
	var settings models.UserSettings
	var notificationsInt int
	var emptyOpenAI string

	err := database.DB.QueryRow(`
		SELECT user_id, units, notifications, workout_reminder_time,
		       rest_timer_seconds, weekly_workout_goal, calorie_target,
		       protein_target_grams, water_goal_ml, theme, ai_model,
		       COALESCE(openai_api_key_enc, ''),
		       created_at, updated_at
		FROM user_settings WHERE user_id = ?
	`, userID).Scan(
		&settings.UserID, &settings.Units, &notificationsInt, &settings.WorkoutReminderTime,
		&settings.RestTimerSeconds, &settings.WeeklyWorkoutGoal, &settings.CalorieTarget,
		&settings.ProteinTargetGrams, &settings.WaterGoalMl, &settings.Theme, &settings.AiModel,
		&emptyOpenAI,
		&settings.CreatedAt, &settings.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	settings.Notifications = notificationsInt == 1
	_ = emptyOpenAI // not exposed to client
	return &settings, nil
}

// fetchStatsByUserID retrieves user gamification stats from the database.
func fetchStatsByUserID(userID string) (*models.UserStats, error) {
	var stats models.UserStats
	err := database.DB.QueryRow(`
		SELECT user_id, total_workouts, total_minutes, total_volume_kg,
		       current_streak, longest_streak, fitness_level, fitness_xp,
		       COALESCE(last_workout_date, ''), join_date, updated_at
		FROM user_stats WHERE user_id = ?
	`, userID).Scan(
		&stats.UserID, &stats.TotalWorkouts, &stats.TotalMinutes,
		&stats.TotalVolumeKg, &stats.CurrentStreak, &stats.LongestStreak,
		&stats.FitnessLevel, &stats.FitnessXP, &stats.LastWorkoutDate,
		&stats.JoinDate, &stats.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &stats, nil
}

// ── Health Check ─────────────────────────────────────────────────────
// HealthCheck handles GET /api/health.
// Simple endpoint to verify the server is running.
func HealthCheck(w http.ResponseWriter, r *http.Request) {
	utils.WriteSuccess(w, map[string]string{"status": "healthy"}, "Server is running")
}
