// Package middleware provides HTTP middleware for the API server.
package middleware

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ── Token Bucket Rate Limiter ───────────────────────────────────────
// RateLimiter implements a per-client token bucket. Each client (keyed by
// IP address) is granted a burst of tokens up to `burst`; tokens refill
// continuously at `rate` per second. A request consumes one token and is
// allowed only while the bucket has tokens left.
//
// The limiter is safe for concurrent use and self-cleans stale buckets so
// it never grows unbounded with unique visitors.
type RateLimiter struct {
	mu      sync.Mutex
	rate    float64       // tokens added per second
	burst   float64       // maximum tokens a client can hold
	buckets map[string]*bucket
}

type bucket struct {
	tokens float64
	last   time.Time
}

// NewRateLimiter creates a limiter refilling at `rate` tokens/sec with a
// burst capacity of `burst` tokens (e.g. NewRateLimiter(1, 60) = 60 req/min).
func NewRateLimiter(rate, burst float64) *RateLimiter {
	return &RateLimiter{
		rate:    rate,
		burst:   burst,
		buckets: make(map[string]*bucket),
	}
}

// Allow reports whether a request from `key` may proceed, consuming one
// token when it may. Stale buckets (unused for > 1 hour) are swept lazily.
func (rl *RateLimiter) Allow(key string) bool {
	now := time.Now()

	rl.mu.Lock()
	defer rl.mu.Unlock()

	b, ok := rl.buckets[key]
	if !ok {
		b = &bucket{tokens: rl.burst, last: now}
		rl.buckets[key] = b
	}

	// Refill tokens based on elapsed time (capped at burst).
	elapsed := now.Sub(b.last).Seconds()
	b.tokens += elapsed * rl.rate
	if b.tokens > rl.burst {
		b.tokens = rl.burst
	}
	b.last = now

	if b.tokens >= 1 {
		b.tokens--
		return true
	}

	// Opportunistically sweep buckets idle for more than an hour.
	if len(rl.buckets) > 1000 {
		cutoff := now.Add(-time.Hour)
		for k, candidate := range rl.buckets {
			if candidate.last.Before(cutoff) {
				delete(rl.buckets, k)
			}
		}
	}
	return false
}

// ── Rate Limit Middleware ───────────────────────────────────────────
// RateLimit wraps a handler and rejects requests from a single client IP
// once they exceed the limiter's capacity, responding 429 Too Many
// Requests with a Retry-After hint. It keys on the client IP only (not the
// user) so it works identically for authenticated and public endpoints.
func RateLimit(limiter *RateLimiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !limiter.Allow(clientIP(r)) {
				w.Header().Set("Retry-After", "1")
				writeError(w, http.StatusTooManyRequests, "Too many requests. Please slow down and try again.")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// clientIP extracts the caller's IP address, honoring the X-Forwarded-For
// header (set by reverse proxies / load balancers) and falling back to the
// direct connection address.
func clientIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		// The leftmost entry is the original client behind proxies.
		if first := strings.TrimSpace(strings.Split(fwd, ",")[0]); first != "" {
			return first
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
