// Package handlers — AI Coach chat endpoint.
// POST /api/chat relays messages to Google Gemini with user context injection.
// The backend enriches each request with user goals, allergies, recent
// workouts, and stats so the AI gives personalized responses.
package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"resolution-fitnessapp-backend/database"
	"resolution-fitnessapp-backend/models"
	"resolution-fitnessapp-backend/utils"

	"github.com/google/uuid"
)

// Chat handles POST /api/chat.
// Sends the user's message to Google Gemini and returns the AI Coach's response.
// The backend injects user context (goals, allergies, recent activity)
// into the system prompt for personalized coaching.
//
// When no Gemini API key is configured, returns a graceful fallback response.
func Chat(w http.ResponseWriter, r *http.Request) {
	chatCore(w, r, false)
}

// ChatStream handles POST /api/chat/stream.
// Streams the AI Coach's response using Server-Sent Events so the frontend
// can display Mimi's reply word-by-word as it is generated.
func ChatStream(w http.ResponseWriter, r *http.Request) {
	chatCore(w, r, true)
}

// chatCore contains the shared logic for the chat and streaming chat endpoints.
// When stream is true, it streams SSE events; otherwise it returns a JSON response.
func chatCore(w http.ResponseWriter, r *http.Request, stream bool) {
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

	// ── Retrieve recent chat history for context ──────────────────
	// If the frontend didn't send history, load the last 10 messages
	// from the database so Mimi can remember the conversation.
	history := req.History
	if len(history) == 0 {
		history = loadRecentChatHistory(userID, 10)
	}

	// ── Save user message to chat history ─────────────────────────
	msgID := uuid.New().String()
	database.DB.Exec(`
		INSERT INTO chat_messages (id, user_id, role, content, created_at)
		VALUES (?, ?, 'user', ?, datetime('now'))
	`, msgID, userID, req.Message)

	// ── Generate response ─────────────────────────────────────────
	var reply string
	var model string
	var genErr error
	if geminiKey != "" {
		model = GeminiModel()
		if stream {
			reply, genErr = generateGeminiChatReplyStream(w, req.Message, history, systemPrompt)
		} else {
			reply, genErr = generateGeminiChatReply(req.Message, history, systemPrompt)
		}
	} else if stream {
		reply = generateFallbackReply(req.Message, systemPrompt)
		model = "fallback"
		streamFallbackReply(w, reply)
	} else {
		reply = generateFallbackReply(req.Message, systemPrompt)
		model = "fallback"
	}

	// ── Handle quota exhaustion ───────────────────────────────────
	// When the Gemini free-tier limit is used up, tell the user clearly
	// and do not save a fake assistant message to history.
	if genErr == ErrQuotaExceeded {
		if !stream {
			utils.WriteError(w, http.StatusTooManyRequests, geminiLimitMessage)
			return
		}
		// Streaming path already wrote an final error event.
		return
	}

	// ── Save assistant message ────────────────────────────────────
	aiMsgID := uuid.New().String()
	database.DB.Exec(`
		INSERT INTO chat_messages (id, user_id, role, content, created_at)
		VALUES (?, ?, 'assistant', ?, datetime('now'))
	`, aiMsgID, userID, reply)

	// Streaming path already wrote all data; just return.
	if stream {
		return
	}

	resp := models.ChatResponse{
		Reply: reply,
		Metadata: &models.ChatMetadata{
			TokensUsed: 0,
			Model:      model,
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

// DeleteChatMessage handles DELETE /api/chat/history/{messageId}.
// Deletes a single chat message for the authenticated user.
// The message must belong to the user; otherwise it returns 404.
func DeleteChatMessage(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	messageID := r.PathValue("messageId")

	if messageID == "" {
		utils.WriteError(w, http.StatusBadRequest, "Message ID is required")
		return
	}

	result, err := database.DB.Exec(
		"DELETE FROM chat_messages WHERE id = ? AND user_id = ?",
		messageID, userID,
	)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to delete message")
		return
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil || rowsAffected == 0 {
		utils.WriteError(w, http.StatusNotFound, "Message not found")
		return
	}

	utils.WriteSuccess(w, nil, "Message deleted")
}

// ChatPlan handles POST /api/chat/plan.
// Turns a natural-language workout request into a structured weekly plan
// and saves it to the user's account. The routine type can be "consistent"
// (repeating routine) or "one_time" (single-week override).
func ChatPlan(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	var req models.ChatPlanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if strings.TrimSpace(req.Message) == "" {
		utils.WriteError(w, http.StatusBadRequest, "Message is required")
		return
	}

	// Normalize routine type.
	routineType := req.RoutineType
	if routineType != "one_time" {
		routineType = "consistent"
	}

	// Gather user context for better plan generation.
	userContext := buildUserContextForPlan(userID)

	// Generate the plan payload.
	planReq, err := generatePlanFromChat(userID, req.Message, routineType, userContext)
	if err != nil {
		log.Printf("[chat] plan generation failed: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "Failed to generate plan")
		return
	}

	// Save the plan using the shared creation logic.
	plan, err := createWeeklyPlan(userID, *planReq)
	if err != nil {
		log.Printf("[chat] plan creation failed: %v", err)
		switch err.Error() {
		case "consistent limit reached":
			utils.WriteError(w, http.StatusConflict, "You can only have up to 2 routines. Delete an existing one to create a new one.")
		case "one_time limit reached":
			utils.WriteError(w, http.StatusConflict, "You can only have up to 3 one-time overrides. Delete or wait for one to expire.")
		case "one_time date collision":
			utils.WriteError(w, http.StatusConflict, "You already have a one-time plan scheduled for that week. Choose a different week or delete the existing one.")
		default:
			utils.WriteError(w, http.StatusInternalServerError, "Failed to create plan")
		}
		return
	}

	// Save a short confirmation to chat history so the conversation flows.
	aiMsgID := uuid.New().String()
	routineLabel := "routine"
	if routineType == "one_time" {
		routineLabel = "one-time plan"
	}
	database.DB.Exec(`
		INSERT INTO chat_messages (id, user_id, role, content, created_at)
		VALUES (?, ?, 'assistant', ?, datetime('now'))
	`, aiMsgID, userID, fmt.Sprintf("Done! I saved %s as a %s. 💪", plan.Name, routineLabel))

	utils.WriteCreated(w, plan, "Plan created")
}

// ── Helper Functions ─────────────────────────────────────────────────

// buildSystemPrompt creates a personalized system prompt with user context.
// This is injected into every request to the AI so it knows the user's
// goals, allergies, dietary restrictions, and recent activity.
func buildSystemPrompt(userID string) string {
	var displayName, fitnessLevel, primaryGoal string
	var allergiesJSON, dietaryPrefsJSON string
	var heightCm float64

	database.DB.QueryRow(`
		SELECT COALESCE(display_name, 'Athlete'), COALESCE(fitness_level, 'beginner'),
		       COALESCE(primary_goal, 'general'), COALESCE(allergies, '[]'),
		       COALESCE(dietary_prefs, '[]'), COALESCE(height_cm, 0)
		FROM users WHERE id = ?
	`, userID).Scan(&displayName, &fitnessLevel, &primaryGoal, &allergiesJSON, &dietaryPrefsJSON, &heightCm)

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

	// ── User settings ────────────────────────────────────────────
	var calorieTarget, proteinTarget, weeklyWorkoutGoal int
	database.DB.QueryRow(`
		SELECT COALESCE(calorie_target, 0), COALESCE(protein_target_grams, 0),
		       COALESCE(weekly_workout_goal, 0)
		FROM user_settings WHERE user_id = ?
	`, userID).Scan(&calorieTarget, &proteinTarget, &weeklyWorkoutGoal)

	prompt := "You are Mimi, an upbeat, empathetic, and knowledgeable AI fitness coach for the Resolution app. " +
		"Your personality is warm, encouraging, and conversational — like a supportive friend who happens to be a certified trainer and nutritionist. " +
		"Use the user's name naturally, ask follow-up questions when helpful, and keep responses concise but personable. " +
		"Be honest about health facts, prioritize safety, and never recommend anything conflicting with the user's allergies or dietary preferences. " +
		"You have access to the user's fitness data below — use it to personalize every answer. " +
		"Occasionally use emojis to match your friendly tone.\n\n" +
		"CRITICAL RESPONSE RULES:\n" +
		"- Keep every answer ultra-short and direct (1-2 sentences MAXIMUM).\n" +
		"- Do NOT write long explanations, lists, or detailed plans in chat.\n" +
		"- You can trigger interactive app buttons by appending specific tags to the very end of your response.\n" +
		"- Available tags (use ONLY these, max 1-2 per response):\n" +
		"  [ACTION:CreatePlan] - When proposing to build a new workout plan.\n" +
		"  [ACTION:ViewPlan] - When referring to their current active plan.\n" +
		"  [ACTION:StartWorkout] - When encouraging them to do a workout right now.\n" +
		"  [ACTION:LogWeight] - When asking about their weight or progress.\n\n" +
		"User Profile:\n" +
		"- Name: " + displayName + "\n" +
		"- Fitness Level: " + fitnessLevel + "\n" +
		"- Primary Goal: " + primaryGoal + "\n"

	if heightCm > 0 {
		prompt += fmt.Sprintf("- Height: %.1f cm\n", heightCm)
	}

	if len(allergies) > 0 {
		prompt += "- Allergies: " + strings.Join(allergies, ", ") + "\n"
	}
	if len(dietaryPrefs) > 0 {
		prompt += "- Dietary Preferences: " + strings.Join(dietaryPrefs, ", ") + "\n"
	}
	if recentWorkout != "" {
		prompt += "- Recent Workout: " + recentWorkout + "\n"
	}
	prompt += fmt.Sprintf("- Current Streak: %d days\n", streak)

	// ── Active weekly plan ───────────────────────────────────────
	var planName string
	database.DB.QueryRow(`
		SELECT COALESCE(name, '') FROM weekly_plans
		WHERE user_id = ? AND is_active = 1
		ORDER BY updated_at DESC LIMIT 1
	`, userID).Scan(&planName)

	// ── Today's nutrition ────────────────────────────────────────
	var todayCalories int
	var todayProtein, todayCarbs, todayFat float64
	database.DB.QueryRow(`
		SELECT COALESCE(SUM(total_calories), 0),
		       COALESCE(SUM(total_protein_g), 0),
		       COALESCE(SUM(total_carbs_g), 0),
		       COALESCE(SUM(total_fat_g), 0)
		FROM food_logs
		WHERE user_id = ? AND log_date = date('now')
	`, userID).Scan(&todayCalories, &todayProtein, &todayCarbs, &todayFat)

	var waterMl int
	database.DB.QueryRow(`
		SELECT COALESCE(SUM(amount_ml), 0) FROM water_logs
		WHERE user_id = ? AND log_date = date('now')
	`, userID).Scan(&waterMl)

	// ── Latest weight ──────────────────────────────────────────
	var latestWeight float64
	database.DB.QueryRow(`
		SELECT weight_kg FROM weight_logs
		WHERE user_id = ? ORDER BY date DESC LIMIT 1
	`, userID).Scan(&latestWeight)

	// ── Latest sleep ─────────────────────────────────────────────
	var latestSleepHours float64
	var latestSleepQuality int
	database.DB.QueryRow(`
		SELECT duration_hours, quality FROM sleep_logs
		WHERE user_id = ? ORDER BY date DESC LIMIT 1
	`, userID).Scan(&latestSleepHours, &latestSleepQuality)

	// ── Latest body measurements ─────────────────────────────────
	var chestCm, waistCm, armsCm, thighsCm, hipsCm float64
	database.DB.QueryRow(`
		SELECT chest_cm, waist_cm, arms_cm, thighs_cm, hips_cm
		FROM body_measurements
		WHERE user_id = ?
		ORDER BY date DESC LIMIT 1
	`, userID).Scan(&chestCm, &waistCm, &armsCm, &thighsCm, &hipsCm)

	// ── Recent food scans ──────────────────────────────────────
	var recentScans []string
	rows, err := database.DB.Query(`
		SELECT COALESCE(name, '') FROM scanned_foods
		WHERE user_id = ?
		ORDER BY created_at DESC LIMIT 3
	`, userID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var name string
			rows.Scan(&name)
			if name != "" {
				recentScans = append(recentScans, name)
			}
		}
	}

	// ── User goals ───────────────────────────────────────────────
	var goals []string
	goalRows, err := database.DB.Query(`
		SELECT title, target, current, unit FROM user_goals
		WHERE user_id = ? AND completed = 0
		ORDER BY created_at DESC LIMIT 3
	`, userID)
	if err == nil {
		defer goalRows.Close()
		for goalRows.Next() {
			var title, unit string
			var target, current float64
			goalRows.Scan(&title, &target, &current, &unit)
			if title != "" {
				goals = append(goals, fmt.Sprintf("%s: %.1f%s / %.1f%s", title, current, unit, target, unit))
			}
		}
	}

	// ── Recent workout summary ─────────────────────────────────
	var workoutsThisWeek int
	database.DB.QueryRow(`
		SELECT COUNT(*) FROM workout_sessions
		WHERE user_id = ? AND completed = 1
		AND date >= date('now', 'weekday 0', '-7 days')
	`, userID).Scan(&workoutsThisWeek)

	// Append database context to prompt
	prompt += "\nUser Database Context:\n"
	if planName != "" {
		prompt += fmt.Sprintf("- Active Weekly Plan: %s\n", planName)
	}
	if weeklyWorkoutGoal > 0 {
		prompt += fmt.Sprintf("- Weekly workout goal: %d sessions\n", weeklyWorkoutGoal)
	}
	prompt += fmt.Sprintf("- Workouts completed this week: %d\n", workoutsThisWeek)
	if calorieTarget > 0 {
		prompt += fmt.Sprintf("- Calorie target: %d kcal/day\n", calorieTarget)
	}
	if proteinTarget > 0 {
		prompt += fmt.Sprintf("- Protein target: %d g/day\n", proteinTarget)
	}
	if todayCalories > 0 || todayProtein > 0 || todayCarbs > 0 || todayFat > 0 {
		prompt += fmt.Sprintf("- Today's nutrition: %d kcal, %.1fg protein, %.1fg carbs, %.1fg fat\n",
			todayCalories, todayProtein, todayCarbs, todayFat)
	}
	if waterMl > 0 {
		prompt += fmt.Sprintf("- Today's water intake: %d ml\n", waterMl)
	}
	if latestWeight > 0 {
		prompt += fmt.Sprintf("- Latest weight: %.1f kg\n", latestWeight)
	}
	if latestSleepHours > 0 {
		prompt += fmt.Sprintf("- Latest sleep: %.1f hours (quality %d/5)\n", latestSleepHours, latestSleepQuality)
	}
	if chestCm > 0 || waistCm > 0 || armsCm > 0 || thighsCm > 0 || hipsCm > 0 {
		prompt += fmt.Sprintf("- Latest measurements (cm): chest %.1f, waist %.1f, arms %.1f, thighs %.1f, hips %.1f\n",
			chestCm, waistCm, armsCm, thighsCm, hipsCm)
	}
	if len(recentScans) > 0 {
		prompt += "- Recent food scans: " + strings.Join(recentScans, ", ") + "\n"
	}
	if len(goals) > 0 {
		prompt += "- Active goals:\n"
		for _, g := range goals {
			prompt += "  - " + g + "\n"
		}
	}

	return prompt
}

// generateGeminiChatReplyStream streams the model's response as Server-Sent Events
// and returns the complete reply text. It is used by the streaming chat endpoint.
// Returns ErrQuotaExceeded when the Gemini free-tier limit has been used up.
func generateGeminiChatReplyStream(w http.ResponseWriter, message string, history []models.ChatMessage, systemPrompt string) (string, error) {
	reqBody := buildGeminiChatRequest(message, history, systemPrompt)

	// Set SSE headers and flush them immediately.
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}

	var fullText strings.Builder
	_, err := streamGemini(GeminiModel(), reqBody, func(chunk string) {
		fullText.WriteString(chunk)
		sseWrite(w, "chunk", map[string]string{"text": chunk})
	})

	if err != nil {
		if err == ErrQuotaExceeded {
			sseWrite(w, "error", map[string]string{"text": geminiLimitMessage})
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
			return "", ErrQuotaExceeded
		}

		log.Printf("[chat] Gemini streaming failed: %v", err)
		fallback := generateFallbackReply(message, systemPrompt)
		fullText.Reset()
		fullText.WriteString(fallback)
		sseWrite(w, "chunk", map[string]string{"text": fallback})
	}

	// Signal completion to the client.
	sseWrite(w, "done", map[string]string{"text": fullText.String()})
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}

	return fullText.String(), nil
}

// streamFallbackReply sends a fallback reply through the SSE stream when Gemini
// is not configured. This ensures the client still sees a response.
func streamFallbackReply(w http.ResponseWriter, reply string) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}

	sseWrite(w, "chunk", map[string]string{"text": reply})
	sseWrite(w, "done", map[string]string{"text": reply})
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
}

