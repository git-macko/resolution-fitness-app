// Package models defines all data structures used throughout the backend.
// Each file corresponds to a domain: users, workouts, nutrition, tracking, content.
// All structs have JSON tags for serialization and are documented with comments.
package models


// ── Common Response Wrappers ─────────────────────────────────────────

// APIResponse is the standard wrapper for single-object success responses.
// Every successful endpoint returns data inside this structure.
type APIResponse struct {
	Data    interface{} `json:"data"`
	Message string      `json:"message,omitempty"`
}

// PaginatedResponse wraps list responses with pagination metadata.
// Used for endpoints like workout history, food logs, etc.
type PaginatedResponse struct {
	Data       interface{}  `json:"data"`
	Pagination Pagination   `json:"pagination"`
}

// Pagination contains metadata for paginated API responses.
type Pagination struct {
	Page    int  `json:"page"`
	Limit   int  `json:"limit"`
	Total   int  `json:"total"`
	HasMore bool `json:"hasMore"`
}

// ErrorResponse is the standard error response format.
// Every error across the API follows this structure.
type ErrorResponse struct {
	Error string `json:"error"`
	Code  string `json:"code,omitempty"`
}


