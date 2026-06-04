// Package handlers — workout management endpoints.
// Covers weekly plans, workout execution sessions, and exercise library.
package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"resolution-fitnessapp-backend/database"
	"resolution-fitnessapp-backend/models"
	"resolution-fitnessapp-backend/utils"

	"github.com/google/uuid"
)

// ── Exercise Library ─────────────────────────────────────────────────

// GetExercises handles GET /api/exercises.
// Lists all exercises with optional filtering by muscle group and name search.
// Query params: ?muscle_group=chest&search=bench
func GetExercises(w http.ResponseWriter, r *http.Request) {
	muscleGroup := r.URL.Query().Get("muscle_group")
	search := r.URL.Query().Get("search")

	// ── Build query dynamically based on filters ──────────────────
	query := "SELECT id, name, muscle_group, equipment, description, instructions, tips, common_mistakes, alternatives, image_url, gif_url, is_active, created_at FROM exercises WHERE is_active = 1"
	var args []interface{}

	if muscleGroup != "" {
		query += " AND muscle_group = ?"
		args = append(args, strings.ToLower(muscleGroup))
	}
	if search != "" {
		query += " AND name LIKE ?"
		args = append(args, "%"+search+"%")
	}
	query += " ORDER BY muscle_group, name"

	rows, err := database.DB.Query(query, args...)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to fetch exercises")
		return
	}
	defer rows.Close()

	var exercises []models.Exercise
	for rows.Next() {
		var ex models.Exercise
		var instJSON, tipsJSON, mistakesJSON, altsJSON string
		var isActive int
		rows.Scan(&ex.ID, &ex.Name, &ex.MuscleGroup, &ex.Equipment,
			&ex.Description, &instJSON, &tipsJSON, &mistakesJSON, &altsJSON,
			&ex.ImageURL, &ex.GifURL, &isActive, &ex.CreatedAt)

		json.Unmarshal([]byte(instJSON), &ex.Instructions)
		json.Unmarshal([]byte(tipsJSON), &ex.Tips)
		json.Unmarshal([]byte(mistakesJSON), &ex.CommonMistakes)
		json.Unmarshal([]byte(altsJSON), &ex.Alternatives)
		ex.IsActive = isActive == 1
		exercises = append(exercises, ex)
	}

	if exercises == nil {
		exercises = []models.Exercise{}
	}

	utils.WriteSuccess(w, exercises, "Exercises retrieved")
}

// GetExercise handles GET /api/exercises/{exerciseId}.
// Returns a single exercise with full details.
func GetExercise(w http.ResponseWriter, r *http.Request) {
	exerciseID := r.PathValue("exerciseId")

	var ex models.Exercise
	var instJSON, tipsJSON, mistakesJSON, altsJSON string
	var isActive int
	err := database.DB.QueryRow(`
		SELECT id, name, muscle_group, equipment, description, instructions, tips,
		       common_mistakes, alternatives, image_url, gif_url, is_active, created_at
		FROM exercises WHERE id = ?
	`, exerciseID).Scan(&ex.ID, &ex.Name, &ex.MuscleGroup, &ex.Equipment,
		&ex.Description, &instJSON, &tipsJSON, &mistakesJSON, &altsJSON,
		&ex.ImageURL, &ex.GifURL, &isActive, &ex.CreatedAt)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "Exercise not found")
		return
	}

	json.Unmarshal([]byte(instJSON), &ex.Instructions)
	json.Unmarshal([]byte(tipsJSON), &ex.Tips)
	json.Unmarshal([]byte(mistakesJSON), &ex.CommonMistakes)
	json.Unmarshal([]byte(altsJSON), &ex.Alternatives)
	ex.IsActive = isActive == 1

	utils.WriteSuccess(w, ex, "Exercise retrieved")
}

// ── Weekly Plans ─────────────────────────────────────────────────────

// GetPlans handles GET /api/plans.
// Lists all weekly plans for the authenticated user.
// Query params: ?week=2025-06-02 (optional — returns the effective plan for that week:
//   one-time overrides take precedence over consistent routines).
// Without ?week=, returns all plans (consistent + upcoming one-time) sorted by routine_type.
// Auto-deletes overdue one-time plans before returning results.
func GetPlans(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	weekFilter := r.URL.Query().Get("week")

	// ── Auto-delete overdue one-time plans ───────────────────────
	// One-time plans whose week has passed are cleaned up automatically.
	today := utils.TodayString()
	database.DB.Exec(`
		DELETE FROM weekly_plans
		WHERE user_id = ? AND routine_type = 'one_time' AND week_end_date != '' AND week_end_date < ?
	`, userID, today)

	// ── Week-specific resolution: one-time > consistent ──────────
	if weekFilter != "" {
		// 1. Check for a one-time override for this exact week
		oneTimePlans := fetchPlansByQuery(`
			SELECT id, user_id, week_start_date, week_end_date, name,
			       COALESCE(mode, ''), COALESCE(mode_goal, ''),
			       COALESCE(routine_type, 'consistent'),
			       COALESCE(is_active, 0),
			       is_template, COALESCE(template_name, ''), created_at, updated_at
			FROM weekly_plans
			WHERE user_id = ? AND routine_type = 'one_time' AND week_start_date = ?
			ORDER BY created_at DESC LIMIT 1
		`, userID, weekFilter)

		if len(oneTimePlans) > 0 {
			utils.WriteSuccess(w, oneTimePlans, "One-time plan found for this week")
			return
		}

		// 2. No one-time override — return consistent routines
		consistentPlans := fetchPlansByQuery(`
			SELECT id, user_id, week_start_date, week_end_date, name,
			       COALESCE(mode, ''), COALESCE(mode_goal, ''),
			       COALESCE(routine_type, 'consistent'),
			       COALESCE(is_active, 0),
			       is_template, COALESCE(template_name, ''), created_at, updated_at
			FROM weekly_plans
			WHERE user_id = ? AND routine_type = 'consistent'
			ORDER BY created_at DESC LIMIT 20
		`, userID)
		utils.WriteSuccess(w, consistentPlans, "Consistent plans for this week")
		return
	}

	// ── No week filter: return all plans ─────────────────────────
	plans := fetchPlansByQuery(`
		SELECT id, user_id, week_start_date, week_end_date, name,
		       COALESCE(mode, ''), COALESCE(mode_goal, ''),
		       COALESCE(routine_type, 'consistent'),
		       COALESCE(is_active, 0),
		       is_template, COALESCE(template_name, ''), created_at, updated_at
		FROM weekly_plans
		WHERE user_id = ?
		ORDER BY
			CASE routine_type WHEN 'consistent' THEN 0 ELSE 1 END,
			week_start_date DESC
		LIMIT 30
	`, userID)
	utils.WriteSuccess(w, plans, "Plans retrieved")
}

