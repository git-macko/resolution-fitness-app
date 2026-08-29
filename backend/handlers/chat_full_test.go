// Package handlers — comprehensive tests for the AI chat plan flow.
// Covers ChatPlan endpoint (routine types, fallback, validation, limits),
// chat suggestions, chat history CRUD, and plan generation helpers.
package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"resolution-fitnessapp-backend/database"
	"resolution-fitnessapp-backend/middleware"
	"resolution-fitnessapp-backend/models"
	"resolution-fitnessapp-backend/utils"
)

// ── ChatPlan Endpoint Tests ──────────────────────────────────────────

// TestChatPlan_FallbackConsistentRoutine tests that ChatPlan creates a
// consistent routine using the fallback plan when no Gemini key is set.
func TestChatPlan_FallbackConsistentRoutine(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Ensure no Gemini key
	originalKey := geminiKey
	geminiKey = ""
	defer func() { geminiKey = originalKey }()

	req, w := newRequest("POST", "/api/chat/plan", models.ChatPlanRequest{
		Message:     "Create a workout plan for me",
		RoutineType: "consistent",
	}, userID)

	ChatPlan(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("ChatPlan fallback consistent: expected 201, got %d: %s", w.Code, w.Body.String())
	}

	plan := unmarshalPlan(w.Body.Bytes())
	if plan.Name == "" {
		t.Error("Plan name should not be empty")
	}
	if plan.RoutineType != "consistent" {
		t.Errorf("Expected routine_type 'consistent', got '%s'", plan.RoutineType)
	}
	if !plan.IsActive {
		t.Error("First consistent routine should be auto-activated")
	}
	if len(plan.Days) == 0 {
		t.Error("Plan should have at least one day")
	}

	// Verify plan was saved in DB
	var count int
	database.DB.QueryRow("SELECT COUNT(*) FROM weekly_plans WHERE user_id = ?", userID).Scan(&count)
	if count != 1 {
		t.Errorf("Expected 1 plan in DB, got %d", count)
	}

	t.Logf("✅ Fallback consistent routine created: %s with %d days", plan.Name, len(plan.Days))
}

// TestChatPlan_FallbackOneTimeRoutine tests that ChatPlan creates a
// one-time override with proper week dates when no Gemini key is set.
func TestChatPlan_FallbackOneTimeRoutine(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	originalKey := geminiKey
	geminiKey = ""
	defer func() { geminiKey = originalKey }()

	req, w := newRequest("POST", "/api/chat/plan", models.ChatPlanRequest{
		Message:     "I need a one-time deload week",
		RoutineType: "one_time",
	}, userID)

	ChatPlan(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("ChatPlan fallback one-time: expected 201, got %d: %s", w.Code, w.Body.String())
	}

	plan := unmarshalPlan(w.Body.Bytes())
	if plan.RoutineType != "one_time" {
		t.Errorf("Expected routine_type 'one_time', got '%s'", plan.RoutineType)
	}
	if plan.WeekStartDate == "" {
		t.Error("One-time plan should have a week_start_date")
	}
	if plan.WeekEndDate == "" {
		t.Error("One-time plan should have a week_end_date")
	}
	// One-time routines should NOT be auto-activated
	if plan.IsActive {
		t.Error("One-time routine should not be auto-activated")
	}

	t.Logf("✅ Fallback one-time routine created: %s (week %s to %s)", plan.Name, plan.WeekStartDate, plan.WeekEndDate)
}

