package handlers

import (
	"fmt"
	"net/http"
	"time"

	"resolution-fitnessapp-backend/database"
	"resolution-fitnessapp-backend/utils"
)

// defaultAIDailyLimit is used when AI_DAILY_LIMIT is unset or invalid.
// It is a per-user allowance (not per-IP), so one user cannot spend the
// whole Gemini quota for everyone else on the deployment.
const defaultAIDailyLimit = 20

// aiDailyLimit is the active per-user allowance for a calendar day.
var aiDailyLimit = defaultAIDailyLimit

// InitAIDailyLimit sets the per-user daily AI request allowance.
// Called from main.go during startup with AI_DAILY_LIMIT.
func InitAIDailyLimit(limit int) {
	if limit > 0 {
		aiDailyLimit = limit
	} else {
		aiDailyLimit = defaultAIDailyLimit
	}
}

// AIUsage describes how much of today's AI allowance the user has spent.
type AIUsage struct {
	Used      int `json:"used"`
	Limit     int `json:"limit"`
	Remaining int `json:"remaining"`
	// ResetsAt is the next UTC midnight, in RFC3339 form.
	ResetsAt string `json:"resetsAt"`
}

// currentAIUsage reads today's count for a user and builds the
// allowance snapshot the app shows on every AI screen.
func currentAIUsage(userID string) AIUsage {
	used := 0
	// A missing row simply means the user hasn't made an AI request today.
	database.DB.QueryRow(
		`SELECT used FROM ai_usage_daily WHERE user_id = ? AND day = date('now')`,
		userID,
	).Scan(&used)

	remaining := aiDailyLimit - used
	if remaining < 0 {
		remaining = 0
	}

	now := time.Now().UTC()
	resets := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).Add(24 * time.Hour)

	return AIUsage{
		Used:      used,
		Limit:     aiDailyLimit,
		Remaining: remaining,
		ResetsAt:  resets.Format(time.RFC3339),
	}
}

// checkAIUsage reports whether the user still has allowance left. When the
// allowance is exhausted it writes a 429 with a clear, user-facing message
// and returns false so the caller can stop early.
func checkAIUsage(w http.ResponseWriter, userID string) bool {
	if currentAIUsage(userID).Remaining > 0 {
		return true
	}
	utils.WriteError(w, http.StatusTooManyRequests,
		fmt.Sprintf("You've used all %d AI requests for today. It resets at midnight.", aiDailyLimit))
	return false
}

// recordAIUsage counts one AI request against today's allowance.
// Recording is best-effort: a failed write must never break the AI call,
// and the worst case is that the notice under-counts by one.
func recordAIUsage(userID string) {
	database.DB.Exec(`
		INSERT INTO ai_usage_daily (user_id, day, used, updated_at)
		VALUES (?, date('now'), 1, datetime('now'))
		ON CONFLICT(user_id, day) DO UPDATE SET
			used = used + 1,
			updated_at = datetime('now')
	`, userID)
}

// GetAIUsage handles GET /api/ai/usage.
// Returns today's used/limit/remaining allowance for the authenticated user.
func GetAIUsage(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	utils.WriteSuccess(w, currentAIUsage(userID), "AI usage retrieved")
}