// fetchPlansByQuery executes a SELECT query and returns fully populated WeeklyPlan slices.
func fetchPlansByQuery(query string, args ...interface{}) []models.WeeklyPlan {
	rows, err := database.DB.Query(query, args...)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var plans []models.WeeklyPlan
	for rows.Next() {
		var p models.WeeklyPlan
		var isTemplate, isActive int
		rows.Scan(&p.ID, &p.UserID, &p.WeekStartDate, &p.WeekEndDate, &p.Name,
			&p.Mode, &p.ModeGoal, &p.RoutineType,
			&isActive,
			&isTemplate, &p.TemplateName, &p.CreatedAt, &p.UpdatedAt)
		p.IsTemplate = isTemplate == 1
		p.IsActive = isActive == 1
		if p.RoutineType == "" {
			p.RoutineType = "consistent" // default for legacy plans
		}
		p.Days = fetchPlanDays(p.ID)
		plans = append(plans, p)
	}

	if plans == nil {
		plans = []models.WeeklyPlan{}
	}
	return plans
}

// GetPlan handles GET /api/plans/{planId}.
func GetPlan(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	planID := r.PathValue("planId")

	var p models.WeeklyPlan
	var isTemplate, isActive int
	err := database.DB.QueryRow(`
		SELECT id, user_id, week_start_date, week_end_date, name,
		       COALESCE(mode, ''), COALESCE(mode_goal, ''),
		       COALESCE(routine_type, 'consistent'),
		       COALESCE(is_active, 0),
		       is_template, COALESCE(template_name, ''), created_at, updated_at
		FROM weekly_plans WHERE id = ? AND user_id = ?
	`, planID, userID).Scan(&p.ID, &p.UserID, &p.WeekStartDate, &p.WeekEndDate,
		&p.Name, &p.Mode, &p.ModeGoal, &p.RoutineType,
		&isActive,
		&isTemplate, &p.TemplateName, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "Plan not found")
		return
	}
	p.IsTemplate = isTemplate == 1
	p.IsActive = isActive == 1
	if p.RoutineType == "" {
		p.RoutineType = "consistent"
	}
	p.Days = fetchPlanDays(p.ID)

	utils.WriteSuccess(w, p, "Plan retrieved")
}

// CreatePlan handles POST /api/plans.
// Creates a new weekly plan with days and exercises.
// Enforces limits: max 2 consistent routines, max 3 one-time overrides.
// The first consistent routine is auto-activated.
// Uses a transaction for the COUNT check + INSERT to prevent race conditions.
func CreatePlan(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	var req models.CreatePlanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Name == "" {
		utils.WriteError(w, http.StatusBadRequest, "Plan name is required")
		return
	}

	// ── Normalize routine type ────────────────────────────────────
	routineType := req.RoutineType
	if routineType != "one_time" {
		routineType = "consistent"
	}

	// ── Calculate week dates ──────────────────────────────────────
	weekStart := req.WeekStartDate
	weekEnd := ""
	if routineType == "consistent" {
		weekStart = ""
		weekEnd = ""
	} else if weekStart == "" {
		weekStart = utils.WeekStartString()
		weekEnd = utils.WeekEndString()
	} else {
		t, ok := utils.ParseDate(weekStart)
		if !ok {
			utils.WriteError(w, http.StatusBadRequest, "Invalid week start date")
			return
		}
		weekEnd = utils.EndOfWeek(t).Format("2006-01-02")
	}

	// ── Transaction: check limits + insert atomically ─────────────
	tx, err := database.DB.Begin()
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to start transaction")
		return
	}
	defer tx.Rollback()

	// Enforce plan limits
	if routineType == "consistent" {
		var count int
		tx.QueryRow("SELECT COUNT(*) FROM weekly_plans WHERE user_id = ? AND routine_type = 'consistent'", userID).Scan(&count)
		if count >= 2 {
			utils.WriteError(w, http.StatusConflict, "You can only have up to 2 routines. Delete an existing one to create a new one.")
			return
		}
	} else {
		var count int
		tx.QueryRow("SELECT COUNT(*) FROM weekly_plans WHERE user_id = ? AND routine_type = 'one_time'", userID).Scan(&count)
		if count >= 3 {
			utils.WriteError(w, http.StatusConflict, "You can only have up to 3 one-time overrides. Delete or wait for one to expire.")
			return
		}
	}

	// Determine is_active for consistent routines
	isActive := 0
	if routineType == "consistent" {
		var existingCount int
		tx.QueryRow("SELECT COUNT(*) FROM weekly_plans WHERE user_id = ? AND routine_type = 'consistent'", userID).Scan(&existingCount)
		if existingCount == 0 {
			isActive = 1
		}
	}

	// Create the plan
	planID := uuid.New().String()
	_, err = tx.Exec(`
		INSERT INTO weekly_plans (id, user_id, week_start_date, week_end_date, name, mode, mode_goal, routine_type, is_active, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
	`, planID, userID, weekStart, weekEnd, req.Name, req.Mode, req.ModeGoal, routineType, isActive)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to create plan")
		return
	}

	if err := tx.Commit(); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to commit plan")
		return
	}

	// ── Create plan days (outside transaction — safe to do after commit) ──
	for i, day := range req.Days {
		createPlanDay(planID, day, i)
	}

	plan, _ := fetchPlanByID(planID, userID)
	utils.WriteCreated(w, plan, "Plan created")
}