// sseWrite encodes an event and sends it to the client.
func sseWrite(w http.ResponseWriter, event string, data interface{}) {
	payload, err := json.Marshal(data)
	if err != nil {
		return
	}
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, string(payload))
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
}

// buildGeminiChatRequest constructs the Gemini request body from the current
// message, history, and system prompt.
func buildGeminiChatRequest(message string, history []models.ChatMessage, systemPrompt string) geminiGenerateRequest {
	var contents []geminiContent

	for _, msg := range history {
		role := "user"
		if msg.Role == "assistant" || msg.Role == "model" {
			role = "model"
		}
		if strings.TrimSpace(msg.Content) == "" {
			continue
		}
		contents = append(contents, geminiContent{
			Role:  role,
			Parts: []geminiPart{{Text: msg.Content}},
		})
	}

	contents = append(contents, geminiContent{
		Role:  "user",
		Parts: []geminiPart{{Text: message}},
	})

	return geminiGenerateRequest{
		SystemInstruction: &geminiContent{
			Parts: []geminiPart{{Text: systemPrompt}},
		},
		Contents: contents,
		GenerationConfig: geminiGenerationConfig{
			ResponseMimeType: "text/plain",
		},
	}
}

// generateGeminiChatReply sends the user's message to Google Gemini and returns
// the model's text response. It includes recent conversation history so Mimi
// can respond contextually. Returns a fallback reply if the API call fails.
// Returns ErrQuotaExceeded when the Gemini free-tier limit has been used up.
func generateGeminiChatReply(message string, history []models.ChatMessage, systemPrompt string) (string, error) {
	reqBody := buildGeminiChatRequest(message, history, systemPrompt)

	geminiResp, err := callGemini(GeminiModel(), reqBody)
	if err != nil {
		if err == ErrQuotaExceeded {
			return "", ErrQuotaExceeded
		}
		log.Printf("[chat] Gemini call failed: %v", err)
		return generateFallbackReply(message, systemPrompt), nil
	}

	if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
		log.Printf("[chat] Gemini returned empty candidates, falling back")
		return generateFallbackReply(message, systemPrompt), nil
	}

	reply := strings.TrimSpace(geminiResp.Candidates[0].Content.Parts[0].Text)
	if reply == "" {
		return generateFallbackReply(message, systemPrompt), nil
	}

	return reply, nil
}

