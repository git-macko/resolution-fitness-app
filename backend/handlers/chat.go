// Package handlers — AI Coach chat endpoint.
// POST /api/chat relays messages to OpenAI with user context injection.
// The backend enriches each request with user goals, allergies, recent
// workouts, and stats so the AI gives personalized responses.
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

// Chat handles POST /api/chat.
// Sends the user's message to OpenAI and returns the AI Coach's response.
// The backend injects user context (goals, allergies, recent activity)
// into the system prompt for personalized coaching.
//
// For now, this returns a graceful fallback response if no OpenAI key
// is configured. In production, replace with real OpenAI API call.
func Chat(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	var req models.ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if strings.TrimSpace(req.Message) == "" {
		utils.WriteError(w, http.StatusBadRequest, "Message is required")
		return
	}

	// ── Build personalized system prompt ──────────────────────────
	systemPrompt := buildSystemPrompt(userID)

	// ── Save user message to chat history ─────────────────────────
	msgID := uuid.New().String()
	database.DB.Exec(`
		INSERT INTO chat_messages (id, user_id, role, content, created_at)
		VALUES (?, ?, 'user', ?, datetime('now'))
	`, msgID, userID, req.Message)

	// ── Generate response ─────────────────────────────────────────
	// For now: return a contextual fallback response.
	// Replace with real OpenAI API call in production.
	reply := generateFallbackReply(req.Message, systemPrompt)

	// ── Save assistant message ────────────────────────────────────
	aiMsgID := uuid.New().String()
	database.DB.Exec(`
		INSERT INTO chat_messages (id, user_id, role, content, created_at)
		VALUES (?, ?, 'assistant', ?, datetime('now'))
	`, aiMsgID, userID, reply)

	resp := models.ChatResponse{
		Reply: reply,
		Metadata: &models.ChatMetadata{
			TokensUsed: 0,
			Model:      "gpt-4o-mini (simulated)",
		},
	}

	utils.WriteSuccess(w, resp, "Reply generated")
}

// GetChatHistory handles GET /api/chat/history.
// Returns recent chat messages for the authenticated user.
func GetChatHistory(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	rows, err := database.DB.Query(`
		SELECT id, user_id, role, content, created_at
		FROM chat_messages WHERE user_id = ?
		ORDER BY created_at DESC LIMIT 50
	`, userID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to fetch chat history")
		return
	}
	defer rows.Close()

	var messages []models.ChatMessage
	for rows.Next() {
		var msg models.ChatMessage
		rows.Scan(&msg.ID, &msg.UserID, &msg.Role, &msg.Content, &msg.CreatedAt)
		messages = append(messages, msg)
	}

	if messages == nil {
		messages = []models.ChatMessage{}
	}

	// Reverse to chronological order
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	utils.WriteSuccess(w, messages, "Chat history retrieved")
}

// GetChatSuggestions handles GET /api/chat/suggestions.
// Returns contextual suggested prompts based on user state.
func GetChatSuggestions(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	// Check if user has a plan for this week
	var hasPlan bool
	var planName string
	err := database.DB.QueryRow(`
		SELECT COALESCE(name, '') FROM weekly_plans
		WHERE user_id = ? AND week_start_date = ?
		LIMIT 1
	`, userID, utils.WeekStartString()).Scan(&planName)
	hasPlan = err == nil && planName != ""

	suggestions := []models.ChatSuggestion{
		{Prompt: "Motivate me! I need some gym inspiration today 🔥", Description: "Get a motivational boost", Category: "motivation"},
		{Prompt: "What should I eat for dinner? Suggest something healthy", Description: "Get a meal recommendation", Category: "nutrition"},
	}

	if !hasPlan {
		suggestions = append(suggestions, models.ChatSuggestion{
			Prompt: "Create a weekly workout plan for me", Description: "Get a personalized plan", Category: "workout",
		})
	} else {
		suggestions = append(suggestions, models.ChatSuggestion{
			Prompt: "Analyze my form for squats — what common mistakes should I avoid?", Description: "Form check advice", Category: "workout",
		})
	}

	suggestions = append(suggestions, models.ChatSuggestion{
		Prompt: "Give me a quick tip for better sleep and recovery", Description: "Recovery advice", Category: "general",
	})

	utils.WriteSuccess(w, suggestions, "Suggestions retrieved")
}

// ClearChatHistory handles DELETE /api/chat/history.
// Deletes all chat messages for the authenticated user.
func ClearChatHistory(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	_, err := database.DB.Exec("DELETE FROM chat_messages WHERE user_id = ?", userID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to clear history")
		return
	}

	utils.WriteSuccess(w, nil, "Chat history cleared")
}

// ── Helper Functions ─────────────────────────────────────────────────