// UpdatePlan handles PUT /api/plans/{planId}.
func UpdatePlan(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	planID := r.PathValue("planId")

	// Verify ownership
	var ownerID string
	err := database.DB.QueryRow("SELECT user_id FROM weekly_plans WHERE id = ?", planID).Scan(&ownerID)
	if err != nil || ownerID != userID {
		utils.WriteError(w, http.StatusNotFound, "Plan not found")
		return
	}

	var req models.CreatePlanRequest
	json.NewDecoder(r.Body).Decode(&req)

	if req.Name != "" {
		database.DB.Exec("UPDATE weekly_plans SET name = ?, updated_at = datetime('now') WHERE id = ?", req.Name, planID)
	}

	// Update mode, goal, and routine type if provided
	if req.Mode != "" || req.ModeGoal != "" || req.RoutineType != "" {
		rt := req.RoutineType
		if rt == "" {
			// Keep existing routine type if not provided
			database.DB.QueryRow("SELECT COALESCE(routine_type, 'consistent') FROM weekly_plans WHERE id = ?", planID).Scan(&rt)
		}
		// Build SET clause dynamically — only update fields that were provided,
		// so existing values aren't wiped to empty strings on partial updates.
		setParts := []string{"routine_type = ?"}
		setArgs := []interface{}{rt}
		if req.Mode != "" {
			setParts = append(setParts, "mode = ?")
			setArgs = append(setArgs, req.Mode)
		}
		if req.ModeGoal != "" {
			setParts = append(setParts, "mode_goal = ?")
			setArgs = append(setArgs, req.ModeGoal)
		}
		// If switching to consistent, clear week dates
		if rt == "consistent" {
			setParts = append(setParts, "week_start_date = ''", "week_end_date = ''")
		}
		// If switching to one_time and a weekStartDate was provided, update dates
		if rt == "one_time" && req.WeekStartDate != "" {
			t, ok := utils.ParseDate(req.WeekStartDate)
			if ok {
				weekEnd := utils.EndOfWeek(t).Format("2006-01-02")
				setParts = append(setParts, "week_start_date = ?", "week_end_date = ?")
				setArgs = append(setArgs, req.WeekStartDate, weekEnd)
			}
		}
		setParts = append(setParts, "updated_at = datetime('now')")
		setArgs = append(setArgs, planID)
		database.DB.Exec(fmt.Sprintf("UPDATE weekly_plans SET %s WHERE id = ?", strings.Join(setParts, ", ")), setArgs...)
	}

	// Update week date for existing one-time routines even when mode/goal/type aren't changing
	if req.WeekStartDate != "" && req.RoutineType == "" {
		var existingType string
		database.DB.QueryRow("SELECT COALESCE(routine_type, 'consistent') FROM weekly_plans WHERE id = ?", planID).Scan(&existingType)
		if existingType == "one_time" {
			t, ok := utils.ParseDate(req.WeekStartDate)
			if ok {
				weekEnd := utils.EndOfWeek(t).Format("2006-01-02")
				database.DB.Exec("UPDATE weekly_plans SET week_start_date = ?, week_end_date = ?, updated_at = datetime('now') WHERE id = ?",
					req.WeekStartDate, weekEnd, planID)
			}
		}
	}

	// Replace days if provided
	if len(req.Days) > 0 {
		database.DB.Exec("DELETE FROM plan_exercises WHERE plan_day_id IN (SELECT id FROM plan_days WHERE plan_id = ?)", planID)
		database.DB.Exec("DELETE FROM plan_days WHERE plan_id = ?", planID)
		for i, day := range req.Days {
			createPlanDay(planID, day, i)
		}
	}

	plan, _ := fetchPlanByID(planID, userID)
	utils.WriteSuccess(w, plan, "Plan updated")
}

// DeletePlan handles DELETE /api/plans/{planId}.
// Uses a transaction to clean up linked workout sessions first
// (FK constraints without ON DELETE CASCADE), then deletes the plan.
// plan_days and plan_exercises cascade automatically.
func DeletePlan(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	planID := r.PathValue("planId")

	// Verify ownership
	var ownerID string
	err := database.DB.QueryRow("SELECT user_id FROM weekly_plans WHERE id = ?", planID).Scan(&ownerID)
	if err != nil || ownerID != userID {
		utils.WriteError(w, http.StatusNotFound, "Plan not found")
		return
	}

	// ── Transaction: clean up sessions, then plan ─────────────────
	tx, err := database.DB.Begin()
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to start transaction")
		return
	}
	defer tx.Rollback()

	// 1. Delete workout sessions linked directly to this plan
	if _, err := tx.Exec("DELETE FROM workout_sessions WHERE plan_id = ?", planID); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to clean up workout sessions")
		return
	}

	// 2. Delete workout sessions linked via plan_day_id to this plan's days
	if _, err := tx.Exec(`
		DELETE FROM workout_sessions WHERE plan_day_id IN (
			SELECT id FROM plan_days WHERE plan_id = ?
		)
	`, planID); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to clean up workout sessions")
		return
	}

	// 3. Delete the plan — plan_days and plan_exercises cascade automatically
	if _, err := tx.Exec("DELETE FROM weekly_plans WHERE id = ?", planID); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to delete plan")
		return
	}

	if err := tx.Commit(); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to commit deletion")
		return
	}

	utils.WriteSuccess(w, nil, "Plan deleted")
}

// ClonePlan handles POST /api/plans/{planId}/clone.
// Copies a plan to a new week (usually the next week).
// Enforces the one-time plan limit before cloning.
func ClonePlan(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	planID := r.PathValue("planId")

	// ── Check one-time override limit before cloning ──────────────
	var oneTimeCount int
	database.DB.QueryRow("SELECT COUNT(*) FROM weekly_plans WHERE user_id = ? AND routine_type = 'one_time'", userID).Scan(&oneTimeCount)
	if oneTimeCount >= 3 {
		utils.WriteError(w, http.StatusConflict, "You can only have up to 3 one-time overrides. Delete or wait for one to expire before cloning.")
		return
	}

	// Fetch source plan
	plan, err := fetchPlanByID(planID, userID)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "Plan not found")
		return
	}

	// Calculate new week dates:
	//   - For consistent routines (empty weekStartDate), clone to next week's Monday
	//   - For one-time overrides, shift forward by one week from their existing date
	var newStart string
	if plan.WeekStartDate == "" {
		// Consistent routine — use next week's Monday via util helpers
		newStart = utils.StartOfWeek(time.Now()).AddDate(0, 0, 7).Format("2006-01-02")
	} else {
		srcDate, ok := utils.ParseDate(plan.WeekStartDate)
		if ok {
			newStart = srcDate.AddDate(0, 0, 7).Format("2006-01-02")
		} else {
			// Fallback — use next week's Monday
			newStart = utils.StartOfWeek(time.Now()).AddDate(0, 0, 7).Format("2006-01-02")
		}
	}
	dstDate, _ := utils.ParseDate(newStart)
	newEnd := utils.EndOfWeek(dstDate).Format("2006-01-02")

	// Create cloned plan — always a one-time override for the target week
	newID := uuid.New().String()
	database.DB.Exec(`
		INSERT INTO weekly_plans (id, user_id, week_start_date, week_end_date, name, mode, mode_goal, routine_type, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, 'one_time', datetime('now'), datetime('now'))
	`, newID, userID, newStart, newEnd, plan.Name+" (Copy)", plan.Mode, plan.ModeGoal)

	// Clone days
	for _, day := range plan.Days {
		dayReq := models.CreatePlanDayReq{
			DayOfWeek:         day.DayOfWeek,
			WorkoutName:       day.WorkoutName,
			IsRestDay:         day.IsRestDay,
			EstimatedDuration: day.EstimatedDuration,
		}
		for _, ex := range day.Exercises {
			dayReq.Exercises = append(dayReq.Exercises, models.CreatePlanExerciseReq{
				ExerciseID:         ex.ExerciseID,
				CustomExerciseName: ex.CustomExerciseName,
				TargetSets:         ex.TargetSets,
				TargetReps:         ex.TargetReps,
				TargetWeight:       ex.TargetWeight,
				Notes:              ex.Notes,
			})
		}
		createPlanDay(newID, dayReq, day.SortOrder)
	}

	clonedPlan, _ := fetchPlanByID(newID, userID)
	utils.WriteCreated(w, clonedPlan, "Plan cloned")
}

