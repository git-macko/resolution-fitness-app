// Package middleware — tests for the IP rate limiter.
package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// newRateLimitedHandler builds a handler wrapped with a limiter of the
// given capacity (requests per minute) returning 200 "ok" when allowed.
func newRateLimitedHandler(perMinute int) http.Handler {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})
	limiter := NewRateLimiter(float64(perMinute)/60.0, float64(perMinute))
	return RateLimit(limiter)(next)
}

// TestRateLimitAllowsWithinBudget verifies requests under the limit pass.
func TestRateLimitAllowsWithinBudget(t *testing.T) {
	h := newRateLimitedHandler(3)

	for i := 0; i < 3; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("request %d: expected 200, got %d", i+1, rec.Code)
		}
	}
}

// TestRateLimitBlocksOverBudget verifies the first request past the budget
// returns 429 with a Retry-After header.
func TestRateLimitBlocksOverBudget(t *testing.T) {
	h := newRateLimitedHandler(2)

	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("request %d: expected 200, got %d", i+1, rec.Code)
		}
	}

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d", rec.Code)
	}
	if got := rec.Header().Get("Retry-After"); got != "1" {
		t.Errorf("expected Retry-After: 1, got %q", got)
	}
}

// TestRateLimitPerClientIP verifies limits are enforced per IP, not shared.
func TestRateLimitPerClientIP(t *testing.T) {
	h := newRateLimitedHandler(1)

	// Client A uses its single allowance.
	reqA := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	reqA.RemoteAddr = "10.0.0.1:1234"
	recA := httptest.NewRecorder()
	h.ServeHTTP(recA, reqA)
	if recA.Code != http.StatusOK {
		t.Fatalf("client A first request: expected 200, got %d", recA.Code)
	}

	// Client B still gets through — limits are per IP.
	reqB := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	reqB.RemoteAddr = "10.0.0.2:1234"
	recB := httptest.NewRecorder()
	h.ServeHTTP(recB, reqB)
	if recB.Code != http.StatusOK {
		t.Fatalf("client B: expected 200, got %d", recB.Code)
	}

	// Client A is now out of budget.
	reqA2 := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	reqA2.RemoteAddr = "10.0.0.1:1234"
	recA2 := httptest.NewRecorder()
	h.ServeHTTP(recA2, reqA2)
	if recA2.Code != http.StatusTooManyRequests {
		t.Fatalf("client A second request: expected 429, got %d", recA2.Code)
	}
}

// TestRateLimitRefills verifies the bucket refills over time.
func TestRateLimitRefills(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	limiter := NewRateLimiter(2.0, 2.0) // 2 tokens/sec, burst 2
	h := RateLimit(limiter)(next)

	serve := func() int {
		req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}

	if serve() != http.StatusOK || serve() != http.StatusOK {
		t.Fatal("expected both burst requests to pass")
	}
	if serve() != http.StatusTooManyRequests {
		t.Fatal("expected third request to be limited")
	}

	// After ~1.5s, roughly 3 tokens have refilled → the next request passes.
	time.Sleep(1500 * time.Millisecond)
	if serve() != http.StatusOK {
		t.Fatal("expected request after refill to pass")
	}
}

// TestRateLimitXForwardedFor verifies the client IP honors the proxy header.
func TestRateLimitXForwardedFor(t *testing.T) {
	h := newRateLimitedHandler(1)

	// Same X-Forwarded-For → same bucket → second request blocked.
	req1 := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	req1.RemoteAddr = "10.0.0.9:1234"
	req1.Header.Set("X-Forwarded-For", "203.0.113.7")
	rec1 := httptest.NewRecorder()
	h.ServeHTTP(rec1, req1)
	if rec1.Code != http.StatusOK {
		t.Fatalf("first request: expected 200, got %d", rec1.Code)
	}

	req2 := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	req2.RemoteAddr = "10.0.0.9:1234"
	req2.Header.Set("X-Forwarded-For", "203.0.113.7")
	rec2 := httptest.NewRecorder()
	h.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusTooManyRequests {
		t.Fatalf("second request from same forwarded IP: expected 429, got %d", rec2.Code)
	}

	// Different forwarded IP → separate bucket → allowed.
	req3 := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	req3.RemoteAddr = "10.0.0.9:1234"
	req3.Header.Set("X-Forwarded-For", "198.51.100.4")
	rec3 := httptest.NewRecorder()
	h.ServeHTTP(rec3, req3)
	if rec3.Code != http.StatusOK {
		t.Fatalf("request from different forwarded IP: expected 200, got %d", rec3.Code)
	}
}

// TestClientIPFallback verifies clientIP falls back to RemoteAddr when no
// forwarded header is present.
func TestClientIPFallback(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	req.RemoteAddr = "192.168.1.42:8080"
	if got := clientIP(req); got != "192.168.1.42" {
		t.Errorf("expected 192.168.1.42, got %q", got)
	}
}