// loadRecentChatHistory loads the most recent chat messages for a user from the
// database and returns them in chronological order.
func loadRecentChatHistory(userID string, limit int) []models.ChatMessage {
	rows, err := database.DB.Query(`
		SELECT role, content FROM chat_messages
		WHERE user_id = ?
		ORDER BY created_at DESC
		LIMIT ?
	`, userID, limit)
	if err != nil {
		log.Printf("[chat] failed to load history: %v", err)
		return nil
	}
	defer rows.Close()

	var history []models.ChatMessage
	for rows.Next() {
		var msg models.ChatMessage
		if err := rows.Scan(&msg.Role, &msg.Content); err != nil {
			continue
		}
		history = append(history, msg)
	}

	// Reverse to chronological order.
	for i, j := 0, len(history)-1; i < j; i, j = i+1, j-1 {
		history[i], history[j] = history[j], history[i]
	}

	return history
}

// generateFallbackReply creates a contextual reply when Gemini is not configured.
// Even offline, Mimi should sound like a real coach — warm, specific, and helpful.
func generateFallbackReply(message, systemPrompt string) string {
	msg := strings.ToLower(message)

	if strings.Contains(msg, "workout") || strings.Contains(msg, "plan") || strings.Contains(msg, "exercise") {
		return "I can build you a personalized workout plan right now! [ACTION:CreatePlan]"
	}
	if strings.Contains(msg, "weight") || strings.Contains(msg, "progress") {
		return "Tracking your progress helps us adjust your plan. Let's log your weight! [ACTION:LogWeight]"
	}
	if strings.Contains(msg, "eat") || strings.Contains(msg, "food") || strings.Contains(msg, "meal") || strings.Contains(msg, "diet") {
		return "Nutrition is key! Check the Health tab to log meals and water. 💧"
	}
	if strings.Contains(msg, "motivat") || strings.Contains(msg, "inspir") {
		return "Hey, it's Mimi! 💪 You showed up today — that already puts you ahead. What's one small win we can celebrate?"
	}
	if strings.Contains(msg, "form") || strings.Contains(msg, "technique") {
		return "Form first, weight second! Which exercise do you want me to break down?"
	}
	if strings.Contains(msg, "sleep") || strings.Contains(msg, "recover") || strings.Contains(msg, "rest") {
		return "Recovery is where the magic happens ✨. Aim for 7–9 hours of sleep and stay hydrated."
	}

	return "Hey, it's Mimi! 💖 What would you like to tackle today? [ACTION:StartWorkout]"
}