// ── Workout Sessions ─────────────────────────────────────────────────

// StartWorkout handles POST /api/workouts.
// Starts a new workout session from a plan day or ad-hoc.
func StartWorkout(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	var req models.StartWorkoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	sessionID := uuid.New().String()
	now := time.Now().UTC().Format(time.RFC3339)
	today := utils.TodayString()

	// Start from plan day if provided
	if req.PlanDayID != "" {
		// Get plan day details
		var planID, workoutName string
		var estimatedDuration int
		database.DB.QueryRow(`
			SELECT plan_id, workout_name, estimated_duration
			FROM plan_days WHERE id = ?
		`, req.PlanDayID).Scan(&planID, &workoutName, &estimatedDuration)

		database.DB.Exec(`
			INSERT INTO workout_sessions (id, user_id, plan_id, plan_day_id, workout_name, date, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`, sessionID, userID, planID, req.PlanDayID, workoutName, today, now)

		// Copy exercises from the plan into the session
		copyPlanExercisesToSession(sessionID, req.PlanDayID)
	} else {
		// Ad-hoc workout
		database.DB.Exec(`
			INSERT INTO workout_sessions (id, user_id, workout_name, date, created_at)
			VALUES (?, ?, ?, ?, ?)
		`, sessionID, userID, req.WorkoutName, today, now)
	}

	session, _ := fetchWorkoutSession(sessionID, userID)
	utils.WriteCreated(w, session, "Workout started")
}

// GetWorkoutSession handles GET /api/workouts/{sessionId}.
func GetWorkoutSession(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	sessionID := r.PathValue("sessionId")

	session, err := fetchWorkoutSession(sessionID, userID)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "Workout session not found")
		return
	}

	utils.WriteSuccess(w, session, "Session retrieved")
}

// UpdateWorkoutSession handles PUT /api/workouts/{sessionId}.
// Updates set progress during an active workout.
func UpdateWorkoutSession(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	sessionID := r.PathValue("sessionId")

	// Verify ownership
	var ownerID string
	err := database.DB.QueryRow("SELECT user_id FROM workout_sessions WHERE id = ?", sessionID).Scan(&ownerID)
	if err != nil || ownerID != userID {
		utils.WriteError(w, http.StatusNotFound, "Workout session not found")
		return
	}

	var req models.UpdateWorkoutRequest
	json.NewDecoder(r.Body).Decode(&req)

	for _, ex := range req.Exercises {
		for _, set := range ex.Sets {
			database.DB.Exec(`
				UPDATE session_sets SET weight_kg = ?, reps = ?, completed = ?
				WHERE session_exercise_id = (SELECT id FROM session_exercises WHERE session_id = ? AND exercise_id = ? LIMIT 1)
				AND set_number = ?
			`, set.WeightKg, set.Reps, set.Completed, sessionID, ex.ExerciseID, set.SetNumber)
		}
	}

	if req.Notes != "" {
		database.DB.Exec("UPDATE workout_sessions SET notes = ? WHERE id = ?", req.Notes, sessionID)
	}

	session, _ := fetchWorkoutSession(sessionID, userID)
	utils.WriteSuccess(w, session, "Workout updated")
}

// CompleteWorkout handles POST /api/workouts/{sessionId}/complete.
// Finalizes a workout session, calculates totals, and updates streaks/stats.
func CompleteWorkout(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	sessionID := r.PathValue("sessionId")

	// Verify ownership
	var ownerID string
	err := database.DB.QueryRow("SELECT user_id FROM workout_sessions WHERE id = ?", sessionID).Scan(&ownerID)
	if err != nil || ownerID != userID {
		utils.WriteError(w, http.StatusNotFound, "Workout session not found")
		return
	}

	// Calculate total volume and duration
	var totalVolume, totalWeight float64
	var totalReps int
	rows, _ := database.DB.Query(`
		SELECT SUM(ss.weight_kg * ss.reps), SUM(ss.weight_kg), SUM(ss.reps)
		FROM session_sets ss
		JOIN session_exercises se ON ss.session_exercise_id = se.id
		WHERE se.session_id = ?
	`, sessionID)
	if rows.Next() {
		rows.Scan(&totalVolume, &totalWeight, &totalReps)
	}
	rows.Close()

	_ = totalWeight
	_ = totalReps

	// Estimate duration: 2 min per set + 1 min rest
	var setCount int
	database.DB.QueryRow("SELECT COUNT(*) FROM session_sets WHERE session_exercise_id IN (SELECT id FROM session_exercises WHERE session_id = ?)", sessionID).Scan(&setCount)
	estimatedDuration := setCount * 3 // rough estimate

	database.DB.Exec(`
		UPDATE workout_sessions SET
			completed = 1, is_draft = 0, duration_minutes = ?,
			total_volume_kg = ?, date = ?
		WHERE id = ?
	`, estimatedDuration, totalVolume, utils.TodayString(), sessionID)

	// Mark plan day as completed if linked
	var planDayID string
	database.DB.QueryRow("SELECT COALESCE(plan_day_id, '') FROM workout_sessions WHERE id = ?", sessionID).Scan(&planDayID)
	if planDayID != "" {
		database.DB.Exec("UPDATE plan_days SET completed = 1, completed_date = ? WHERE id = ?", utils.TodayString(), planDayID)
	}

	// Update user stats
	updateUserStats(userID, estimatedDuration, totalVolume)

	session, _ := fetchWorkoutSession(sessionID, userID)
	utils.WriteSuccess(w, session, "Workout completed! Great job!")
}