// TestChatPlan_InvalidRequestBody tests that ChatPlan returns 400 for
// a malformed request body.
func TestChatPlan_InvalidRequestBody(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	req := httptest.NewRequest("POST", "/api/chat/plan", strings.NewReader("not json"))
	req.Header.Set("Content-Type", "application/json")
	ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()

	ChatPlan(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("ChatPlan invalid body: expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

// TestChatPlan_EmptyMessage tests that ChatPlan returns 400 when
// the message field is empty or whitespace.
func TestChatPlan_EmptyMessage(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	req, w := newRequest("POST", "/api/chat/plan", models.ChatPlanRequest{
		Message:     "   ",
		RoutineType: "consistent",
	}, userID)

	ChatPlan(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("ChatPlan empty message: expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

// TestChatPlan_NormalizesRoutineType tests that ChatPlan normalizes
// an unrecognized routine type to "consistent".
func TestChatPlan_NormalizesRoutineType(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	originalKey := geminiKey
	geminiKey = ""
	defer func() { geminiKey = originalKey }()

	req, w := newRequest("POST", "/api/chat/plan", models.ChatPlanRequest{
		Message:     "Build me a plan",
		RoutineType: "something_weird",
	}, userID)

	ChatPlan(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("ChatPlan normalize: expected 201, got %d: %s", w.Code, w.Body.String())
	}

	plan := unmarshalPlan(w.Body.Bytes())
	if plan.RoutineType != "consistent" {
		t.Errorf("Expected normalized routine_type 'consistent', got '%s'", plan.RoutineType)
	}
}

// TestChatPlan_ConsistentLimitReached tests that ChatPlan returns 409
// when the user already has 2 consistent routines.
func TestChatPlan_ConsistentLimitReached(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Create 2 consistent routines via CreatePlan
	for i := 0; i < 2; i++ {
		req, w := newRequest("POST", "/api/plans",
			planReq("Routine "+string(rune('A'+i)), "consistent", minimalDays()), userID)
		CreatePlan(w, req)
		if w.Code != http.StatusCreated {
			t.Fatalf("Setup CreatePlan #%d: expected 201, got %d", i+1, w.Code)
		}
	}

	// Now try ChatPlan — should hit the limit
	originalKey := geminiKey
	geminiKey = ""
	defer func() { geminiKey = originalKey }()

	req, w := newRequest("POST", "/api/chat/plan", models.ChatPlanRequest{
		Message:     "Create another routine",
		RoutineType: "consistent",
	}, userID)

	ChatPlan(w, req)

	if w.Code != http.StatusConflict {
		t.Errorf("ChatPlan consistent limit: expected 409, got %d: %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "2 routines") {
		t.Errorf("Expected limit message mentioning '2 routines', got: %s", w.Body.String())
	}
}

// TestChatPlan_OneTimeLimitReached tests that ChatPlan returns 409
// when the user already has 3 one-time overrides.
func TestChatPlan_OneTimeLimitReached(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Create 3 one-time overrides on distinct weeks
	for i := 0; i < 3; i++ {
		pReq := planReq("Override "+string(rune('A'+i)), "one_time", minimalDays())
		pReq.WeekStartDate = fmt.Sprintf("2025-08-%02d", 4+i*7)
		req, w := newRequest("POST", "/api/plans", pReq, userID)
		CreatePlan(w, req)
		if w.Code != http.StatusCreated {
			t.Fatalf("Setup CreatePlan one-time #%d: expected 201, got %d", i+1, w.Code)
		}
	}

	// Now try ChatPlan — should hit the limit
	originalKey := geminiKey
	geminiKey = ""
	defer func() { geminiKey = originalKey }()

	req, w := newRequest("POST", "/api/chat/plan", models.ChatPlanRequest{
		Message:     "Create another one-time plan",
		RoutineType: "one_time",
	}, userID)

	ChatPlan(w, req)

	if w.Code != http.StatusConflict {
		t.Errorf("ChatPlan one-time limit: expected 409, got %d: %s", w.Code, w.Body.String())
	}
}

// TestChatPlan_SavesConfirmationToHistory tests that ChatPlan saves
// a confirmation message to chat history after creating the plan.
func TestChatPlan_SavesConfirmationToHistory(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	originalKey := geminiKey
	geminiKey = ""
	defer func() { geminiKey = originalKey }()

	req, w := newRequest("POST", "/api/chat/plan", models.ChatPlanRequest{
		Message:     "Build me a plan",
		RoutineType: "consistent",
	}, userID)

	ChatPlan(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("ChatPlan: expected 201, got %d: %s", w.Code, w.Body.String())
	}

	// Check chat history for the confirmation message
	var msgCount int
	database.DB.QueryRow("SELECT COUNT(*) FROM chat_messages WHERE user_id = ? AND role = 'assistant'", userID).Scan(&msgCount)
	if msgCount != 1 {
		t.Errorf("Expected 1 assistant message in history, got %d", msgCount)
	}

	var content string
	database.DB.QueryRow("SELECT content FROM chat_messages WHERE user_id = ? AND role = 'assistant' LIMIT 1", userID).Scan(&content)
	if !strings.Contains(content, "Done!") {
		t.Errorf("Confirmation message should contain 'Done!', got: %s", content)
	}
	if !strings.Contains(content, "routine") {
		t.Errorf("Confirmation message should mention 'routine', got: %s", content)
	}
}

// TestChatPlan_OneTimeConfirmationMentionsPlan tests that the one-time
// confirmation message mentions "one-time plan" instead of "routine".
func TestChatPlan_OneTimeConfirmationMentionsPlan(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	originalKey := geminiKey
	geminiKey = ""
	defer func() { geminiKey = originalKey }()

	req, w := newRequest("POST", "/api/chat/plan", models.ChatPlanRequest{
		Message:     "One-time deload week",
		RoutineType: "one_time",
	}, userID)

	ChatPlan(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("ChatPlan one-time: expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var content string
	database.DB.QueryRow("SELECT content FROM chat_messages WHERE user_id = ? AND role = 'assistant' LIMIT 1", userID).Scan(&content)
	if !strings.Contains(content, "one-time plan") {
		t.Errorf("One-time confirmation should mention 'one-time plan', got: %s", content)
	}
}

// TestChatPlan_ConsistentAndOneTimeCoexist tests that creating a consistent
// routine and a one-time override via ChatPlan both succeed (independent limits).
func TestChatPlan_ConsistentAndOneTimeCoexist(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	originalKey := geminiKey
	geminiKey = ""
	defer func() { geminiKey = originalKey }()

	// Create a consistent routine
	req1, w1 := newRequest("POST", "/api/chat/plan", models.ChatPlanRequest{
		Message:     "My main routine",
		RoutineType: "consistent",
	}, userID)
	ChatPlan(w1, req1)
	if w1.Code != http.StatusCreated {
		t.Fatalf("ChatPlan consistent: expected 201, got %d: %s", w1.Code, w1.Body.String())
	}

	// Create a one-time override
	req2, w2 := newRequest("POST", "/api/chat/plan", models.ChatPlanRequest{
		Message:     "Deload week",
		RoutineType: "one_time",
	}, userID)
	ChatPlan(w2, req2)
	if w2.Code != http.StatusCreated {
		t.Fatalf("ChatPlan one-time: expected 201, got %d: %s", w2.Code, w2.Body.String())
	}

	// Verify both exist in DB
	var consistentCount, oneTimeCount int
	database.DB.QueryRow("SELECT COUNT(*) FROM weekly_plans WHERE user_id = ? AND routine_type = 'consistent'", userID).Scan(&consistentCount)
	database.DB.QueryRow("SELECT COUNT(*) FROM weekly_plans WHERE user_id = ? AND routine_type = 'one_time'", userID).Scan(&oneTimeCount)

	if consistentCount != 1 {
		t.Errorf("Expected 1 consistent plan, got %d", consistentCount)
	}
	if oneTimeCount != 1 {
		t.Errorf("Expected 1 one-time plan, got %d", oneTimeCount)
	}
}

// ── ChatPlan with Gemini Mock ────────────────────────────────────────

// TestChatPlan_GeminiValidPlanJSON tests that ChatPlan correctly parses
// a valid plan JSON returned by the mocked Gemini API.
func TestChatPlan_GeminiValidPlanJSON(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Seed exercises so the plan references valid IDs
	ex1ID := seedTestExerciseNamed(t, "Bench Press", "chest", "Barbell")
	ex2ID := seedTestExerciseNamed(t, "Squat", "legs", "Barbell")

	// Build the mock Gemini response — a valid plan JSON
	planJSON := fmt.Sprintf(`{
		"name": "AI Generated PPL",
		"mode": "strength",
		"modeGoal": "build muscle",
		"days": [
			{
				"dayOfWeek": 0,
				"workoutName": "Push Day",
				"isRestDay": false,
				"estimatedDuration": 50,
				"exercises": [
					{"exerciseId": "%s", "customExerciseName": "", "targetSets": 4, "targetReps": "8-12", "targetWeight": 60, "notes": ""},
					{"exerciseId": "%s", "customExerciseName": "", "targetSets": 3, "targetReps": "10", "targetWeight": 80, "notes": ""}
				]
			},
			{
				"dayOfWeek": 2,
				"workoutName": "Leg Day",
				"isRestDay": false,
				"estimatedDuration": 45,
				"exercises": [
					{"exerciseId": "%s", "customExerciseName": "", "targetSets": 4, "targetReps": "8-10", "targetWeight": 100, "notes": ""}
				]
			}
		]
	}`, ex1ID, ex2ID, ex2ID)

	mockResponse := geminiGenerateResponse{
		Candidates: []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		}{
			{Content: struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			}{
				Parts: []struct {
					Text string `json:"text"`
				}{{Text: planJSON}},
			}},
		},
	}

	originalClient := geminiHTTPClient
	geminiHTTPClient = &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			body, _ := json.Marshal(mockResponse)
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(bytes.NewReader(body)),
				Header:     make(http.Header),
			}, nil
		}),
	}
	defer func() { geminiHTTPClient = originalClient }()

	originalKey := geminiKey
	geminiKey = "test-key"
	defer func() { geminiKey = originalKey }()

	req, w := newRequest("POST", "/api/chat/plan", models.ChatPlanRequest{
		Message:     "Create a push/pull/legs split for me",
		RoutineType: "consistent",
	}, userID)

	ChatPlan(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("ChatPlan Gemini: expected 201, got %d: %s", w.Code, w.Body.String())
	}

	plan := unmarshalPlan(w.Body.Bytes())
	if plan.Name != "AI Generated PPL" {
		t.Errorf("Expected plan name 'AI Generated PPL', got '%s'", plan.Name)
	}
	if len(plan.Days) != 2 {
		t.Errorf("Expected 2 days, got %d", len(plan.Days))
	}
	if plan.RoutineType != "consistent" {
		t.Errorf("Expected routine_type 'consistent', got '%s'", plan.RoutineType)
	}

	// Verify exercises were properly mapped
	if len(plan.Days) > 0 {
		day1 := plan.Days[0]
		if day1.WorkoutName != "Push Day" {
			t.Errorf("Day 1 workout name: expected 'Push Day', got '%s'", day1.WorkoutName)
		}
		if len(day1.Exercises) != 2 {
			t.Errorf("Day 1: expected 2 exercises, got %d", len(day1.Exercises))
		}
	}

	t.Logf("✅ Gemini mock plan created: %s with %d days", plan.Name, len(plan.Days))
}

// TestChatPlan_GeminiInvalidJSON_Fallback tests that ChatPlan returns 500
// when Gemini returns unparseable JSON (since generatePlanFromChat errors out).
func TestChatPlan_GeminiInvalidJSON_Fallback(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	mockResponse := geminiGenerateResponse{
		Candidates: []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		}{
			{Content: struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			}{
				Parts: []struct {
					Text string `json:"text"`
				}{{Text: "This is not valid JSON at all!"}},
			}},
		},
	}

	originalClient := geminiHTTPClient
	geminiHTTPClient = &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			body, _ := json.Marshal(mockResponse)
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(bytes.NewReader(body)),
				Header:     make(http.Header),
			}, nil
		}),
	}
	defer func() { geminiHTTPClient = originalClient }()

	originalKey := geminiKey
	geminiKey = "test-key"
	defer func() { geminiKey = originalKey }()

	req, w := newRequest("POST", "/api/chat/plan", models.ChatPlanRequest{
		Message:     "Build me something",
		RoutineType: "consistent",
	}, userID)

	ChatPlan(w, req)

	// Should fail because the plan JSON is invalid and generatePlanFromChat
	// returns an error (not a fallback for parse errors).
	if w.Code != http.StatusInternalServerError {
		t.Errorf("ChatPlan invalid JSON: expected 500, got %d: %s", w.Code, w.Body.String())
	}
}

