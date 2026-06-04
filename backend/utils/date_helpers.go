// Package utils — date/time helper functions.
// These handle week calculations, streak determination, and date formatting.
package utils

import (
	"time"
)

// StartOfWeek returns the Monday (00:00:00) of the week containing the given date.
// Weeks start on Monday (ISO 8601).
func StartOfWeek(t time.Time) time.Time {
	weekday := t.Weekday()
	if weekday == time.Sunday {
		// Treat Sunday as part of the previous week (our weeks go Mon-Sun)
		return t.AddDate(0, 0, -6).Truncate(24 * time.Hour)
	}
	daysFromMonday := int(weekday) - int(time.Monday)
	return t.AddDate(0, 0, -daysFromMonday).Truncate(24 * time.Hour)
}

// EndOfWeek returns the Sunday (23:59:59) of the week containing the given date.
func EndOfWeek(t time.Time) time.Time {
	return StartOfWeek(t).AddDate(0, 0, 6).Add(23*time.Hour + 59*time.Minute + 59*time.Second)
}

// StartOfDay returns the given date at 00:00:00.
func StartOfDay(t time.Time) time.Time {
	return t.Truncate(24 * time.Hour)
}

// TodayString returns today's date as "YYYY-MM-DD".
func TodayString() string {
	return time.Now().Format("2006-01-02")
}

// WeekStartString returns the Monday of the current week as "YYYY-MM-DD".
func WeekStartString() string {
	return StartOfWeek(time.Now()).Format("2006-01-02")
}

// WeekEndString returns the Sunday of the current week as "YYYY-MM-DD".
func WeekEndString() string {
	return EndOfWeek(time.Now()).Format("2006-01-02")
}

// DaysSince returns the number of days between two dates (ignoring time of day).
func DaysSince(t time.Time) int {
	now := StartOfDay(time.Now())
	tDay := StartOfDay(t)
	return int(now.Sub(tDay).Hours() / 24)
}

// CalculateStreak determines the current consecutive workout streak.
// workoutDates should be a set of dates (as "YYYY-MM-DD" strings) when workouts were completed.
// It counts backward from today, requiring a workout on each consecutive day.
func CalculateStreak(workoutDates map[string]bool) int {
	streak := 0
	today := time.Now()

	for i := 0; ; i++ {
		date := today.AddDate(0, 0, -i).Format("2006-01-02")
		if workoutDates[date] {
			streak++
		} else {
			break
		}
	}
	return streak
}

// GetLast7Days returns an array of 7 dates (YYYY-MM-DD) from 6 days ago to today.
func GetLast7Days() []string {
	dates := make([]string, 7)
	today := time.Now()
	for i := 0; i < 7; i++ {
		dates[6-i] = today.AddDate(0, 0, -i).Format("2006-01-02")
	}
	return dates
}

// ParseDate safely parses a "YYYY-MM-DD" string into a time.Time.
// Returns the zero time and false if the format is invalid.
func ParseDate(s string) (time.Time, bool) {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return time.Time{}, false
	}
	return t, true
}

// ISOWeekString returns the ISO 8601 week string (e.g., "2025-W15").
func ISOWeekString(t time.Time) string {
	year, week := t.ISOWeek()
	return time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC).Format("2006") + "-W" + formatWeekNum(week)
}

func formatWeekNum(week int) string {
	if week < 10 {
		return "0" + string(rune('0'+week))
	}
	return string(rune('0'+week/10)) + string(rune('0'+week%10))
}

// TimeBasedGreeting returns "Good morning", "Good afternoon", or "Good evening"
// based on the current hour of the day.
func TimeBasedGreeting() string {
	hour := time.Now().Hour()
	switch {
	case hour < 12:
		return "Good morning"
	case hour < 17:
		return "Good afternoon"
	default:
		return "Good evening"
	}
}