// buildSystemPrompt creates a personalized system prompt with user context.
// This is injected into every request to the AI so it knows the user's
// goals, allergies, dietary restrictions, and recent activity.
func buildSystemPrompt(userID string) string {
	var displayName, fitnessLevel, primaryGoal string
	var allergiesJSON, dietaryPrefsJSON string

	database.DB.QueryRow(`
		SELECT COALESCE(display_name, 'Athlete'), COALESCE(fitness_level, 'beginner'),
		       COALESCE(primary_goal, 'general'), COALESCE(allergies, '[]'),
		       COALESCE(dietary_prefs, '[]')
		FROM users WHERE id = ?
	`, userID).Scan(&displayName, &fitnessLevel, &primaryGoal, &allergiesJSON, &dietaryPrefsJSON)

	var allergies, dietaryPrefs []string
	json.Unmarshal([]byte(allergiesJSON), &allergies)
	json.Unmarshal([]byte(dietaryPrefsJSON), &dietaryPrefs)

	// Get recent workout
	var recentWorkout string
	database.DB.QueryRow(`
		SELECT workout_name FROM workout_sessions
		WHERE user_id = ? AND completed = 1 ORDER BY date DESC LIMIT 1
	`, userID).Scan(&recentWorkout)

	// Get current streak
	var streak int
	database.DB.QueryRow(`
		SELECT COALESCE(current_streak, 0) FROM user_stats WHERE user_id = ?
	`, userID).Scan(&streak)

	prompt := "You are a certified personal trainer and nutrition coach. " +
		"Be encouraging but honest about health facts. Always prioritize safety. " +
		"Never recommend anything conflicting with the user's dietary restrictions.\n\n" +
		"User Profile:\n" +
		"- Name: " + displayName + "\n" +
		"- Fitness Level: " + fitnessLevel + "\n" +
		"- Primary Goal: " + primaryGoal + "\n"

	if len(allergies) > 0 {
		prompt += "- Allergies: " + strings.Join(allergies, ", ") + "\n"
	}
	if len(dietaryPrefs) > 0 {
		prompt += "- Dietary Preferences: " + strings.Join(dietaryPrefs, ", ") + "\n"
	}
	if recentWorkout != "" {
		prompt += "- Recent Workout: " + recentWorkout + "\n"
	}
	prompt += "- Current Streak: " + json.Number(json.Number(string(rune('0'+streak)))).String() + " days\n"

	return prompt
}

// generateFallbackReply creates a contextual reply when OpenAI is not configured.
// In production, replace with real OpenAI API call.
func generateFallbackReply(message, systemPrompt string) string {
	msg := strings.ToLower(message)

	// Simple keyword-based responses for demo
	if strings.Contains(msg, "workout") || strings.Contains(msg, "plan") || strings.Contains(msg, "exercise") {
		return "Great question! To create a personalized workout plan, I'd recommend starting with a Push/Pull/Legs split if you train 3 days a week, or an Upper/Lower split for 4 days. You can browse pre-built templates in the Fitness tab under \"Workout Templates\" — they're ready to use and you can customize them to your needs. What's your preferred training frequency? 💪"
	}
	if strings.Contains(msg, "eat") || strings.Contains(msg, "food") || strings.Contains(msg, "meal") || strings.Contains(msg, "diet") {
		return "Great question about nutrition! For your goals, focus on getting enough protein (about 1.6-2.2g per kg of bodyweight daily), staying hydrated (aim for 2-3L water), and timing your meals around workouts. Try the Food Scanner feature in the Health tab to analyze any food — just take a photo and I'll give you the honest facts! What specific nutrition question do you have? 🥗"
	}
	if strings.Contains(msg, "motivat") || strings.Contains(msg, "inspir") {
		return "You've got this! Every rep, every set, every meal — it all compounds. Remember: consistency beats intensity. The fact that you're here, showing up, is already a victory. Your current streak shows your dedication. Let's make today count! 🔥 What specific area would you like motivation for?"
	}
	if strings.Contains(msg, "form") || strings.Contains(msg, "technique") {
		return "Form is everything! The key principles: keep your core braced, control the eccentric (lowering) phase, and never sacrifice form for weight. Common mistakes include arching the back on bench press, knees caving in on squats, and using momentum on curls. Check the Exercise Library in the Fitness tab for detailed form tips with common mistakes for each exercise. Want me to break down a specific exercise's form?"
	}

	return "Thanks for asking! As your AI Coach, I'm here to help with workouts, nutrition, form advice, and motivation. Check out the Fitness tab to plan your weekly workouts, the Health tab to track meals and scan food, and your Dashboard to see your progress. What would you like to focus on today? 💪"
}