// TestChatPlan_GeminiEmptyCandidates_Fallback tests that ChatPlan returns 500
// when Gemini returns no candidates.
func TestChatPlan_GeminiEmptyCandidates_Fallback(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	mockResponse := geminiGenerateResponse{
		Candidates: []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		}{},
	}

	originalClient := geminiHTTPClient
	geminiHTTPClient = &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			body, _ := json.Marshal(mockResponse)
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(bytes.NewReader(body)),
				Header:     make(http.Header),
			}, nil
		}),
	}
	defer func() { geminiHTTPClient = originalClient }()

	originalKey := geminiKey
	geminiKey = "test-key"
	defer func() { geminiKey = originalKey }()

	req, w := newRequest("POST", "/api/chat/plan", models.ChatPlanRequest{
		Message:     "Build me something",
		RoutineType: "consistent",
	}, userID)

	ChatPlan(w, req)

	// Empty candidates should return 500 since generatePlanFromChat returns an error
	if w.Code != http.StatusInternalServerError {
		t.Errorf("ChatPlan empty candidates: expected 500, got %d: %s", w.Code, w.Body.String())
	}
}

// TestChatPlan_GeminiEmptyDays_FallbackDefaultPlan tests that ChatPlan uses
// the default plan when Gemini returns valid JSON but with no days.
func TestChatPlan_GeminiEmptyDays_FallbackDefaultPlan(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	planJSON := `{
		"name": "Empty Plan",
		"mode": "strength",
		"modeGoal": "general",
		"days": []
	}`

	mockResponse := geminiGenerateResponse{
		Candidates: []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		}{
			{Content: struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			}{
				Parts: []struct {
					Text string `json:"text"`
				}{{Text: planJSON}},
			}},
		},
	}

	originalClient := geminiHTTPClient
	geminiHTTPClient = &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			body, _ := json.Marshal(mockResponse)
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(bytes.NewReader(body)),
				Header:     make(http.Header),
			}, nil
		}),
	}
	defer func() { geminiHTTPClient = originalClient }()

	originalKey := geminiKey
	geminiKey = "test-key"
	defer func() { geminiKey = originalKey }()

	req, w := newRequest("POST", "/api/chat/plan", models.ChatPlanRequest{
		Message:     "Build me something",
		RoutineType: "consistent",
	}, userID)

	ChatPlan(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("ChatPlan empty days fallback: expected 201, got %d: %s", w.Code, w.Body.String())
	}

	plan := unmarshalPlan(w.Body.Bytes())
	// Should have fallen back to the default full-body plan
	if len(plan.Days) == 0 {
		t.Error("Fallback plan should have days")
	}
	if plan.Name == "Empty Plan" {
		t.Errorf("Should have used fallback plan name, still got 'Empty Plan'")
	}
}

