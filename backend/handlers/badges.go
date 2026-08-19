// Package handlers — progression badges endpoint.
// GET /api/badges computes behavior-based achievements from the user's
// activity across the Fitness tab (workouts, streaks) and the Health tab
// (meals logged, days tracked). Nothing is persisted — every request
// evaluates the current stats live.
package handlers

import (
	"net/http"
	"strconv"

	"resolution-fitnessapp-backend/database"
	"resolution-fitnessapp-backend/models"
	"resolution-fitnessapp-backend/utils"
)

// ── Badge Definitions ──────────────────────────────────────────────
// Badges reward real behavior: consistent training on the Fitness tab
// and consistent tracking on the Health tab. Each badge can be earned
// through either tab, so a dedicated nutrition tracker and a gym regular
// both progress.

// GetBadges handles GET /api/badges.
func GetBadges(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	// ── Fitness activity (user_stats) ─────────────────────────────
	// New users may not have a stats row yet — treat as zero activity.
	var totalWorkouts, currentStreak, longestStreak int
	database.DB.QueryRow(`
		SELECT COALESCE(total_workouts, 0), COALESCE(current_streak, 0), COALESCE(longest_streak, 0)
		FROM user_stats WHERE user_id = ?
	`, userID).Scan(&totalWorkouts, &currentStreak, &longestStreak)

	// ── Health activity (food logs) ───────────────────────────────
	// totalMeals = every logged meal; trackedDays = distinct days with
	// at least one food log.
	var totalMeals, trackedDays int
	database.DB.QueryRow(`
		SELECT COUNT(*), COUNT(DISTINCT log_date) FROM food_logs WHERE user_id = ?
	`, userID).Scan(&totalMeals, &trackedDays)

	badges := []models.Badge{
		rookieBadge(totalWorkouts, totalMeals),
		casualGoerBadge(totalWorkouts, trackedDays),
		motivatedBadge(longestStreak, trackedDays),
		gymRatBadge(totalWorkouts, currentStreak, trackedDays),
	}

	utils.WriteSuccess(w, badges, "Badges retrieved")
}

// ── Individual Badge Builders ────────────────────────────────────────

// rookieBadge: first workout OR first logged meal.
func rookieBadge(totalWorkouts, totalMeals int) models.Badge {
	const goal = 1
	progress := badgeProgress(totalWorkouts, goal, totalMeals, goal)
	return models.Badge{
		ID: "rookie", Name: "Rookie", Emoji: "🐣", Category: "mixed",
		Description:  "Complete your first workout or log your first meal.",
		Earned:       progress >= 1,
		Progress:     progress,
		ProgressText: "Workouts " + minInt(totalWorkouts, goal) + "/1 · Meals " + minInt(totalMeals, goal) + "/1",
	}
}

// casualGoerBadge: 5 workouts OR meals tracked on 5 distinct days.
func casualGoerBadge(totalWorkouts, trackedDays int) models.Badge {
	const goal = 5
	progress := badgeProgress(totalWorkouts, goal, trackedDays, goal)
	return models.Badge{
		ID: "casual_goer", Name: "Casual Goer", Emoji: "🏋️", Category: "mixed",
		Description:  "Log 5 workouts or track your meals on 5 days.",
		Earned:       progress >= 1,
		Progress:     progress,
		ProgressText: "Workouts " + minInt(totalWorkouts, goal) + "/5 · Days tracked " + minInt(trackedDays, goal) + "/5",
	}
}

// motivatedBadge: reached a 3-day streak (fitness) or tracked meals on 3 days.
func motivatedBadge(longestStreak, trackedDays int) models.Badge {
	const goal = 3
	progress := badgeProgress(longestStreak, goal, trackedDays, goal)
	return models.Badge{
		ID: "motivated", Name: "Motivated Temporarily", Emoji: "⚡", Category: "mixed",
		Description:  "Build a 3-day workout streak or track meals for 3 days.",
		Earned:       progress >= 1,
		Progress:     progress,
		ProgressText: "Best streak " + minInt(longestStreak, goal) + "/3 · Days tracked " + minInt(trackedDays, goal) + "/3",
	}
}

// gymRatBadge: 25 workouts, a 7-day streak, or meals tracked on 14 days.
func gymRatBadge(totalWorkouts, currentStreak, trackedDays int) models.Badge {
	const workoutGoal = 25
	const streakGoal = 7
	const dayGoal = 14
	progress := badgeProgress3(totalWorkouts, workoutGoal, currentStreak, streakGoal, trackedDays, dayGoal)
	return models.Badge{
		ID: "gym_rat", Name: "Gym Rat", Emoji: "🐀", Category: "mixed",
		Description:  "Hit 25 workouts, a 7-day streak, or track meals for 14 days.",
		Earned:       progress >= 1,
		Progress:     progress,
		ProgressText: "Workouts " + minInt(totalWorkouts, workoutGoal) + "/25 · Streak " +
			minInt(currentStreak, streakGoal) + "/7 · Days tracked " + minInt(trackedDays, dayGoal) + "/14",
	}
}

// ── Helpers ──────────────────────────────────────────────────────────

// badgeProgress returns the higher of the fitness and health paths,
// clamped to 0..1. Either path can complete the badge.
func badgeProgress(fitness, fitnessGoal, health, healthGoal int) float64 {
	f := 0.0
	if fitnessGoal > 0 {
		f = float64(fitness) / float64(fitnessGoal)
	}
	h := 0.0
	if healthGoal > 0 {
		h = float64(health) / float64(healthGoal)
	}
	return progressOf(maxFloat(f, h))
}

// badgeProgress3 is the three-path variant (e.g. Gym Rat).
func badgeProgress3(a, aGoal, b, bGoal, c, cGoal int) float64 {
	pa := 0.0
	if aGoal > 0 {
		pa = float64(a) / float64(aGoal)
	}
	pb := 0.0
	if bGoal > 0 {
		pb = float64(b) / float64(bGoal)
	}
	pc := 0.0
	if cGoal > 0 {
		pc = float64(c) / float64(cGoal)
	}
	return progressOf(maxFloat(maxFloat(pa, pb), pc))
}

// progressOf clamps a progress value into the 0..1 range.
func progressOf(p float64) float64 {
	if p < 0 {
		return 0
	}
	if p > 1 {
		return 1
	}
	return p
}

// minInt returns the smaller of two ints (never negative).
func minInt(a, b int) string {
	if a > b {
		a = b
	}
	if a < 0 {
		a = 0
	}
	return strconv.Itoa(a)
}

// maxFloat returns the larger of two floats.
func maxFloat(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}