// buildUserContextForPlan gathers a rich profile summary used to personalize
// the AI-generated workout plan, including body metrics, preferences, and history.
func buildUserContextForPlan(userID string) string {
	var displayName, fitnessLevel, primaryGoal string
	var heightCm float64
	database.DB.QueryRow(`
		SELECT COALESCE(display_name, 'Athlete'), COALESCE(fitness_level, 'beginner'),
		       COALESCE(primary_goal, 'general'), COALESCE(height_cm, 0)
		FROM users WHERE id = ?
	`, userID).Scan(&displayName, &fitnessLevel, &primaryGoal, &heightCm)

	var weeklyWorkoutGoal, calorieTarget, proteinTarget int
	var reminderTime string
	database.DB.QueryRow(`
		SELECT COALESCE(weekly_workout_goal, 0), COALESCE(calorie_target, 0),
		       COALESCE(protein_target_grams, 0), COALESCE(workout_reminder_time, '')
		FROM user_settings WHERE user_id = ?
	`, userID).Scan(&weeklyWorkoutGoal, &calorieTarget, &proteinTarget, &reminderTime)

	var latestWeight float64
	database.DB.QueryRow(`
		SELECT weight_kg FROM weight_logs
		WHERE user_id = ? ORDER BY date DESC LIMIT 1
	`, userID).Scan(&latestWeight)

	// ── Existing workout plans ───────────────────────────────────
	// Include all consistent routines and one-time overrides with their
	// date ranges so Mimi can avoid suggesting conflicting plans.
	var existingPlans []string
	planRows, err := database.DB.Query(`
		SELECT name, COALESCE(routine_type, 'consistent'), COALESCE(week_start_date, ''), COALESCE(week_end_date, '')
		FROM weekly_plans
		WHERE user_id = ?
		ORDER BY routine_type, week_start_date
	`, userID)
	if err == nil {
		defer planRows.Close()
		for planRows.Next() {
			var pName, pType, pStart, pEnd string
			planRows.Scan(&pName, &pType, &pStart, &pEnd)
			if pName == "" {
				continue
			}
			if pType == "one_time" && pStart != "" && pEnd != "" {
				existingPlans = append(existingPlans, fmt.Sprintf("%s (one-time: %s to %s)", pName, pStart, pEnd))
			} else {
				existingPlans = append(existingPlans, fmt.Sprintf("%s (consistent)", pName))
			}
		}
	}

	var recentWorkouts []string
	rows, err := database.DB.Query(`
		SELECT workout_name, duration_minutes, total_volume_kg
		FROM workout_sessions
		WHERE user_id = ? AND completed = 1 AND date >= date('now', '-30 days')
		ORDER BY date DESC LIMIT 3
	`, userID)
	if err != nil {
		log.Printf("[chat] failed to load recent workouts for plan context: %v", err)
	} else if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var wName string
			var wDur int
			var wVol float64
			rows.Scan(&wName, &wDur, &wVol)
			recentWorkouts = append(recentWorkouts, fmt.Sprintf("%s (%dm, %.1fkg volume)", wName, wDur, wVol))
		}
	}

	var activeGoals []string
	gRows, err := database.DB.Query(`
		SELECT title, target, current, unit FROM user_goals
		WHERE user_id = ? AND completed = 0
		ORDER BY created_at DESC LIMIT 3
	`, userID)
	if err != nil {
		log.Printf("[chat] failed to load active goals for plan context: %v", err)
	} else if gRows != nil {
		defer gRows.Close()
		for gRows.Next() {
			var title, unit string
			var target, current float64
			gRows.Scan(&title, &target, &current, &unit)
			activeGoals = append(activeGoals, fmt.Sprintf("%s (%.1f/%.1f %s)", title, current, target, unit))
		}
	}

	parts := []string{
		"User: " + displayName,
		"Fitness level: " + fitnessLevel,
		"Primary goal: " + primaryGoal,
	}
	if heightCm > 0 {
		parts = append(parts, fmt.Sprintf("Height: %.1f cm", heightCm))
	}
	if latestWeight > 0 {
		parts = append(parts, fmt.Sprintf("Latest weight: %.1f kg", latestWeight))
	}
	if weeklyWorkoutGoal > 0 {
		parts = append(parts, fmt.Sprintf("Target weekly sessions: %d", weeklyWorkoutGoal))
	}
	if reminderTime != "" && reminderTime != "00:00" {
		parts = append(parts, fmt.Sprintf("Preferred workout time: %s", reminderTime))
	}
	if calorieTarget > 0 {
		parts = append(parts, fmt.Sprintf("Calorie target: %d kcal", calorieTarget))
	}
	if proteinTarget > 0 {
		parts = append(parts, fmt.Sprintf("Protein target: %d g", proteinTarget))
	}
	if len(existingPlans) > 0 {
		parts = append(parts, "Existing plans: "+strings.Join(existingPlans, "; "))
	} else {
		parts = append(parts, "Existing plans: none")
	}
	if len(activeGoals) > 0 {
		parts = append(parts, "Active goals: "+strings.Join(activeGoals, ", "))
	}
	if len(recentWorkouts) > 0 {
		parts = append(parts, "Recent workouts: "+strings.Join(recentWorkouts, "; "))
	}
	return strings.Join(parts, "\n")
}

