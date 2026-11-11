package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"resolution-fitnessapp-backend/database"
	"resolution-fitnessapp-backend/models"
)

// aiUsageFromResponse extracts the AIUsage payload from an APIResponse body.
func aiUsageFromResponse(t *testing.T, body []byte) AIUsage {
	t.Helper()
	var resp models.APIResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	raw, err := json.Marshal(resp.Data)
	if err != nil {
		t.Fatalf("marshal data: %v", err)
	}
	var usage AIUsage
	if err := json.Unmarshal(raw, &usage); err != nil {
		t.Fatalf("decode usage: %v", err)
	}
	return usage
}

// TestGetAIUsage_StartsAtZero verifies a fresh user sees the full allowance.
func TestGetAIUsage_StartsAtZero(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	req, w := newRequest("GET", "/api/ai/usage", nil, userID)
	GetAIUsage(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	usage := aiUsageFromResponse(t, w.Body.Bytes())
	if usage.Used != 0 {
		t.Errorf("expected 0 used, got %d", usage.Used)
	}
	if usage.Limit != defaultAIDailyLimit {
		t.Errorf("expected limit %d, got %d", defaultAIDailyLimit, usage.Limit)
	}
	if usage.Remaining != usage.Limit {
		t.Errorf("expected remaining %d, got %d", usage.Limit, usage.Remaining)
	}
	if usage.ResetsAt == "" {
		t.Error("expected a reset time")
	}
}

// TestChat_RecordsAndEnforcesDailyAIAllowance verifies each chat message
// spends one request and that the next message past the limit is rejected
// with a clear 429 rather than another AI call.
func TestChat_RecordsAndEnforcesDailyAIAllowance(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Keep the test deterministic: no Gemini key means the fallback reply,
	// and a small allowance keeps the test fast.
	prevKey, prevLimit := geminiKey, aiDailyLimit
	geminiKey = ""
	aiDailyLimit = 2
	defer func() {
		geminiKey = prevKey
		aiDailyLimit = prevLimit
	}()

	for i := 0; i < 2; i++ {
		req, w := newRequest("POST", "/api/chat", models.ChatRequest{Message: "hello"}, userID)
		Chat(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("message %d: expected 200, got %d: %s", i+1, w.Code, w.Body.String())
		}
	}

	usage := currentAIUsage(userID)
	if usage.Used != 2 {
		t.Errorf("expected 2 used, got %d", usage.Used)
	}
	if usage.Remaining != 0 {
		t.Errorf("expected 0 remaining, got %d", usage.Remaining)
	}

	// The third message is over the allowance.
	req, w := newRequest("POST", "/api/chat", models.ChatRequest{Message: "one more"}, userID)
	Chat(w, req)

	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d: %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "AI requests for today") {
		t.Errorf("expected a daily-limit message, got %s", w.Body.String())
	}

	// A rejected message must not be spent or saved to history.
	if got := currentAIUsage(userID).Used; got != 2 {
		t.Errorf("rejected message spent allowance: used = %d", got)
	}
	var count int
	if err := database.DB.QueryRow("SELECT COUNT(*) FROM chat_messages WHERE user_id = ?", userID).Scan(&count); err != nil {
		t.Fatalf("count chat messages: %v", err)
	}
	if count != 4 { // 2 user + 2 assistant messages from the allowed requests
		t.Errorf("expected 4 saved chat messages, got %d", count)
	}
}

// TestFoodScan_RejectedWhenAllowanceExhausted verifies the scanner respects
// the same allowance before doing paid analysis work.
func TestFoodScan_RejectedWhenAllowanceExhausted(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	prevLimit := aiDailyLimit
	aiDailyLimit = 1
	defer func() { aiDailyLimit = prevLimit }()

	recordAIUsage(userID)

	req, w := newRequest("POST", "/api/food-scan", nil, userID)
	ScanFood(w, req)

	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 before parsing the upload, got %d: %s", w.Code, w.Body.String())
	}
}
