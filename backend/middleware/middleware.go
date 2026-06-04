// Package middleware provides HTTP middleware for the API server.
// Middleware wraps handler functions to add cross-cutting concerns:
// authentication, CORS headers, and request logging.
package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"resolution-fitnessapp-backend/models"

	"github.com/golang-jwt/jwt/v5"
)

// ── Context Keys ─────────────────────────────────────────────────────
// contextKey is an unexported type to prevent key collisions in the context.
// Using a custom type prevents other packages from accidentally using the same key.
type contextKey string

// UserIDKey is the context key that holds the authenticated user's ID.
// It is set by AuthRequired middleware and read by all protected handlers.
const UserIDKey contextKey = "userID"

// ── Global JWT Secret ────────────────────────────────────────────────
// jwtSecret is set once at startup via InitMiddleware.
var jwtSecret []byte

// InitMiddleware initializes middleware-global state.
// Must be called once on server startup before any requests are handled.
func InitMiddleware(secret string) {
	jwtSecret = []byte(secret)
}

// ── CORS Middleware ──────────────────────────────────────────────────
// CORS adds Cross-Origin Resource Sharing headers to every response.
// This allows the mobile app (running on a different origin) to communicate
// with the backend server. Without CORS, browsers/expo-web would block requests.
//
// Headers added:
//   - Access-Control-Allow-Origin: * (allow all origins — mobile app has no fixed origin)
//   - Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
//   - Access-Control-Allow-Headers: Content-Type, Authorization
//   - Access-Control-Max-Age: 86400 (cache preflight for 24 hours)
//
// OPTIONS requests (preflight) are handled automatically with a 200 OK response.
func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Max-Age", "86400")

		// ── Handle preflight (OPTIONS) requests ────────────────────
		// Browsers send an OPTIONS request before cross-origin POST/PUT.
		// We respond 200 OK immediately — the actual request follows.
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// ── AuthRequired Middleware ──────────────────────────────────────────
// AuthRequired protects routes that require authentication.
// It validates the JWT token from the Authorization header,
// extracts the user_id from the token claims, and injects it into
// the request context for downstream handlers.
//
// Flow:
//   1. Read Authorization header
//   2. Expect format: Bearer <token>
//   3. Parse and validate the JWT token using HS256
//   4. Extract user_id from token claims
//   5. Inject user_id into request context → UserIDKey
//   6. Call the next handler
//
// Error responses:
//   401 - Missing Authorization header
//   401 - Invalid Authorization format
//   401 - Invalid or expired token
func AuthRequired(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// ── Step 1: Read the Authorization header ──────────────────
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			writeError(w, http.StatusUnauthorized, "Authorization header required")
			return
		}

		// ── Step 2: Parse "Bearer <token>" format ──────────────────
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			writeError(w, http.StatusUnauthorized, "Invalid authorization format. Use: Bearer <token>")
			return
		}
		tokenString := parts[1]

		// ── Step 3: Parse and validate the JWT token ───────────────
		// The key function ensures we only accept HMAC-signed tokens (HS256).
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return jwtSecret, nil
		})

		if err != nil || !token.Valid {
			writeError(w, http.StatusUnauthorized, "Invalid or expired token")
			return
		}

		// ── Step 4: Extract user_id from claims ────────────────────
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			writeError(w, http.StatusUnauthorized, "Invalid token claims")
			return
		}

		userID, ok := claims["user_id"].(string)
		if !ok {
			writeError(w, http.StatusUnauthorized, "Invalid token payload")
			return
		}

		// ── Step 5: Inject userID into request context ─────────────
		// Handlers retrieve this via: r.Context().Value(middleware.UserIDKey).(string)
		ctx := context.WithValue(r.Context(), UserIDKey, userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// ── Request Logging Middleware ───────────────────────────────────────
// RequestLogger logs every HTTP request: method, path, status code, and duration.
// Uses Go's standard library log package for simplicity.
func RequestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Use a response wrapper to capture the status code
		wrapped := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(wrapped, r)
		// Logging removed for clean console output in development
		// In production, add structured logging with slog here.
	})
}

// responseWriter wraps http.ResponseWriter to capture the status code.
type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

// WriteHeader captures the status code before writing.
func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

// ── Helper ───────────────────────────────────────────────────────────
// writeError sends a JSON error response. Used by middleware functions
// that don't have access to the utils package (to avoid circular imports).
func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(models.ErrorResponse{Error: message})
}
