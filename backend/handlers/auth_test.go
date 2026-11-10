package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"resolution-fitnessapp-backend/database"
	"resolution-fitnessapp-backend/models"
)

// postJSON runs an auth handler with a JSON body and returns the recorder.
func postJSON(handler http.HandlerFunc, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest("POST", path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler(w, req)
	return w
}

// TestLogin_AutoRegistersUnknownEmail verifies that signing in with an email
// that has no account creates the account and returns a usable token.
func TestLogin_AutoRegistersUnknownEmail(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	InitAuth("test-jwt-secret")

	w := postJSON(Login, "/api/auth/login", `{"email":"newuser@example.com","password":"SecurePass123!"}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp models.AuthResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid response JSON: %v", err)
	}
	if resp.Token == "" {
		t.Fatal("expected a token for the auto-registered user")
	}
	if resp.User.Email != "newuser@example.com" {
		t.Errorf("expected email newuser@example.com, got %q", resp.User.Email)
	}
	if resp.User.OnboardingCompleted {
		t.Error("new user should not have onboarding completed")
	}

	// Default settings and stats rows must exist so the app has data on first load.
	var settings, stats int
	database.DB.QueryRow("SELECT COUNT(*) FROM user_settings WHERE user_id = ?", resp.User.ID).Scan(&settings)
	database.DB.QueryRow("SELECT COUNT(*) FROM user_stats WHERE user_id = ?", resp.User.ID).Scan(&stats)
	if settings != 1 || stats != 1 {
		t.Errorf("expected seeded settings/stats rows, got settings=%d stats=%d", settings, stats)
	}
}

// TestLogin_AutoRegisterRejectsShortPassword ensures auto-registration still
// enforces the password rules instead of creating a weak account.
func TestLogin_AutoRegisterRejectsShortPassword(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	InitAuth("test-jwt-secret")

	w := postJSON(Login, "/api/auth/login", `{"email":"short@example.com","password":"abc"}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}

	var count int
	database.DB.QueryRow("SELECT COUNT(*) FROM users WHERE email = ?", "short@example.com").Scan(&count)
	if count != 0 {
		t.Errorf("expected no account to be created, got %d", count)
	}
}

// TestLogin_ExistingEmailWrongPassword verifies an existing account is never
// silently re-created: a wrong password is rejected with 401.
func TestLogin_ExistingEmailWrongPassword(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	InitAuth("test-jwt-secret")

	reg := postJSON(Register, "/api/auth/register", `{"email":"existing@example.com","password":"SecurePass123!"}`)
	if reg.Code != http.StatusCreated {
		t.Fatalf("register: expected 201, got %d: %s", reg.Code, reg.Body.String())
	}

	w := postJSON(Login, "/api/auth/login", `{"email":"existing@example.com","password":"WrongPassword!"}`)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", w.Code, w.Body.String())
	}
}

// TestLogin_ExistingEmailCorrectPassword verifies a normal sign-in still works.
func TestLogin_ExistingEmailCorrectPassword(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	InitAuth("test-jwt-secret")

	reg := postJSON(Register, "/api/auth/register", `{"email":"returning@example.com","password":"SecurePass123!"}`)
	if reg.Code != http.StatusCreated {
		t.Fatalf("register: expected 201, got %d: %s", reg.Code, reg.Body.String())
	}

	w := postJSON(Login, "/api/auth/login", `{"email":"returning@example.com","password":"SecurePass123!"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp models.AuthResponse
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Token == "" {
		t.Fatal("expected a token for the returning user")
	}
}

// TestRegister_DuplicateEmailReturns409 verifies the client can distinguish a
// duplicate email from other registration failures.
func TestRegister_DuplicateEmailReturns409(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	InitAuth("test-jwt-secret")

	body := `{"email":"duplicate@example.com","password":"SecurePass123!"}`
	if w := postJSON(Register, "/api/auth/register", body); w.Code != http.StatusCreated {
		t.Fatalf("first register: expected 201, got %d: %s", w.Code, w.Body.String())
	}

	w := postJSON(Register, "/api/auth/register", body)
	if w.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d: %s", w.Code, w.Body.String())
	}

	var errResp models.ErrorResponse
	json.Unmarshal(w.Body.Bytes(), &errResp)
	if !strings.Contains(strings.ToLower(errResp.Error), "already registered") {
		t.Errorf("expected an 'already registered' message, got %q", errResp.Error)
	}

	var count int
	database.DB.QueryRow("SELECT COUNT(*) FROM users WHERE email = ?", "duplicate@example.com").Scan(&count)
	if count != 1 {
		t.Errorf("expected exactly one account, got %d", count)
	}
}