// generatePlanFromChat uses Gemini to turn a natural-language workout request
// into a structured CreatePlanRequest. It validates the generated exercises
// against the exercise library and falls back to custom names when needed.
func generatePlanFromChat(userID, message, routineType, userContext string) (*models.CreatePlanRequest, error) {
	// Fetch available exercises to ground the AI.
	exercises, err := fetchExerciseListForPlan()
	if err != nil {
		return nil, fmt.Errorf("fetch exercises: %w", err)
	}

	// Build the prompt.
	prompt := buildPlanGenerationPrompt(message, routineType, exercises, userContext)

	// If Gemini is not configured, return a sensible default plan.
	if geminiKey == "" {
		return defaultPlanFromChat(message, routineType, exercises), nil
	}

	reqBody := geminiGenerateRequest{
		SystemInstruction: &geminiContent{
			Parts: []geminiPart{{Text: "You are a knowledgeable fitness coach. Output only valid JSON."}},
		},
		Contents: []geminiContent{
			{Role: "user", Parts: []geminiPart{{Text: prompt}}},
		},
		GenerationConfig: geminiGenerationConfig{
			ResponseMimeType: "application/json",
		},
	}

	geminiResp, err := callGemini(GeminiModel(), reqBody)
	if err != nil {
		return nil, fmt.Errorf("gemini call: %w", err)
	}

	if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("gemini returned empty candidates")
	}

	text := strings.TrimSpace(geminiResp.Candidates[0].Content.Parts[0].Text)
	text = stripMarkdownFences(text)
	var planReq models.CreatePlanRequest
	if err := json.Unmarshal([]byte(text), &planReq); err != nil {
		return nil, fmt.Errorf("parse plan json: %w", err)
	}

	// Validate and normalize the generated plan.
	planReq.RoutineType = routineType
	if planReq.Name == "" {
		planReq.Name = "Mimi's Plan"
	}
	if len(planReq.Days) == 0 {
		return defaultPlanFromChat(message, routineType, exercises), nil
	}

	// Validate dayOfWeek values: must be 0-6 and unique.
	seenDays := make(map[int]bool)
	validDays := make([]models.CreatePlanDayReq, 0, len(planReq.Days))
	for _, day := range planReq.Days {
		if day.DayOfWeek < 0 || day.DayOfWeek > 6 {
			continue
		}
		if seenDays[day.DayOfWeek] {
			continue
		}
		seenDays[day.DayOfWeek] = true
		validDays = append(validDays, day)
	}
	planReq.Days = validDays
	if len(planReq.Days) == 0 {
		return defaultPlanFromChat(message, routineType, exercises), nil
	}

	// Ensure each exercise either matches a known ID or becomes a custom exercise.
	validIDs := make(map[string]bool)
	for _, ex := range exercises {
		validIDs[ex.ID] = true
	}
	for i := range planReq.Days {
		for j := range planReq.Days[i].Exercises {
			ex := &planReq.Days[i].Exercises[j]
			if ex.ExerciseID != "" && !validIDs[ex.ExerciseID] {
				// Unknown ID — treat as custom name.
				if ex.CustomExerciseName == "" {
					ex.CustomExerciseName = ex.ExerciseID
				}
				ex.ExerciseID = ""
			}
			if ex.TargetSets <= 0 {
				ex.TargetSets = 3
			}
			if strings.TrimSpace(ex.TargetReps) == "" {
				ex.TargetReps = "8-12"
			}
		}
	}

	return &planReq, nil
}

