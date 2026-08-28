// Package middleware — tests for the CORS middleware.
package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// newTestHandler builds a CORS-wrapped handler that returns 200 "ok".
func newTestHandler(allowedOrigins []string) http.Handler {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})
	return CORS(allowedOrigins)(next)
}

// TestCORSAllowAllInDevelopment verifies the default (empty whitelist)
// emits Access-Control-Allow-Origin: * exactly as before.
func TestCORSAllowAllInDevelopment(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	req.Header.Set("Origin", "http://localhost:19006")
	rec := httptest.NewRecorder()

	newTestHandler(nil).ServeHTTP(rec, req)

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("expected allow-origin *, got %q", got)
	}
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	if body := rec.Body.String(); body != "ok" {
		t.Errorf("expected handler to run, body %q", body)
	}
}

// TestCORSWhitelistEchoesAllowedOrigin verifies an allowed origin is
// echoed back with a Vary: Origin header.
func TestCORSWhitelistEchoesAllowedOrigin(t *testing.T) {
	allowed := []string{"https://app.example.com"}
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	req.Header.Set("Origin", "https://app.example.com")
	rec := httptest.NewRecorder()

	newTestHandler(allowed).ServeHTTP(rec, req)

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://app.example.com" {
		t.Errorf("expected origin echoed, got %q", got)
	}
	if got := rec.Header().Get("Vary"); got != "Origin" {
		t.Errorf("expected Vary: Origin, got %q", got)
	}
}

// TestCORSWhitelistBlocksUnknownOrigin verifies an origin outside the
// whitelist receives NO CORS headers, so the browser blocks the request.
func TestCORSWhitelistBlocksUnknownOrigin(t *testing.T) {
	allowed := []string{"https://app.example.com"}
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	req.Header.Set("Origin", "https://evil.example.com")
	rec := httptest.NewRecorder()

	newTestHandler(allowed).ServeHTTP(rec, req)

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("expected no CORS header for unknown origin, got %q", got)
	}
	// The handler still runs (server-side), the browser enforces the block.
	if rec.Code != http.StatusOK {
		t.Errorf("expected handler to run, got %d", rec.Code)
	}
}

// TestCORSWhitelistRejectsUnknownPreflight verifies preflight OPTIONS
// from an unknown origin is rejected outright with 403.
func TestCORSWhitelistRejectsUnknownPreflight(t *testing.T) {
	allowed := []string{"https://app.example.com"}
	req := httptest.NewRequest(http.MethodOptions, "/api/plans", nil)
	req.Header.Set("Origin", "https://evil.example.com")
	req.Header.Set("Access-Control-Request-Method", "POST")
	rec := httptest.NewRecorder()

	newTestHandler(allowed).ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 for unknown preflight, got %d", rec.Code)
	}
}

// TestCORSWhitelistAllowsNativeApps verifies requests without an Origin
// header (native mobile apps, curl) always pass through.
func TestCORSWhitelistAllowsNativeApps(t *testing.T) {
	allowed := []string{"https://app.example.com"}
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil) // no Origin header
	rec := httptest.NewRecorder()

	newTestHandler(allowed).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected native app request to pass through, got %d", rec.Code)
	}
	if body := rec.Body.String(); body != "ok" {
		t.Errorf("expected handler to run, body %q", body)
	}
}
