// Package handlers — dashboard aggregation endpoint.
// GET /api/dashboard returns ALL widget data in a single API call.
// This is the primary data source for the Dashboard tab.
package handlers

import (
	"encoding/json"
	"net/http"

	"resolution-fitnessapp-backend/database"
	"resolution-fitnessapp-backend/models"
	"resolution-fitnessapp-backend/utils"
)

// GetDashboard handles GET /api/dashboard.
// Returns a single response with all dashboard widgets:
// daily quote, health fact, fitness/health summaries, progression,
// today summary, next workout, and streak info.
//
// The mobile app calls this once when the Dashboard tab mounts
// (and on pull-to-refresh) to populate all widget cards.
func GetDashboard(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	dashboard := models.DashboardData{}

	// ── 1. Greeting ───────────────────────────────────────────────
	dashboard.Greeting = utils.TimeBasedGreeting()

	// ── 2. Daily Quote ────────────────────────────────────────────
	dashboard.DailyQuote = fetchRandomQuote()

	// ── 3. Health Fact ────────────────────────────────────────────
	dashboard.HealthFact = fetchRandomHealthFact()

	// ── 4. Fitness Summary (this week) ────────────────────────────
	dashboard.FitnessSummary = calculateFitnessSummary(userID)

	// ── 5. Health Summary (today) ─────────────────────────────────
	dashboard.HealthSummary = calculateHealthSummary(userID)

	// ── 6. Progression (XP, level, streak) ────────────────────────
	dashboard.Progression = fetchProgression(userID)

	// ── 7. Today Summary ─────────────────────────────────────────
	dashboard.TodaySummary = calculateTodaySummary(userID)

	// ── 8. Next Workout ───────────────────────────────────────────
	dashboard.NextWorkout = fetchNextWorkout(userID)

	// ── 9. Streak Info ────────────────────────────────────────────
	dashboard.StreakInfo = fetchStreakInfo(userID)

	utils.WriteSuccess(w, dashboard, "Dashboard loaded")
}

// ── Dashboard Helper Functions ───────────────────────────────────────

// fetchRandomQuote returns a random motivational quote from the database.
func fetchRandomQuote() models.DailyQuote {
	var quote models.DailyQuote
	err := database.DB.QueryRow(`
		SELECT id, text, COALESCE(author, 'Unknown'), COALESCE(category, 'motivation')
		FROM daily_quotes WHERE is_active = 1 ORDER BY RANDOM() LIMIT 1
	`).Scan(&quote.ID, &quote.Text, &quote.Author, &quote.Category)
	if err != nil {
		// Fallback quote if database is empty
		return models.DailyQuote{
			Text: "The only bad workout is the one that didn't happen.",
			Author: "Unknown", Category: "motivation",
		}
	}
	return quote
}

// fetchRandomHealthFact returns a random health/gym fact from the database.
func fetchRandomHealthFact() models.HealthFact {
	var fact models.HealthFact
	err := database.DB.QueryRow(`
		SELECT id, text, COALESCE(category, 'nutrition'), COALESCE(source, '')
		FROM health_facts WHERE is_active = 1 ORDER BY RANDOM() LIMIT 1
	`).Scan(&fact.ID, &fact.Text, &fact.Category, &fact.Source)
	if err != nil {
		return models.HealthFact{
			Text: "Your muscles continue to burn calories for up to 48 hours after a workout.",
			Category: "exercise_science", Source: "Journal of Sports Science",
		}
	}
	return fact
}

