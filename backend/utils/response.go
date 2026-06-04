// Package utils provides helper functions used across all handlers.
// These keep handlers thin — common response formatting, validation,
// file handling, and date utilities all live here.
package utils

import (
	"encoding/json"
	"net/http"

	"resolution-fitnessapp-backend/models"
)

// WriteJSON sends a JSON response with the given status code and data.
// It automatically sets Content-Type and marshals the data.
// This is the primary response function used by all handlers.
func WriteJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		// If encoding fails (very rare), log but can't send another response.
		http.Error(w, `{"error":"Failed to encode response"}`, http.StatusInternalServerError)
	}
}

// WriteSuccess sends a 200 OK response with data wrapped in APIResponse.
func WriteSuccess(w http.ResponseWriter, data interface{}, message string) {
	WriteJSON(w, http.StatusOK, models.APIResponse{
		Data:    data,
		Message: message,
	})
}

// WriteCreated sends a 201 Created response with data wrapped in APIResponse.
func WriteCreated(w http.ResponseWriter, data interface{}, message string) {
	WriteJSON(w, http.StatusCreated, models.APIResponse{
		Data:    data,
		Message: message,
	})
}

// WritePaginated sends a 200 OK response with paginated data.
func WritePaginated(w http.ResponseWriter, data interface{}, page, limit, total int) {
	hasMore := (page * limit) < total
	WriteJSON(w, http.StatusOK, models.PaginatedResponse{
		Data: data,
		Pagination: models.Pagination{
			Page:    page,
			Limit:   limit,
			Total:   total,
			HasMore: hasMore,
		},
	})
}

// WriteError sends an error response with the given status code and message.
// All errors across the API use this consistent format.
func WriteError(w http.ResponseWriter, status int, message string) {
	WriteJSON(w, status, models.ErrorResponse{Error: message})
}

// WriteErrorWithCode sends an error response with an optional error code
// for programmatic handling by the mobile client.
func WriteErrorWithCode(w http.ResponseWriter, status int, message, code string) {
	WriteJSON(w, status, models.ErrorResponse{
		Error: message,
		Code:  code,
	})
}
