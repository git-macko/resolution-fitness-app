// Package handlers contains all HTTP request handlers for the API.
// Each handler function follows the same pattern:
//  1. Parse and validate the request
//  2. Perform business logic (database queries, etc.)
//  3. Return a consistent JSON response
//
// All protected handlers extract the user ID from context (set by middleware.AuthRequired).
// Helper functions (writeJSON, writeError) are provided in handlers/helpers.go or utils/.
package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"resolution-fitnessapp-backend/database"
	"resolution-fitnessapp-backend/middleware"
	"resolution-fitnessapp-backend/models"
	"resolution-fitnessapp-backend/utils"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// ── Global JWT Secret ────────────────────────────────────────────────
// jwtSecret is set once at startup via InitAuth.
var jwtSecret []byte

// InitAuth initializes the JWT secret used for token generation and validation.
// Must be called once on server startup before any auth requests.
func InitAuth(secret string) {
	jwtSecret = []byte(secret)
}

// ── Auth Handler Functions ───────────────────────────────────────────

// Register handles POST /api/auth/register.
// It creates a new user account with email and password.
//
// Flow:
//  1. Validate request body (email, password)
//  2. Check if email is already registered → 409 Conflict
//  3. Hash the password with bcrypt (never store plain text!)
//  4. Create user record + default settings + stats
//  5. Generate JWT token (72h expiry)
//  6. Return { token, user }
func Register(w http.ResponseWriter, r *http.Request) {
	// ── Step 1: Parse request body ────────────────────────────────
	var req models.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// ── Step 2: Validate inputs ───────────────────────────────────
	if errMsg := utils.ValidateEmail(req.Email); errMsg != "" {
		utils.WriteError(w, http.StatusBadRequest, errMsg)
		return
	}
	if errMsg := utils.ValidatePassword(req.Password); errMsg != "" {
		utils.WriteError(w, http.StatusBadRequest, errMsg)
		return
	}

	// ── Step 3: Check if email already exists ─────────────────────
	var existingID string
	err := database.DB.QueryRow(
		"SELECT id FROM users WHERE email = ?", req.Email,
	).Scan(&existingID)
	if err == nil {
		// Email found → conflict
		utils.WriteError(w, http.StatusConflict, "Email already registered")
		return
	}

	// ── Step 4: Hash the password ─────────────────────────────────
	// bcrypt.DefaultCost = 10 rounds (1,024 iterations).
	// This makes brute-force attacks computationally expensive.
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to hash password")
		return
	}

	// ── Step 5: Create user in database ───────────────────────────
	userID := uuid.New().String()
	now := time.Now().UTC().Format(time.RFC3339)

	_, err = database.DB.Exec(`
		INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, userID, req.Email, string(hashedPassword), req.Email, now, now)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to create user")
		return
	}

	// ── Step 6: Create default settings ───────────────────────────
	// Every new user gets sensible defaults for all preferences.
	_, _ = database.DB.Exec(`
		INSERT INTO user_settings (user_id) VALUES (?)
	`, userID)

	// ── Step 7: Create initial stats record ───────────────────────
	_, _ = database.DB.Exec(`
		INSERT INTO user_stats (user_id, fitness_level, fitness_xp)
		VALUES (?, 1, 0)
	`, userID)

	// ── Step 8: Generate JWT token ────────────────────────────────
	token, err := generateToken(userID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to generate token")
		return
	}

	// ── Step 9: Return user + token ───────────────────────────────
	user := models.User{
		ID:                  userID,
		Email:               req.Email,
		DisplayName:         req.Email,
		FitnessLevel:        "beginner",
		PrimaryGoal:         "general",
		OnboardingCompleted: false,
		CreatedAt:           now,
		UpdatedAt:           now,
	}

	utils.WriteJSON(w, http.StatusCreated, models.AuthResponse{
		Token: token,
		User:  user,
	})
}

// Login handles POST /api/auth/login.
// It authenticates a user with email and password.
//
// Flow:
//  1. Validate request body
//  2. Look up user by email
//  3. Compare password hash with bcrypt
//  4. Generate JWT token (72h expiry)
//  5. Return { token, user }
func Login(w http.ResponseWriter, r *http.Request) {
	// ── Step 1: Parse request body ────────────────────────────────
	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// ── Step 2: Validate inputs ───────────────────────────────────
	if req.Email == "" || req.Password == "" {
		utils.WriteError(w, http.StatusBadRequest, "Email and password are required")
		return
	}

	// ── Step 3: Find user by email ────────────────────────────────
	var user models.User
	var allergiesJSON, dietaryPrefsJSON string
	err := database.DB.QueryRow(`
		SELECT id, email, password_hash, display_name, phone_number,
		       date_of_birth, gender, height_cm, fitness_level, primary_goal,
		       allergies, dietary_prefs, photo_url,
		       CASE WHEN onboarding_completed THEN 1 ELSE 0 END,
		       created_at, updated_at
		FROM users WHERE email = ?
	`, req.Email).Scan(
		&user.ID, &user.Email, &user.PasswordHash, &user.DisplayName, &user.PhoneNumber,
		&user.DateOfBirth, &user.Gender, &user.HeightCm, &user.FitnessLevel, &user.PrimaryGoal,
		&allergiesJSON, &dietaryPrefsJSON, &user.PhotoURL,
		&user.OnboardingCompleted,
		&user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		// Don't reveal whether the email exists or not — same error for both cases.
		utils.WriteError(w, http.StatusUnauthorized, "Invalid email or password")
		return
	}

	// ── Step 4: Verify password ───────────────────────────────────
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		utils.WriteError(w, http.StatusUnauthorized, "Invalid email or password")
		return
	}

	// ── Parse JSON arrays from TEXT columns ───────────────────────
	json.Unmarshal([]byte(allergiesJSON), &user.Allergies)
	json.Unmarshal([]byte(dietaryPrefsJSON), &user.DietaryPrefs)

	// ── Step 5: Generate JWT token ────────────────────────────────
	token, err := generateToken(user.ID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to generate token")
		return
	}

	// ── Format profile picture URL ────────────────────────────────
	user.PhotoURL = formatPictureURL(user.PhotoURL)

	utils.WriteJSON(w, http.StatusOK, models.AuthResponse{
		Token: token,
		User:  user,
	})
}

// RefreshToken handles POST /api/auth/refresh.
// It generates a new JWT token for an authenticated user (must provide valid token).
func RefreshToken(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(string)

	token, err := generateToken(userID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to refresh token")
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]string{"token": token})
}

// ── Token Generation ─────────────────────────────────────────────────
// generateToken creates a new JWT token for the given user ID.
// The token includes:
//   - user_id: the authenticated user's UUID
//   - exp: expiry time (72 hours from now)
//   - iat: issued at time
//
// Tokens are signed with HMAC-SHA256 using the server's JWT secret.
func generateToken(userID string) (string, error) {
	claims := jwt.MapClaims{
		"user_id": userID,
		"exp":     time.Now().Add(72 * time.Hour).Unix(),
		"iat":     time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

// ── Helper Functions ─────────────────────────────────────────────────

// GetUserID extracts the authenticated user's ID from the request context.
// It is set by the AuthRequired middleware.
// Returns empty string if not found (should only happen on unprotected routes).
func GetUserID(r *http.Request) string {
	userID, _ := r.Context().Value(middleware.UserIDKey).(string)
	return userID
}

// formatPictureURL converts a stored filename to a full URL path.
// If the pic is already a full URL or has a leading slash, returns as-is.
// Otherwise, prepends "/uploads/" to the filename.
func formatPictureURL(pic string) string {
	if pic == "" {
		return ""
	}
	// Already a full URL (starts with http) or already has /uploads/ prefix
	if len(pic) > 4 && pic[:4] == "http" {
		return pic
	}
	if len(pic) > 0 && pic[0] == '/' {
		return pic
	}
	return "/uploads/" + pic
}

// VerifyPassword checks the provided password against a bcrypt hash.
// Returns true if the password matches, false otherwise.
// Used by DeleteAccount to confirm identity before account deletion.
func VerifyPassword(hash, password string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}