// CancelWorkout handles POST /api/workouts/{sessionId}/cancel.
// Saves the workout as a draft (incomplete).
func CancelWorkout(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	sessionID := r.PathValue("sessionId")

	var ownerID string
	err := database.DB.QueryRow("SELECT user_id FROM workout_sessions WHERE id = ?", sessionID).Scan(&ownerID)
	if err != nil || ownerID != userID {
		utils.WriteError(w, http.StatusNotFound, "Workout session not found")
		return
	}

	database.DB.Exec("UPDATE workout_sessions SET is_draft = 1 WHERE id = ?", sessionID)
	utils.WriteSuccess(w, nil, "Workout saved as draft")
}

// GetWorkoutHistory handles GET /api/workouts/history.
// Lists past completed workouts with pagination.
func GetWorkoutHistory(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if page < 1 { page = 1 }
	if limit < 1 || limit > 100 { limit = 20 }

	var total int
	database.DB.QueryRow("SELECT COUNT(*) FROM workout_sessions WHERE user_id = ? AND completed = 1", userID).Scan(&total)

	offset := (page - 1) * limit
	rows, err := database.DB.Query(`
		SELECT id, user_id, COALESCE(plan_id, ''), COALESCE(plan_day_id, ''),
		       workout_name, COALESCE(date, ''), duration_minutes,
		       total_volume_kg, completed, is_draft, COALESCE(notes, ''), created_at
		FROM workout_sessions
		WHERE user_id = ? AND completed = 1
		ORDER BY date DESC LIMIT ? OFFSET ?
	`, userID, limit, offset)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to fetch history")
		return
	}
	defer rows.Close()

	var sessions []models.WorkoutSession
	for rows.Next() {
		var s models.WorkoutSession
		var completedInt, draftInt int
		rows.Scan(&s.ID, &s.UserID, &s.PlanID, &s.PlanDayID,
			&s.WorkoutName, &s.Date, &s.DurationMinutes,
			&s.TotalVolumeKg, &completedInt, &draftInt, &s.Notes, &s.CreatedAt)
		s.Completed = completedInt == 1
		s.IsDraft = draftInt == 1
		sessions = append(sessions, s)
	}

	if sessions == nil {
		sessions = []models.WorkoutSession{}
	}

	utils.WritePaginated(w, sessions, page, limit, total)
}

// ── Workout Templates ────────────────────────────────────────────────

// Thread-safe one-time initialization of prebuilt templates.
var (
	cachedTemplates []models.WorkoutTemplate
	templatesOnce   sync.Once
)

// GetWorkoutTemplates handles GET /api/workout-templates.
// Returns pre-built workout plan templates (cached in memory).
func GetWorkoutTemplates(w http.ResponseWriter, r *http.Request) {
	templatesOnce.Do(func() {
		cachedTemplates = getPrebuiltTemplates()
	})
	utils.WriteSuccess(w, cachedTemplates, "Templates retrieved")
}

// ── SetActivePlan ────────────────────────────────────────────────────

// SetActivePlan handles POST /api/plans/{planId}/activate.
// Sets a consistent routine as the active plan. Only one routine can be active at a time.
// Switching the active routine RESETS progression stats (XP, level, streak, volume)
// because progression is tied to consistency with a specific routine.
// Uses a transaction to prevent race conditions.
func SetActivePlan(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	planID := r.PathValue("planId")

	// ── Verify the plan exists and is a consistent routine ────────
	var routineType string
	err := database.DB.QueryRow(
		"SELECT COALESCE(routine_type, 'consistent') FROM weekly_plans WHERE id = ? AND user_id = ?",
		planID, userID,
	).Scan(&routineType)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "Plan not found")
		return
	}
	if routineType != "consistent" {
		utils.WriteError(w, http.StatusBadRequest, "Only consistent routines can be activated")
		return
	}

	// ── Check if already active ───────────────────────────────────
	var isActive int
	database.DB.QueryRow(
		"SELECT COALESCE(is_active, 0) FROM weekly_plans WHERE id = ?", planID,
	).Scan(&isActive)
	if isActive == 1 {
		utils.WriteError(w, http.StatusConflict, "This routine is already active")
		return
	}

	// ── Transaction: deactivate all, activate target, reset stats ─
	tx, err := database.DB.Begin()
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to start transaction")
		return
	}
	defer tx.Rollback()

	// 1. Deactivate all consistent routines for this user
	if _, err := tx.Exec(
		"UPDATE weekly_plans SET is_active = 0, updated_at = datetime('now') WHERE user_id = ? AND routine_type = 'consistent'",
		userID,
	); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to deactivate routines")
		return
	}

	// 2. Activate the target routine
	if _, err := tx.Exec(
		"UPDATE weekly_plans SET is_active = 1, updated_at = datetime('now') WHERE id = ?",
		planID,
	); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to activate routine")
		return
	}

	// 3. Reset progression stats (keep longest_streak as a lifetime achievement)
	if _, err := tx.Exec(`
		UPDATE user_stats SET
			total_workouts = 0,
			total_minutes = 0,
			total_volume_kg = 0,
			current_streak = 0,
			fitness_xp = 0,
			fitness_level = 1,
			last_workout_date = '',
			updated_at = datetime('now')
		WHERE user_id = ?
	`, userID); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to reset progression")
		return
	}

	// ── Commit transaction ────────────────────────────────────────
	if err := tx.Commit(); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to commit changes")
		return
	}

	plan, _ := fetchPlanByID(planID, userID)
	utils.WriteSuccess(w, plan, "Routine activated — progression has been reset for the new routine")
}

// ── Helper Functions ─────────────────────────────────────────────────