// calculateFitnessSummary calculates this week's workout completion stats.
func calculateFitnessSummary(userID string) models.FitnessSummary {
	startDate := utils.WeekStartString()
	endDate := utils.WeekEndString()
	today := utils.TodayString()

	// Workouts completed this week
	var workoutsCompleted int
	database.DB.QueryRow(`
		SELECT COUNT(*) FROM workout_sessions
		WHERE user_id = ? AND completed = 1 AND date BETWEEN ? AND ?
	`, userID, startDate, endDate).Scan(&workoutsCompleted)

	// Workouts planned this week
	daysPlanned := 0
	rows, _ := database.DB.Query(`
		SELECT COUNT(*) FROM plan_days pd
		JOIN weekly_plans wp ON pd.plan_id = wp.id
		WHERE wp.user_id = ? AND wp.week_start_date = ? AND pd.is_rest_day = 0
	`, userID, startDate)
	if rows.Next() {
		rows.Scan(&daysPlanned)
	}
	rows.Close()

	// Total volume this week
	var totalVolume float64
	database.DB.QueryRow(`
		SELECT COALESCE(SUM(total_volume_kg), 0) FROM workout_sessions
		WHERE user_id = ? AND completed = 1 AND date BETWEEN ? AND ?
	`, userID, startDate, endDate).Scan(&totalVolume)

	// Total minutes this week
	var totalMinutes int
	database.DB.QueryRow(`
		SELECT COALESCE(SUM(duration_minutes), 0) FROM workout_sessions
		WHERE user_id = ? AND completed = 1 AND date BETWEEN ? AND ?
	`, userID, startDate, endDate).Scan(&totalMinutes)

	// Volume trend: compare to last week
	lastWeek, _ := utils.ParseDate(startDate)
	lastStart := lastWeek.AddDate(0, 0, -7).Format("2006-01-02")
	lastEnd := lastWeek.AddDate(0, 0, -1).Format("2006-01-02")
	var lastVolume float64
	database.DB.QueryRow(`
		SELECT COALESCE(SUM(total_volume_kg), 0) FROM workout_sessions
		WHERE user_id = ? AND completed = 1 AND date BETWEEN ? AND ?
	`, userID, lastStart, lastEnd).Scan(&lastVolume)

	volumeTrend := 0.0
	if lastVolume > 0 {
		volumeTrend = (totalVolume - lastVolume) / lastVolume * 100
	}

	completionRate := 0.0
	if daysPlanned > 0 {
		completionRate = float64(workoutsCompleted) / float64(daysPlanned) * 100
	}

	_ = today // used implicitly in some versions

	return models.FitnessSummary{
		WorkoutsCompleted: workoutsCompleted,
		WorkoutsPlanned:   daysPlanned,
		CompletionRate:    completionRate,
		TotalVolumeKg:     totalVolume,
		VolumeTrend:       volumeTrend,
		TotalMinutes:      totalMinutes,
	}
}

// calculateHealthSummary calculates today's nutrition adherence.
func calculateHealthSummary(userID string) models.HealthSummary {
	today := utils.TodayString()

	// Today's macros
	var cal int
	var protein, carbs, fat float64
	database.DB.QueryRow(`
		SELECT COALESCE(SUM(total_calories), 0), COALESCE(SUM(total_protein_g), 0),
		       COALESCE(SUM(total_carbs_g), 0), COALESCE(SUM(total_fat_g), 0)
		FROM food_logs WHERE user_id = ? AND log_date = ?
	`, userID, today).Scan(&cal, &protein, &carbs, &fat)

	// Today's water
	var waterMl int
	database.DB.QueryRow(`
		SELECT COALESCE(SUM(amount_ml), 0) FROM water_logs
		WHERE user_id = ? AND log_date = ?
	`, userID, today).Scan(&waterMl)

	// Targets
	var calorieTarget, proteinTarget, waterGoal int
	database.DB.QueryRow(`
		SELECT calorie_target, protein_target_grams, water_goal_ml
		FROM user_settings WHERE user_id = ?
	`, userID).Scan(&calorieTarget, &proteinTarget, &waterGoal)

	calAdherence := 0.0
	if calorieTarget > 0 {
		calAdherence = float64(cal) / float64(calorieTarget) * 100
		if calAdherence > 100 {
			calAdherence = 100
		}
	}

	return models.HealthSummary{
		CalorieAdherence: calAdherence,
		ProteinG:         protein,
		CarbsG:           carbs,
		FatG:             fat,
		WaterMl:          waterMl,
		WaterGoalMl:      waterGoal,
	}
}