// TestChatPlan_GeminiQuotaExceeded tests that ChatPlan returns 500 when
// Gemini API returns a quota exceeded error.
func TestChatPlan_GeminiQuotaExceeded(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	originalClient := geminiHTTPClient
	geminiHTTPClient = &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusTooManyRequests,
				Body:       http.NoBody,
				Header:     make(http.Header),
			}, nil
		}),
	}
	defer func() { geminiHTTPClient = originalClient }()

	originalKey := geminiKey
	geminiKey = "test-key"
	defer func() { geminiKey = originalKey }()

	req, w := newRequest("POST", "/api/chat/plan", models.ChatPlanRequest{
		Message:     "Build me a plan",
		RoutineType: "consistent",
	}, userID)

	ChatPlan(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("ChatPlan quota exceeded: expected 500, got %d: %s", w.Code, w.Body.String())
	}
}

// ── Chat Endpoint Tests ──────────────────────────────────────────────

// TestChat_FallbackReply tests that the chat endpoint returns a fallback
// reply when no Gemini key is configured.
func TestChat_FallbackReply(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	originalKey := geminiKey
	geminiKey = ""
	defer func() { geminiKey = originalKey }()

	req, w := newRequest("POST", "/api/chat", models.ChatRequest{
		Message: "motivate me",
	}, userID)

	Chat(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Chat fallback: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var apiResp models.APIResponse
	json.Unmarshal(w.Body.Bytes(), &apiResp)
	data, _ := json.Marshal(apiResp.Data)
	var resp models.ChatResponse
	json.Unmarshal(data, &resp)

	if resp.Reply == "" {
		t.Error("Fallback reply should not be empty")
	}
	if !strings.Contains(resp.Reply, "Mimi") {
		t.Errorf("Fallback reply should mention Mimi, got: %s", resp.Reply)
	}
}

// TestChat_EmptyMessage tests that the chat endpoint returns 400 for
// an empty message.
func TestChat_EmptyMessage(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	originalKey := geminiKey
	geminiKey = ""
	defer func() { geminiKey = originalKey }()

	req, w := newRequest("POST", "/api/chat", models.ChatRequest{
		Message: "",
	}, userID)

	Chat(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Chat empty message: expected 400, got %d", w.Code)
	}
}

// TestChat_SavesMessageHistory tests that the chat endpoint saves both
// user and assistant messages to chat history.
func TestChat_SavesMessageHistory(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	originalKey := geminiKey
	geminiKey = ""
	defer func() { geminiKey = originalKey }()

	req, w := newRequest("POST", "/api/chat", models.ChatRequest{
		Message: "Hello Mimi!",
	}, userID)

	Chat(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Chat: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// Verify 2 messages saved (user + assistant)
	var userMsgCount, assistantMsgCount int
	database.DB.QueryRow("SELECT COUNT(*) FROM chat_messages WHERE user_id = ? AND role = 'user'", userID).Scan(&userMsgCount)
	database.DB.QueryRow("SELECT COUNT(*) FROM chat_messages WHERE user_id = ? AND role = 'assistant'", userID).Scan(&assistantMsgCount)

	if userMsgCount != 1 {
		t.Errorf("Expected 1 user message, got %d", userMsgCount)
	}
	if assistantMsgCount != 1 {
		t.Errorf("Expected 1 assistant message, got %d", assistantMsgCount)
	}
}

// ── Chat History Tests ───────────────────────────────────────────────

// TestGetChatHistory_ReturnsChronologicalOrder tests that chat history
// is returned in chronological order (oldest first).
func TestGetChatHistory_ReturnsChronologicalOrder(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Insert messages directly in reverse order (newest first)
	for i := 0; i < 3; i++ {
		role := "user"
		if i%2 == 1 {
			role = "assistant"
		}
		database.DB.Exec(`INSERT INTO chat_messages (id, user_id, role, content, created_at)
			VALUES (?, ?, ?, ?, datetime('now', '-' || ? || ' seconds'))`,
			fmt.Sprintf("msg-%d", i), userID, role, fmt.Sprintf("Message %d", i), (3-i)*10)
	}

	req, w := newRequest("GET", "/api/chat/history", nil, userID)
	GetChatHistory(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GetChatHistory: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var apiResp models.APIResponse
	json.Unmarshal(w.Body.Bytes(), &apiResp)
	data, _ := json.Marshal(apiResp.Data)
	var messages []models.ChatMessage
	json.Unmarshal(data, &messages)

	if len(messages) != 3 {
		t.Fatalf("Expected 3 messages, got %d", len(messages))
	}

	// Messages should be in chronological order (oldest first)
	if messages[0].Content != "Message 0" {
		t.Errorf("First message should be 'Message 0', got '%s'", messages[0].Content)
	}
	if messages[2].Content != "Message 2" {
		t.Errorf("Last message should be 'Message 2', got '%s'", messages[2].Content)
	}
}

// TestGetChatHistory_EmptyHistory tests that chat history returns an
// empty array when no messages exist.
func TestGetChatHistory_EmptyHistory(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	req, w := newRequest("GET", "/api/chat/history", nil, userID)
	GetChatHistory(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GetChatHistory empty: expected 200, got %d", w.Code)
	}

	var apiResp models.APIResponse
	json.Unmarshal(w.Body.Bytes(), &apiResp)
	data, _ := json.Marshal(apiResp.Data)
	var messages []models.ChatMessage
	json.Unmarshal(data, &messages)

	if messages == nil {
		t.Error("Empty history should return empty array, got nil")
	}
	if len(messages) != 0 {
		t.Errorf("Expected 0 messages, got %d", len(messages))
	}
}

// TestClearChatHistory_DeletesAllMessages tests that clearing chat history
// removes all messages for the user.
func TestClearChatHistory_DeletesAllMessages(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Insert some messages
	for i := 0; i < 5; i++ {
		database.DB.Exec(`INSERT INTO chat_messages (id, user_id, role, content, created_at)
			VALUES (?, ?, 'user', ?, datetime('now'))`,
			fmt.Sprintf("msg-%d", i), userID, fmt.Sprintf("Message %d", i))
	}

	// Verify messages exist
	var count int
	database.DB.QueryRow("SELECT COUNT(*) FROM chat_messages WHERE user_id = ?", userID).Scan(&count)
	if count != 5 {
		t.Fatalf("Setup: expected 5 messages, got %d", count)
	}

	// Clear history
	req, w := newRequest("DELETE", "/api/chat/history", nil, userID)
	ClearChatHistory(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("ClearChatHistory: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// Verify all messages deleted
	database.DB.QueryRow("SELECT COUNT(*) FROM chat_messages WHERE user_id = ?", userID).Scan(&count)
	if count != 0 {
		t.Errorf("Expected 0 messages after clear, got %d", count)
	}
}

// TestDeleteChatMessage_DeletesSingleMessage tests that deleting a single
// message removes it from chat history.
func TestDeleteChatMessage_DeletesSingleMessage(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Insert 3 messages
	msgIDs := make([]string, 3)
	for i := 0; i < 3; i++ {
		msgIDs[i] = fmt.Sprintf("msg-%d", i)
		database.DB.Exec(`INSERT INTO chat_messages (id, user_id, role, content, created_at)
			VALUES (?, ?, 'user', ?, datetime('now'))`,
			msgIDs[i], userID, fmt.Sprintf("Message %d", i))
	}

	// Delete the middle message
	req, w := newRequest("DELETE", "/api/chat/history/{messageId}", nil, userID)
	req.SetPathValue("messageId", msgIDs[1])
	DeleteChatMessage(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("DeleteChatMessage: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// Verify 2 messages remain
	var count int
	database.DB.QueryRow("SELECT COUNT(*) FROM chat_messages WHERE user_id = ?", userID).Scan(&count)
	if count != 2 {
		t.Errorf("Expected 2 messages after delete, got %d", count)
	}
}

// TestDeleteChatMessage_NotFound tests that deleting a non-existent message
// returns 404.
func TestDeleteChatMessage_NotFound(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	req, w := newRequest("DELETE", "/api/chat/history/{messageId}", nil, userID)
	req.SetPathValue("messageId", "nonexistent-id")
	DeleteChatMessage(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("DeleteChatMessage not found: expected 404, got %d", w.Code)
	}
}

// TestDeleteChatMessage_WrongUser tests that a user cannot delete another
// user's message.
func TestDeleteChatMessage_WrongUser(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	user1 := seedTestUser(t)
	user2 := seedTestUser(t)

	// User1 creates a message
	msgID := "user1-msg"
	database.DB.Exec(`INSERT INTO chat_messages (id, user_id, role, content, created_at)
		VALUES (?, ?, 'user', 'Private message', datetime('now'))`, msgID, user1)

	// User2 tries to delete it
	req, w := newRequest("DELETE", "/api/chat/history/{messageId}", nil, user2)
	req.SetPathValue("messageId", msgID)
	DeleteChatMessage(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("DeleteChatMessage wrong user: expected 404, got %d", w.Code)
	}
}

// ── Chat Suggestions Tests ───────────────────────────────────────────

// TestGetChatSuggestions_WithoutPlan tests that suggestions include a
// "Create a weekly workout plan" prompt when no plan exists.
func TestGetChatSuggestions_WithoutPlan(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	req, w := newRequest("GET", "/api/chat/suggestions", nil, userID)
	GetChatSuggestions(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GetChatSuggestions: expected 200, got %d", w.Code)
	}

	var apiResp models.APIResponse
	json.Unmarshal(w.Body.Bytes(), &apiResp)
	data, _ := json.Marshal(apiResp.Data)
	var suggestions []models.ChatSuggestion
	json.Unmarshal(data, &suggestions)

	if len(suggestions) < 3 {
		t.Fatalf("Expected at least 3 suggestions, got %d", len(suggestions))
	}

	// Should include "Create a weekly workout plan"
	found := false
	for _, s := range suggestions {
		if strings.Contains(s.Prompt, "Create a weekly workout plan") {
			found = true
			break
		}
	}
	if !found {
		t.Error("Should suggest 'Create a weekly workout plan' when no plan exists")
	}
}

// TestGetChatSuggestions_WithPlan tests that suggestions adapt when a plan
// exists — they should NOT suggest creating a new plan.
func TestGetChatSuggestions_WithPlan(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Create a one-time plan with the current week's start date so
	// GetChatSuggestions finds it (the handler queries by week_start_date = current week)
	weekStart := utils.WeekStartString()
	pReq := planReq("My Routine", "one_time", minimalDays())
	pReq.WeekStartDate = weekStart
	req, w := newRequest("POST", "/api/plans", pReq, userID)
	CreatePlan(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("Setup CreatePlan: expected 201, got %d", w.Code)
	}

	// Get suggestions
	sugReq, sugW := newRequest("GET", "/api/chat/suggestions", nil, userID)
	GetChatSuggestions(sugW, sugReq)

	if sugW.Code != http.StatusOK {
		t.Fatalf("GetChatSuggestions: expected 200, got %d", sugW.Code)
	}

	var sugAPIResp models.APIResponse
	json.Unmarshal(sugW.Body.Bytes(), &sugAPIResp)
	sugData, _ := json.Marshal(sugAPIResp.Data)
	var suggestions []models.ChatSuggestion
	json.Unmarshal(sugData, &suggestions)

	// Should NOT include "Create a weekly workout plan" when a plan exists for this week
	for _, s := range suggestions {
		if strings.Contains(s.Prompt, "Create a weekly workout plan") {
			t.Error("Should NOT suggest 'Create a weekly workout plan' when a plan already exists for this week")
		}
	}

	// The suggestion list should adapt to the user having a plan
	if len(suggestions) < 2 {
		t.Errorf("Expected at least 2 suggestions, got %d", len(suggestions))
	}

	// Should include form check suggestion
	found := false
	for _, s := range suggestions {
		if strings.Contains(s.Prompt, "form") {
			found = true
			break
		}
	}
	if !found {
		t.Error("Should suggest form check when a plan exists")
	}
}

// ── Default Plan Helper Tests ────────────────────────────────────────

// TestDefaultPlanFromChat_ConsistentRoutine tests that the default plan
// has the correct structure for a consistent routine.
func TestDefaultPlanFromChat_ConsistentRoutine(t *testing.T) {
	// Seed exercises so findID works
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)
	_ = userID

	exercises, _ := fetchExerciseListForPlan()
	req := defaultPlanFromChat("test message", "consistent", exercises)

	if req.Name == "" {
		t.Error("Default plan name should not be empty")
	}
	if req.RoutineType != "consistent" {
		t.Errorf("Expected routine_type 'consistent', got '%s'", req.RoutineType)
	}
	if len(req.Days) == 0 {
		t.Error("Default plan should have at least one day")
	}

	// Verify all days have exercises
	for i, day := range req.Days {
		if !day.IsRestDay && len(day.Exercises) == 0 {
			t.Errorf("Day %d (%s) should have exercises", i, day.WorkoutName)
		}
	}
}

// TestDefaultPlanFromChat_OneTimeRoutine tests that the default plan
// has the correct routine type for a one-time override.
func TestDefaultPlanFromChat_OneTimeRoutine(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)
	_ = userID

	exercises, _ := fetchExerciseListForPlan()
	req := defaultPlanFromChat("test", "one_time", exercises)

	if req.RoutineType != "one_time" {
		t.Errorf("Expected routine_type 'one_time', got '%s'", req.RoutineType)
	}
}

// TestDefaultPlanFromChat_ExerciseIDsValid tests that the default plan
// references exercises that exist in the seeded exercise library.
func TestDefaultPlanFromChat_ExerciseIDsValid(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)
	_ = userID

	exercises, _ := fetchExerciseListForPlan()
	req := defaultPlanFromChat("test", "consistent", exercises)

	validIDs := make(map[string]bool)
	for _, ex := range exercises {
		validIDs[ex.ID] = true
	}

	for _, day := range req.Days {
		for _, ex := range day.Exercises {
			if ex.ExerciseID != "" && !validIDs[ex.ExerciseID] {
				t.Errorf("Exercise ID '%s' not found in library", ex.ExerciseID)
			}
		}
	}
}

// ── Build Plan Generation Prompt Tests ───────────────────────────────

// TestBuildPlanGenerationPrompt_IncludesExercises tests that the plan
// generation prompt includes the available exercise library.
func TestBuildPlanGenerationPrompt_IncludesExercises(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)
	_ = userID

	// Seed a test exercise
	exID := seedTestExerciseNamed(t, "Test Bench", "chest", "Barbell")
	exercises, _ := fetchExerciseListForPlan()

	prompt := buildPlanGenerationPrompt("Build me a plan", "consistent", exercises, "User: Test")

	if !strings.Contains(prompt, "Build me a plan") {
		t.Error("Prompt should include the user message")
	}
	if !strings.Contains(prompt, "consistent") {
		t.Error("Prompt should include the routine type")
	}
	if !strings.Contains(prompt, exID) {
		t.Error("Prompt should include exercise IDs")
	}
	if !strings.Contains(prompt, "User: Test") {
		t.Error("Prompt should include user context")
	}
	if !strings.Contains(prompt, "Output JSON") {
		t.Error("Prompt should instruct JSON output")
	}
}

// TestBuildPlanGenerationPrompt_IncludesUserContext tests that user
// context (fitness level, goals) appears in the plan generation prompt.
func TestBuildPlanGenerationPrompt_IncludesUserContext(t *testing.T) {
	exercises, _ := fetchExerciseListForPlan()

	userContext := "User: Alex\nFitness level: intermediate\nPrimary goal: build muscle"
	prompt := buildPlanGenerationPrompt("Create a plan", "one_time", exercises, userContext)

	if !strings.Contains(prompt, "intermediate") {
		t.Error("Prompt should include fitness level from user context")
	}
	if !strings.Contains(prompt, "build muscle") {
		t.Error("Prompt should include primary goal from user context")
	}
	if !strings.Contains(prompt, "one_time") {
		t.Error("Prompt should include routine type")
	}
}

// ── Build User Context Tests ─────────────────────────────────────────

// TestBuildUserContextForPlan_EmptyUser tests that context works
// gracefully for a user with no data beyond registration.
func TestBuildUserContextForPlan_EmptyUser(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	ctx := buildUserContextForPlan(userID)

	if !strings.Contains(ctx, "Fitness level:") {
		t.Error("Context should include fitness level even if default")
	}
	if !strings.Contains(ctx, "Existing plans: none") {
		t.Error("Context should show 'none' for existing plans when empty")
	}
}

// TestBuildUserContextForPlan_WithSettings tests that user settings
// (weekly goal, calorie target) appear in the context.
func TestBuildUserContextForPlan_WithSettings(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Insert user settings
	database.DB.Exec(`INSERT OR REPLACE INTO user_settings (user_id, weekly_workout_goal, calorie_target, protein_target_grams)
		VALUES (?, 4, 2500, 180)`, userID)

	ctx := buildUserContextForPlan(userID)

	if !strings.Contains(ctx, "Target weekly sessions: 4") {
		t.Errorf("Context should include weekly workout goal. Context:\n%s", ctx)
	}
	if !strings.Contains(ctx, "Calorie target: 2500") {
		t.Errorf("Context should include calorie target. Context:\n%s", ctx)
	}
	if !strings.Contains(ctx, "Protein target: 180") {
		t.Errorf("Context should include protein target. Context:\n%s", ctx)
	}
}

// ── Build System Prompt Tests ────────────────────────────────────────

// TestBuildSystemPrompt_IncludesUserGoals tests that the system prompt
// used by Mimi includes the user's profile data.
func TestBuildSystemPrompt_IncludesUserGoals(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Set user profile data
	database.DB.Exec(`UPDATE users SET display_name = 'Alex', fitness_level = 'intermediate',
		primary_goal = 'build_muscle' WHERE id = ?`, userID)

	prompt := buildSystemPrompt(userID)

	if !strings.Contains(prompt, "Alex") {
		t.Error("System prompt should include the user's display name")
	}
	if !strings.Contains(prompt, "intermediate") {
		t.Error("System prompt should include fitness level")
	}
	if !strings.Contains(prompt, "build_muscle") {
		t.Error("System prompt should include primary goal")
	}
	if !strings.Contains(prompt, "Mimi") {
		t.Error("System prompt should identify Mimi as the AI coach")
	}
}

// TestBuildSystemPrompt_IncludesActivePlan tests that the system prompt
// mentions the user's active weekly plan.
func TestBuildSystemPrompt_IncludesActivePlan(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Create a plan with is_active = 1 (first consistent routine is auto-activated)
	planID := fmt.Sprintf("plan-%s", userID)
	database.DB.Exec(`INSERT INTO weekly_plans (id, user_id, week_start_date, week_end_date, name, routine_type, is_active, created_at, updated_at)
		VALUES (?, ?, '', '', 'My Active Plan', 'consistent', 1, datetime('now'), datetime('now'))`,
		planID, userID)

	// Verify the plan was inserted correctly
	var dbActive int
	database.DB.QueryRow("SELECT is_active FROM weekly_plans WHERE id = ?", planID).Scan(&dbActive)
	if dbActive != 1 {
		t.Fatalf("Plan should have is_active=1, got %d", dbActive)
	}

	prompt := buildSystemPrompt(userID)

	if !strings.Contains(prompt, "My Active Plan") {
		t.Errorf("System prompt should mention active plan. Prompt:\n%s", prompt)
	}
}

// ── Full Flow: ChatPlan → StartWorkout Integration ───────────────────

// TestChatPlan_FullFlow_ConsistentRoutine exercises the complete flow:
// ChatPlan (consistent) → verify plan in DB → verify exercises exist →
// start a workout from the plan's first day.
func TestChatPlan_FullFlow_ConsistentRoutine(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Seed real exercises
	ex1ID := seedTestExerciseNamed(t, "Bench Press", "chest", "Barbell")
	ex2ID := seedTestExerciseNamed(t, "Squat", "legs", "Barbell")

	// Mock Gemini to return a valid plan
	planJSON := fmt.Sprintf(`{
		"name": "AI Push/Legs",
		"mode": "strength",
		"modeGoal": "build muscle",
		"days": [
			{
				"dayOfWeek": 0,
				"workoutName": "Push Day",
				"isRestDay": false,
				"estimatedDuration": 50,
				"exercises": [
					{"exerciseId": "%s", "targetSets": 4, "targetReps": "8-12", "targetWeight": 60}
				]
			},
			{
				"dayOfWeek": 2,
				"workoutName": "Leg Day",
				"isRestDay": false,
				"estimatedDuration": 45,
				"exercises": [
					{"exerciseId": "%s", "targetSets": 5, "targetReps": "5", "targetWeight": 100}
				]
			}
		]
	}`, ex1ID, ex2ID)

	mockResponse := geminiGenerateResponse{
		Candidates: []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		}{
			{Content: struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			}{
				Parts: []struct {
					Text string `json:"text"`
				}{{Text: planJSON}},
			}},
		},
	}

	originalClient := geminiHTTPClient
	geminiHTTPClient = &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			body, _ := json.Marshal(mockResponse)
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(bytes.NewReader(body)),
				Header:     make(http.Header),
			}, nil
		}),
	}
	defer func() { geminiHTTPClient = originalClient }()

	originalKey := geminiKey
	geminiKey = "test-key"
	defer func() { geminiKey = originalKey }()

	// Step 1: Create plan via ChatPlan
	chatReq, chatW := newRequest("POST", "/api/chat/plan", models.ChatPlanRequest{
		Message:     "Create a push/legs split",
		RoutineType: "consistent",
	}, userID)
	ChatPlan(chatW, chatReq)

	if chatW.Code != http.StatusCreated {
		t.Fatalf("ChatPlan: expected 201, got %d: %s", chatW.Code, chatW.Body.String())
	}

	plan := unmarshalPlan(chatW.Body.Bytes())

	// Step 2: Verify plan has the correct structure
	if len(plan.Days) != 2 {
		t.Fatalf("Expected 2 days, got %d", len(plan.Days))
	}

	// Step 3: Start workout from first day
	firstDay := plan.Days[0]
	if len(firstDay.Exercises) == 0 {
		t.Fatal("First day should have exercises")
	}

	startReq, startW := newRequest("POST", "/api/workouts", models.StartWorkoutRequest{
		PlanDayID:   firstDay.ID,
		WorkoutName: firstDay.WorkoutName,
	}, userID)
	StartWorkout(startW, startReq)

	if startW.Code != http.StatusCreated {
		t.Fatalf("StartWorkout: expected 201, got %d: %s", startW.Code, startW.Body.String())
	}

	session := unmarshalSession(startW.Body.Bytes())
	if len(session.Exercises) != 1 {
		t.Errorf("Session should have 1 exercise, got %d", len(session.Exercises))
	}
	if len(session.Exercises) > 0 {
		if len(session.Exercises[0].Sets) != 4 {
			t.Errorf("Exercise should have 4 sets, got %d", len(session.Exercises[0].Sets))
		}
	}

	t.Logf("✅ Full flow: ChatPlan → plan with %d days → StartWorkout with %d exercises",
		len(plan.Days), len(session.Exercises))
}