// createPlanDay inserts a single plan day with its exercises.
func createPlanDay(planID string, day models.CreatePlanDayReq, sortOrder int) string {
	dayID := uuid.New().String()
	restDay := 0
	if day.IsRestDay { restDay = 1 }
	duration := day.EstimatedDuration
	if duration == 0 { duration = 45 }

	database.DB.Exec(`
		INSERT INTO plan_days (id, plan_id, day_of_week, workout_name, is_rest_day, estimated_duration, sort_order, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
	`, dayID, planID, day.DayOfWeek, day.WorkoutName, restDay, duration, sortOrder)

	// Add exercises
	for j, ex := range day.Exercises {
		exID := uuid.New().String()
		// For custom exercises (no real exercise_id), store name in custom_exercise_name
		exerciseID := ex.ExerciseID
		customName := ex.CustomExerciseName
		if exerciseID == "" && customName == "" {
			customName = ex.ExerciseID // fallback — shouldn't happen
		}
		database.DB.Exec(`
			INSERT INTO plan_exercises (id, plan_day_id, exercise_id, custom_exercise_name, target_sets, target_reps, target_weight, notes, sort_order, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
		`, exID, dayID, exerciseID, customName, ex.TargetSets, ex.TargetReps, ex.TargetWeight, ex.Notes, j)
	}

	return dayID
}