// buildPlanGenerationPrompt creates the prompt used to generate a structured
// workout plan from the user's natural-language request.
func buildPlanGenerationPrompt(message, routineType string, exercises []models.Exercise, userContext string) string {
	var b strings.Builder
	b.WriteString("Generate a weekly workout plan based on this user request:\n")
	b.WriteString(message)
	b.WriteString("\n\nRoutine type: ")
	b.WriteString(routineType)
	b.WriteString("\n\nUser Context & History:\n")
	b.WriteString(userContext)
	b.WriteString("\n\nInstructions:\n")
	b.WriteString("1. Use the provided user context to personalize duration, frequency, weight, and volume.\n")
	b.WriteString("2. Schedule exactly the user's target weekly number of sessions unless the request specifies otherwise.\n")
	b.WriteString("3. Include rest days (isRestDay: true) for days without a workout so the weekly schedule is balanced.\n")
	b.WriteString("4. If the user asks for home/bodyweight workouts, strongly prefer exercises with equipment 'Bodyweight'.\n")
	b.WriteString("5. Use the exact 'id' to match an exercise. If absolutely necessary, leave 'id' empty and use 'customExerciseName'.\n\n")
	b.WriteString("Available exercises (id | name | muscle_group | equipment_required):\n")
	for _, ex := range exercises {
		b.WriteString(fmt.Sprintf("- %s | %s | %s | %s\n", ex.ID, ex.Name, ex.MuscleGroup, ex.Equipment))
	}
	b.WriteString("\nOutput JSON matching this schema (no markdown, no extra text):\n")
	b.WriteString(`{
  "name": "Plan name",
  "mode": "strength",
  "modeGoal": "build muscle",
  "days": [
    {
      "dayOfWeek": 1,
      "workoutName": "Push",
      "isRestDay": false,
      "estimatedDuration": 45,
      "exercises": [
        {"exerciseId": "ex-001", "customExerciseName": "", "targetSets": 3, "targetReps": "8-12", "targetWeight": 0, "notes": ""}
      ]
    }
  ]
}`)
	return b.String()
}