// TestChatPlan_FullFlow_OneTimeRoutine exercises the complete flow for
// one-time overrides: ChatPlan (one_time) → verify dates → verify not active.
func TestChatPlan_FullFlow_OneTimeRoutine(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	originalKey := geminiKey
	geminiKey = ""
	defer func() { geminiKey = originalKey }()

	// Step 1: Create one-time plan via ChatPlan
	chatReq, chatW := newRequest("POST", "/api/chat/plan", models.ChatPlanRequest{
		Message:     "One-week deload",
		RoutineType: "one_time",
	}, userID)
	ChatPlan(chatW, chatReq)

	if chatW.Code != http.StatusCreated {
		t.Fatalf("ChatPlan one-time: expected 201, got %d: %s", chatW.Code, chatW.Body.String())
	}

	plan := unmarshalPlan(chatW.Body.Bytes())

	// Step 2: Verify dates are set and plan is NOT active
	if plan.WeekStartDate == "" {
		t.Error("One-time plan should have week_start_date")
	}
	if plan.WeekEndDate == "" {
		t.Error("One-time plan should have week_end_date")
	}
	if plan.IsActive {
		t.Error("One-time plan should NOT be active")
	}

	// Step 3: Verify it shows up in GetPlans
	gpReq, gpW := newRequest("GET", "/api/plans", nil, userID)
	GetPlans(gpW, gpReq)

	if gpW.Code != http.StatusOK {
		t.Fatalf("GetPlans: expected 200, got %d", gpW.Code)
	}

	var apiResp models.APIResponse
	json.Unmarshal(gpW.Body.Bytes(), &apiResp)
	data, _ := json.Marshal(apiResp.Data)
	var plans []models.WeeklyPlan
	json.Unmarshal(data, &plans)

	found := false
	for _, p := range plans {
		if p.ID == plan.ID {
			found = true
			break
		}
	}
	if !found {
		t.Error("One-time plan should appear in GetPlans")
	}

	t.Logf("✅ One-time flow: plan created with dates %s to %s, not active",
		plan.WeekStartDate, plan.WeekEndDate)
}