// fetchProgression retrieves the user's gamification stats.
func fetchProgression(userID string) models.Progression {
	// Ensure stats row exists
	database.DB.Exec("INSERT OR IGNORE INTO user_stats (user_id) VALUES (?)", userID)

	var level, xp, longestStreak, currentStreak int
	database.DB.QueryRow(`
		SELECT COALESCE(fitness_level, 1), COALESCE(fitness_xp, 0),
		       COALESCE(longest_streak, 0), COALESCE(current_streak, 0)
		FROM user_stats WHERE user_id = ?
	`, userID).Scan(&level, &xp, &longestStreak, &currentStreak)

	// XP to next level: 100 XP per level
	xpToNextLevel := level * 100

	// Progress within current level (how much XP earned toward next level)
	xpInCurrentLevel := xp - ((level - 1) * 100)
	levelProgress := float64(xpInCurrentLevel) / float64(xpToNextLevel)
	if levelProgress > 1 {
		levelProgress = 1
	}
	if levelProgress < 0 {
		levelProgress = 0
	}

	return models.Progression{
		Level:         level,
		XP:            xp,
		XPToNextLevel: xpToNextLevel,
		LevelProgress: levelProgress,
		CurrentStreak: currentStreak,
		LongestStreak: longestStreak,
	}
}

// calculateTodaySummary returns a compact stats row.
func calculateTodaySummary(userID string) models.TodaySummary {
	today := utils.TodayString()

	// Calories burned estimate (1 hour avg workout = ~500 cal)
	var totalMinutes int
	database.DB.QueryRow(`
		SELECT COALESCE(SUM(duration_minutes), 0) FROM workout_sessions
		WHERE user_id = ? AND completed = 1 AND date = ?
	`, userID, today).Scan(&totalMinutes)
	calBurned := int(float64(totalMinutes) * 7.5) // rough estimate

	// Water glasses
	var waterMl int
	database.DB.QueryRow(`
		SELECT COALESCE(SUM(amount_ml), 0) FROM water_logs
		WHERE user_id = ? AND log_date = ?
	`, userID, today).Scan(&waterMl)

	return models.TodaySummary{
		CaloriesBurned: calBurned,
		WaterGlasses:   waterMl / 250,
		WorkoutMinutes: totalMinutes,
	}
}

// fetchNextWorkout finds the user's next scheduled workout.
func fetchNextWorkout(userID string) *models.NextWorkout {
	today := utils.TodayString()

	var next models.NextWorkout
	err := database.DB.QueryRow(`
		SELECT pd.workout_name, wp.week_start_date, e.muscle_group, pd.estimated_duration
		FROM plan_days pd
		JOIN weekly_plans wp ON pd.plan_id = wp.id
		LEFT JOIN (
			SELECT plan_day_id, MIN(e.muscle_group) as muscle_group
			FROM plan_exercises pe
			JOIN exercises e ON pe.exercise_id = e.id
			GROUP BY plan_day_id
		) e ON pd.plan_day_id = e.plan_day_id
		WHERE wp.user_id = ? AND pd.completed = 0 AND pd.is_rest_day = 0
		ORDER BY wp.week_start_date ASC, pd.day_of_week ASC
		LIMIT 1
	`, userID).Scan(&next.WorkoutName, &next.Date, &next.MuscleGroup, &next.Duration)
	if err != nil {
		return nil
	}

	_ = today
	return &next
}

// fetchStreakInfo returns current streak and 7-day mini calendar.
func fetchStreakInfo(userID string) models.StreakInfo {
	// Get current streak from stats
	var streak int
	database.DB.QueryRow(`
		SELECT COALESCE(current_streak, 0) FROM user_stats WHERE user_id = ?
	`, userID).Scan(&streak)

	// Build 7-day calendar (which days had workouts)
	last7Days := utils.GetLast7Days()
	calendarDays := make([]bool, 7)

	rows, _ := database.DB.Query(`
		SELECT DISTINCT date FROM workout_sessions
		WHERE user_id = ? AND completed = 1 AND date >= ?
	`, userID, last7Days[0])
	defer rows.Close()

	workoutDates := make(map[string]bool)
	for rows.Next() {
		var date string
		rows.Scan(&date)
		workoutDates[date] = true
	}

	for i, date := range last7Days {
		calendarDays[i] = workoutDates[date]
	}

	return models.StreakInfo{
		CurrentStreak: streak,
		Last7Days:     calendarDays,
	}
}

// Ensure json is used
var _ = json.Marshal