// fetchPlanDays retrieves all days for a plan, including exercises.
func fetchPlanDays(planID string) []models.PlanDay {
	rows, err := database.DB.Query(`
		SELECT id, plan_id, day_of_week, workout_name, is_rest_day,
		       estimated_duration, completed, COALESCE(completed_date, ''),
		       sort_order, created_at
		FROM plan_days WHERE plan_id = ? ORDER BY day_of_week, sort_order
	`, planID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var days []models.PlanDay
	for rows.Next() {
		var d models.PlanDay
		var restDayInt, completedInt int
		rows.Scan(&d.ID, &d.PlanID, &d.DayOfWeek, &d.WorkoutName,
			&restDayInt, &d.EstimatedDuration, &completedInt,
			&d.CompletedDate, &d.SortOrder, &d.CreatedAt)
		d.IsRestDay = restDayInt == 1
		d.Completed = completedInt == 1

		// Fetch exercises for this day
		d.Exercises = fetchPlanExercises(d.ID)
		days = append(days, d)
	}

	if days == nil {
		days = []models.PlanDay{}
	}
	return days
}

// fetchPlanExercises retrieves exercises for a plan day.
// Uses LEFT JOIN because custom exercises have no matching row in the exercises table —
// in that case, we fall back to pe.custom_exercise_name.
func fetchPlanExercises(dayID string) []models.PlanExercise {
	rows, err := database.DB.Query(`
		SELECT pe.id, pe.plan_day_id, pe.exercise_id,
		       COALESCE(e.name, pe.custom_exercise_name) as exercise_name,
		       COALESCE(e.muscle_group, '') as muscle_group,
		       pe.target_sets, pe.target_reps, pe.target_weight,
		       COALESCE(pe.notes, ''), pe.sort_order, pe.created_at,
		       COALESCE(pe.custom_exercise_name, '')
		FROM plan_exercises pe
		LEFT JOIN exercises e ON pe.exercise_id = e.id AND pe.exercise_id != ''
		WHERE pe.plan_day_id = ?
		ORDER BY pe.sort_order
	`, dayID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var exercises []models.PlanExercise
	for rows.Next() {
		var ex models.PlanExercise
		rows.Scan(&ex.ID, &ex.PlanDayID, &ex.ExerciseID, &ex.ExerciseName,
			&ex.MuscleGroup, &ex.TargetSets, &ex.TargetReps, &ex.TargetWeight,
			&ex.Notes, &ex.SortOrder, &ex.CreatedAt, &ex.CustomExerciseName)
		exercises = append(exercises, ex)
	}

	if exercises == nil {
		exercises = []models.PlanExercise{}
	}
	return exercises
}

// fetchPlanByID retrieves a full plan with all days and exercises.
func fetchPlanByID(planID, userID string) (*models.WeeklyPlan, error) {
	var p models.WeeklyPlan
	var isTemplate, isActive int
	err := database.DB.QueryRow(`
		SELECT id, user_id, week_start_date, week_end_date, name,
		       COALESCE(mode, ''), COALESCE(mode_goal, ''),
		       COALESCE(routine_type, 'consistent'),
		       COALESCE(is_active, 0),
		       is_template, COALESCE(template_name, ''), created_at, updated_at
		FROM weekly_plans WHERE id = ? AND user_id = ?
	`, planID, userID).Scan(&p.ID, &p.UserID, &p.WeekStartDate, &p.WeekEndDate,
		&p.Name, &p.Mode, &p.ModeGoal, &p.RoutineType,
		&isActive,
		&isTemplate, &p.TemplateName, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	p.IsTemplate = isTemplate == 1
	p.IsActive = isActive == 1
	if p.RoutineType == "" {
		p.RoutineType = "consistent"
	}
	p.Days = fetchPlanDays(p.ID)
	return &p, nil
}

// fetchWorkoutSession retrieves a workout session with all exercises and sets.
func fetchWorkoutSession(sessionID, userID string) (*models.WorkoutSession, error) {
	var s models.WorkoutSession
	var completedInt, draftInt int
	err := database.DB.QueryRow(`
		SELECT id, user_id, COALESCE(plan_id, ''), COALESCE(plan_day_id, ''),
		       workout_name, COALESCE(date, ''), duration_minutes,
		       total_volume_kg, completed, is_draft, COALESCE(notes, ''), created_at
		FROM workout_sessions WHERE id = ? AND user_id = ?
	`, sessionID, userID).Scan(&s.ID, &s.UserID, &s.PlanID, &s.PlanDayID,
		&s.WorkoutName, &s.Date, &s.DurationMinutes,
		&s.TotalVolumeKg, &completedInt, &draftInt, &s.Notes, &s.CreatedAt)
	if err != nil {
		return nil, err
	}
	s.Completed = completedInt == 1
	s.IsDraft = draftInt == 1

	// Fetch session exercises with sets
	s.Exercises = fetchSessionExercises(sessionID)
	return &s, nil
}

// fetchSessionExercises retrieves all exercises (with sets) for a session.
func fetchSessionExercises(sessionID string) []models.SessionExercise {
	rows, err := database.DB.Query(`
		SELECT id, session_id, exercise_id, exercise_name, muscle_group, sort_order, COALESCE(notes, '')
		FROM session_exercises WHERE session_id = ? ORDER BY sort_order
	`, sessionID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var exercises []models.SessionExercise
	for rows.Next() {
		var ex models.SessionExercise
		rows.Scan(&ex.ID, &ex.SessionID, &ex.ExerciseID, &ex.ExerciseName,
			&ex.MuscleGroup, &ex.SortOrder, &ex.Notes)

		// Fetch sets for this exercise
		ex.Sets = fetchSessionSets(ex.ID)
		exercises = append(exercises, ex)
	}

	if exercises == nil {
		exercises = []models.SessionExercise{}
	}
	return exercises
}

// fetchSessionSets retrieves all sets for a session exercise.
func fetchSessionSets(sessionExerciseID string) []models.SessionSet {
	rows, err := database.DB.Query(`
		SELECT id, session_exercise_id, set_number, weight_kg, reps, completed, rest_seconds
		FROM session_sets WHERE session_exercise_id = ? ORDER BY set_number
	`, sessionExerciseID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var sets []models.SessionSet
	for rows.Next() {
		var set models.SessionSet
		var completedInt int
		rows.Scan(&set.ID, &set.SessionExerciseID, &set.SetNumber,
			&set.WeightKg, &set.Reps, &completedInt, &set.RestSeconds)
		set.Completed = completedInt == 1
		sets = append(sets, set)
	}

	if sets == nil {
		sets = []models.SessionSet{}
	}
	return sets
}

// copyPlanExercisesToSession copies exercises from a plan day into a workout session.
// Handles both library exercises (JOIN exercises table) and custom exercises (fallback to custom_exercise_name).
func copyPlanExercisesToSession(sessionID, planDayID string) {
	rows, err := database.DB.Query(`
		SELECT pe.exercise_id, pe.custom_exercise_name,
		       COALESCE(e.name, pe.custom_exercise_name) as exercise_name,
		       COALESCE(e.muscle_group, '') as muscle_group,
		       pe.target_sets, pe.target_reps, pe.target_weight,
		       pe.sort_order, COALESCE(pe.notes, '')
		FROM plan_exercises pe
		LEFT JOIN exercises e ON pe.exercise_id = e.id AND pe.exercise_id != ''
		WHERE pe.plan_day_id = ?
		ORDER BY pe.sort_order
	`, planDayID)
	if err != nil {
		return
	}
	defer rows.Close()

	sortOrder := 0
	for rows.Next() {
		var exID, customName, exName, muscleGroup, targetReps string
		var targetSets int
		var targetWeight float64
		var notes string
		var planSortOrder int
		rows.Scan(&exID, &customName, &exName, &muscleGroup, &targetSets, &targetReps, &targetWeight, &planSortOrder, &notes)

		// Use custom exercise name if it's a custom exercise (no real exercise_id)
		sessionExID := uuid.New().String()
		database.DB.Exec(`
			INSERT INTO session_exercises (id, session_id, exercise_id, exercise_name, muscle_group, sort_order, notes)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`, sessionExID, sessionID, exID, exName, muscleGroup, sortOrder, notes)

		// Create empty sets based on target_sets
		for i := 1; i <= targetSets; i++ {
			setID := uuid.New().String()
			database.DB.Exec(`
				INSERT INTO session_sets (id, session_exercise_id, set_number, weight_kg, reps, rest_seconds)
				VALUES (?, ?, ?, ?, 0, 60)
			`, setID, sessionExID, i, targetWeight)
		}
		sortOrder++
	}
}

// updateUserStats increments the user's workout statistics after completing a session.
func updateUserStats(userID string, durationMinutes int, totalVolume float64) {
	// Ensure stats row exists
	database.DB.Exec("INSERT OR IGNORE INTO user_stats (user_id) VALUES (?)", userID)

	database.DB.Exec(`
		UPDATE user_stats SET
			total_workouts = total_workouts + 1,
			total_minutes = total_minutes + ?,
			total_volume_kg = total_volume_kg + ?,
			last_workout_date = ?,
			updated_at = datetime('now')
		WHERE user_id = ?
	`, durationMinutes, totalVolume, utils.TodayString(), userID)

	// Update XP (10 XP per workout, bonus for volume)
	xpGain := 10 + int(totalVolume/100)
	database.DB.Exec(`
		UPDATE user_stats SET
			fitness_xp = fitness_xp + ?
		WHERE user_id = ?
	`, xpGain, userID)

	// Level up check: every 100 XP = 1 level
	var xp, level int
	database.DB.QueryRow("SELECT fitness_xp, fitness_level FROM user_stats WHERE user_id = ?", userID).Scan(&xp, &level)
	newLevel := (xp / 100) + 1
	if newLevel > level {
		database.DB.Exec("UPDATE user_stats SET fitness_level = ? WHERE user_id = ?", newLevel, userID)
	}

	// Update streak
	updateStreak(userID)
}

// updateStreak recalculates the user's current workout streak.
func updateStreak(userID string) {
	rows, _ := database.DB.Query(`
		SELECT DISTINCT date FROM workout_sessions
		WHERE user_id = ? AND completed = 1
		ORDER BY date DESC LIMIT 365
	`, userID)
	defer rows.Close()

	dates := make(map[string]bool)
	for rows.Next() {
		var date string
		rows.Scan(&date)
		dates[date] = true
	}

	streak := utils.CalculateStreak(dates)

	// Update current and longest streak
	var longestStreak int
	database.DB.QueryRow("SELECT COALESCE(longest_streak, 0) FROM user_stats WHERE user_id = ?", userID).Scan(&longestStreak)
	if streak > longestStreak {
		longestStreak = streak
	}
	database.DB.Exec("UPDATE user_stats SET current_streak = ?, longest_streak = ?, updated_at = datetime('now') WHERE user_id = ?",
		streak, longestStreak, userID)
}

// getPrebuiltTemplates returns the pre-built workout plan templates.
func getPrebuiltTemplates() []models.WorkoutTemplate {
	return []models.WorkoutTemplate{
		{
			Name:        "Push/Pull/Legs",
			Description: "Classic 3-day split. Push muscles (chest, shoulders, triceps), Pull muscles (back, biceps), Legs.",
			Days: []models.TemplateDay{
				{DayOfWeek: 1, WorkoutName: "Push Day A", Exercises: []models.TemplateExercise{
					{Name: "Bench Press", MuscleGroup: "chest", Equipment: "Barbell", TargetSets: 4, TargetReps: "8-12"},
					{Name: "Overhead Press", MuscleGroup: "shoulders", Equipment: "Barbell", TargetSets: 3, TargetReps: "8-12"},
					{Name: "Incline Dumbbell Press", MuscleGroup: "chest", Equipment: "Dumbbell", TargetSets: 3, TargetReps: "10-15"},
					{Name: "Tricep Pushdown", MuscleGroup: "arms", Equipment: "Cable", TargetSets: 3, TargetReps: "12-15"},
				}},
				{DayOfWeek: 3, WorkoutName: "Pull Day A", Exercises: []models.TemplateExercise{
					{Name: "Deadlift", MuscleGroup: "back", Equipment: "Barbell", TargetSets: 3, TargetReps: "5-8"},
					{Name: "Pull-ups", MuscleGroup: "back", Equipment: "Bodyweight", TargetSets: 3, TargetReps: "8-12"},
					{Name: "Barbell Row", MuscleGroup: "back", Equipment: "Barbell", TargetSets: 3, TargetReps: "8-12"},
					{Name: "Bicep Curl", MuscleGroup: "arms", Equipment: "Dumbbell", TargetSets: 3, TargetReps: "12-15"},
				}},
				{DayOfWeek: 5, WorkoutName: "Leg Day A", Exercises: []models.TemplateExercise{
					{Name: "Squat", MuscleGroup: "legs", Equipment: "Barbell", TargetSets: 4, TargetReps: "8-12"},
					{Name: "Romanian Deadlift", MuscleGroup: "legs", Equipment: "Barbell", TargetSets: 3, TargetReps: "10-12"},
					{Name: "Leg Press", MuscleGroup: "legs", Equipment: "Machine", TargetSets: 3, TargetReps: "12-15"},
					{Name: "Calf Raise", MuscleGroup: "legs", Equipment: "Machine", TargetSets: 4, TargetReps: "15-20"},
				}},
			},
		},
		{
			Name:        "Upper/Lower Split",
			Description: "4-day split alternating upper body and lower body.",
			Days: []models.TemplateDay{
				{DayOfWeek: 1, WorkoutName: "Upper Body A", Exercises: []models.TemplateExercise{
					{Name: "Bench Press", MuscleGroup: "chest", Equipment: "Barbell", TargetSets: 4, TargetReps: "8-12"},
					{Name: "Barbell Row", MuscleGroup: "back", Equipment: "Barbell", TargetSets: 4, TargetReps: "8-12"},
					{Name: "Overhead Press", MuscleGroup: "shoulders", Equipment: "Dumbbell", TargetSets: 3, TargetReps: "10-12"},
				}},
				{DayOfWeek: 2, WorkoutName: "Lower Body A", Exercises: []models.TemplateExercise{
					{Name: "Squat", MuscleGroup: "legs", Equipment: "Barbell", TargetSets: 4, TargetReps: "8-12"},
					{Name: "Romanian Deadlift", MuscleGroup: "legs", Equipment: "Barbell", TargetSets: 3, TargetReps: "10-12"},
					{Name: "Leg Press", MuscleGroup: "legs", Equipment: "Machine", TargetSets: 3, TargetReps: "12-15"},
				}},
				{DayOfWeek: 4, WorkoutName: "Upper Body B", Exercises: []models.TemplateExercise{
					{Name: "Pull-ups", MuscleGroup: "back", Equipment: "Bodyweight", TargetSets: 3, TargetReps: "8-12"},
					{Name: "Dumbbell Fly", MuscleGroup: "chest", Equipment: "Dumbbell", TargetSets: 3, TargetReps: "12-15"},
					{Name: "Lateral Raise", MuscleGroup: "shoulders", Equipment: "Dumbbell", TargetSets: 3, TargetReps: "15-20"},
				}},
				{DayOfWeek: 5, WorkoutName: "Lower Body B", Exercises: []models.TemplateExercise{
					{Name: "Deadlift", MuscleGroup: "back", Equipment: "Barbell", TargetSets: 3, TargetReps: "5-8"},
					{Name: "Front Squat", MuscleGroup: "legs", Equipment: "Barbell", TargetSets: 3, TargetReps: "8-12"},
					{Name: "Calf Raise", MuscleGroup: "legs", Equipment: "Machine", TargetSets: 4, TargetReps: "15-20"},
				}},
			},
		},
		{
			Name:        "Full Body 3x",
			Description: "3 full-body workouts per week. Great for beginners.",
			Days: []models.TemplateDay{
				{DayOfWeek: 1, WorkoutName: "Full Body A", Exercises: []models.TemplateExercise{
					{Name: "Squat", MuscleGroup: "legs", Equipment: "Barbell", TargetSets: 3, TargetReps: "8-12"},
					{Name: "Bench Press", MuscleGroup: "chest", Equipment: "Barbell", TargetSets: 3, TargetReps: "8-12"},
					{Name: "Barbell Row", MuscleGroup: "back", Equipment: "Barbell", TargetSets: 3, TargetReps: "8-12"},
					{Name: "Overhead Press", MuscleGroup: "shoulders", Equipment: "Dumbbell", TargetSets: 2, TargetReps: "10-12"},
				}},
				{DayOfWeek: 3, WorkoutName: "Full Body B", Exercises: []models.TemplateExercise{
					{Name: "Deadlift", MuscleGroup: "back", Equipment: "Barbell", TargetSets: 3, TargetReps: "5-8"},
					{Name: "Dumbbell Fly", MuscleGroup: "chest", Equipment: "Dumbbell", TargetSets: 3, TargetReps: "12-15"},
					{Name: "Leg Press", MuscleGroup: "legs", Equipment: "Machine", TargetSets: 3, TargetReps: "12-15"},
					{Name: "Bicep Curl", MuscleGroup: "arms", Equipment: "Dumbbell", TargetSets: 2, TargetReps: "12-15"},
				}},
				{DayOfWeek: 5, WorkoutName: "Full Body C", Exercises: []models.TemplateExercise{
					{Name: "Front Squat", MuscleGroup: "legs", Equipment: "Barbell", TargetSets: 3, TargetReps: "8-12"},
					{Name: "Pull-ups", MuscleGroup: "back", Equipment: "Bodyweight", TargetSets: 3, TargetReps: "8-12"},
					{Name: "Tricep Pushdown", MuscleGroup: "arms", Equipment: "Cable", TargetSets: 2, TargetReps: "12-15"},
					{Name: "Lateral Raise", MuscleGroup: "shoulders", Equipment: "Dumbbell", TargetSets: 2, TargetReps: "15-20"},
				}},
			},
		},
	}
}
