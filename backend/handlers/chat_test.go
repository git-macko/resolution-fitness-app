// Package handlers — unit tests for AI chat helpers.
package handlers

import (
	"strings"
	"testing"
)

// TestBuildUserContextForPlan_IncludesExistingPlans verifies that Mimi's
// plan-generation context contains the user's existing workout plans,
// including consistent routines and one-time overrides with their dates.
func TestBuildUserContextForPlan_IncludesExistingPlans(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	// Create a consistent routine
	consistentReq, consistentW := newRequest("POST", "/api/plans",
		planReq("Consistent Routine", "consistent", minimalDays()), userID)
	CreatePlan(consistentW, consistentReq)
	if consistentW.Code != 201 {
		t.Fatalf("CreatePlan consistent: expected 201, got %d: %s", consistentW.Code, consistentW.Body.String())
	}

	// Create a one-time override for a specific week
	oneTimeReq := planReq("Deload Week", "one_time", minimalDays())
	oneTimeReq.WeekStartDate = "2025-08-04"
	req, w := newRequest("POST", "/api/plans", oneTimeReq, userID)
	CreatePlan(w, req)
	if w.Code != 201 {
		t.Fatalf("CreatePlan one-time: expected 201, got %d: %s", w.Code, w.Body.String())
	}

	// Build the context used by Mimi when generating a plan
	ctx := buildUserContextForPlan(userID)

	// Verify both plans appear in the context
	if !strings.Contains(ctx, "Consistent Routine") {
		t.Errorf("Context missing consistent routine name. Context:\n%s", ctx)
	}
	if !strings.Contains(ctx, "Deload Week") {
		t.Errorf("Context missing one-time plan name. Context:\n%s", ctx)
	}
	if !strings.Contains(ctx, "one-time: 2025-08-04") {
		t.Errorf("Context missing one-time plan date range. Context:\n%s", ctx)
	}
	if !strings.Contains(ctx, "Existing plans:") {
		t.Errorf("Context missing 'Existing plans:' header. Context:\n%s", ctx)
	}
}