// defaultPlanFromChat returns a safe fallback plan when Gemini is unavailable.
func defaultPlanFromChat(message, routineType string, exercises []models.Exercise) *models.CreatePlanRequest {
	// Try to find a few common exercises.
	findID := func(names ...string) string {
		for _, name := range names {
			for _, ex := range exercises {
				if strings.EqualFold(ex.Name, name) {
					return ex.ID
				}
			}
		}
		return ""
	}

	squatID := findID("Squat")
	benchID := findID("Bench Press")
	deadliftID := findID("Deadlift")
	pressID := findID("Overhead Press")
	rowID := findID("Barbell Row")

	req := &models.CreatePlanRequest{
		Name:        "Mimi's Full-Body Plan",
		Mode:        "strength",
		ModeGoal:    "build strength and muscle",
		RoutineType: routineType,
		Days: []models.CreatePlanDayReq{
			{
				DayOfWeek:         1,
				WorkoutName:       "Full Body A",
				EstimatedDuration: 45,
				Exercises: []models.CreatePlanExerciseReq{
					{ExerciseID: squatID, CustomExerciseName: "Squat", TargetSets: 3, TargetReps: "8-10"},
					{ExerciseID: benchID, CustomExerciseName: "Bench Press", TargetSets: 3, TargetReps: "8-12"},
					{ExerciseID: rowID, CustomExerciseName: "Barbell Row", TargetSets: 3, TargetReps: "8-12"},
				},
			},
			{
				DayOfWeek:         3,
				WorkoutName:       "Full Body B",
				EstimatedDuration: 45,
				Exercises: []models.CreatePlanExerciseReq{
					{ExerciseID: deadliftID, CustomExerciseName: "Deadlift", TargetSets: 3, TargetReps: "5-8"},
					{ExerciseID: pressID, CustomExerciseName: "Overhead Press", TargetSets: 3, TargetReps: "8-12"},
					{ExerciseID: squatID, CustomExerciseName: "Squat", TargetSets: 3, TargetReps: "8-10"},
				},
			},
			{
				DayOfWeek:         5,
				WorkoutName:       "Full Body C",
				EstimatedDuration: 45,
				Exercises: []models.CreatePlanExerciseReq{
					{ExerciseID: benchID, CustomExerciseName: "Bench Press", TargetSets: 3, TargetReps: "8-12"},
					{ExerciseID: rowID, CustomExerciseName: "Barbell Row", TargetSets: 3, TargetReps: "8-12"},
					{ExerciseID: pressID, CustomExerciseName: "Overhead Press", TargetSets: 3, TargetReps: "8-12"},
				},
			},
		},
	}
	return req
}

// stripMarkdownFences removes optional markdown code fences from a string.
func stripMarkdownFences(text string) string {
	text = strings.TrimSpace(text)
	if strings.HasPrefix(text, "```") {
		lines := strings.Split(text, "\n")
		if len(lines) > 2 && strings.HasPrefix(lines[0], "```") {
			lines = lines[1:]
		}
		if len(lines) > 0 && strings.HasPrefix(lines[len(lines)-1], "```") {
			lines = lines[:len(lines)-1]
		}
		text = strings.Join(lines, "\n")
	}
	return strings.TrimSpace(text)
}

// fetchExerciseListForPlan returns a lightweight list of active exercises for plan generation.
func fetchExerciseListForPlan() ([]models.Exercise, error) {
	rows, err := database.DB.Query("SELECT id, name, muscle_group, equipment FROM exercises WHERE is_active = 1 ORDER BY name")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var exercises []models.Exercise
	for rows.Next() {
		var ex models.Exercise
		rows.Scan(&ex.ID, &ex.Name, &ex.MuscleGroup, &ex.Equipment)
		exercises = append(exercises, ex)
	}
	return exercises, nil
}
