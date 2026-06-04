// Package utils — validation helpers for user input.
// All validation functions return descriptive error strings.
// These are called by handlers before processing requests.
package utils

import (
	"regexp"
	"strings"
)

// emailRegex is a simple but practical email validation pattern.
var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

// ValidateEmail checks if the given email is valid.
// Returns an error message string, or empty string if valid.
func ValidateEmail(email string) string {
	if strings.TrimSpace(email) == "" {
		return "Email is required"
	}
	if !emailRegex.MatchString(email) {
		return "Please enter a valid email address"
	}
	if len(email) > 255 {
		return "Email is too long (max 255 characters)"
	}
	return ""
}

// ValidatePassword checks if the password meets minimum requirements.
// Requires at least 6 characters. Returns error message or empty string.
func ValidatePassword(password string) string {
	if len(password) < 6 {
		return "Password must be at least 6 characters"
	}
	if len(password) > 128 {
		return "Password is too long (max 128 characters)"
	}
	return ""
}

// ValidateDisplayName checks if the display name is valid.
func ValidateDisplayName(name string) string {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return "Display name is required"
	}
	if len(trimmed) > 100 {
		return "Display name is too long (max 100 characters)"
	}
	return ""
}

// ValidateAge checks if an age value is reasonable.
func ValidateAge(age int) string {
	if age < 0 || age > 150 {
		return "Age must be between 0 and 150"
	}
	return ""
}

// ValidateGender checks if the gender value is one of the accepted values.
func ValidateGender(gender string) string {
	if gender == "" {
		return "" // Empty is allowed (not answered)
	}
	valid := map[string]bool{"male": true, "female": true, "other": true}
	if !valid[gender] {
		return "Gender must be male, female, or other"
	}
	return ""
}

// ValidateFitnessLevel checks if the fitness level is valid.
func ValidateFitnessLevel(level string) string {
	if level == "" {
		return "" // Empty is allowed
	}
	valid := map[string]bool{
		"beginner": true, "intermediate": true, "advanced": true,
	}
	if !valid[level] {
		return "Fitness level must be beginner, intermediate, or advanced"
	}
	return ""
}

// ValidatePrimaryGoal checks if the primary goal is valid.
func ValidatePrimaryGoal(goal string) string {
	if goal == "" {
		return ""
	}
	valid := map[string]bool{
		"weight_loss": true, "muscle_gain": true, "maintenance": true,
		"endurance": true, "general": true,
	}
	if !valid[goal] {
		return "Primary goal must be weight_loss, muscle_gain, maintenance, endurance, or general"
	}
	return ""
}

// ValidateMealType checks if the meal type is valid.
func ValidateMealType(mealType string) string {
	valid := map[string]bool{
		"preworkout": true, "postworkout": true, "general": true,
	}
	if !valid[mealType] {
		return "Meal type must be preworkout, postworkout, or general"
	}
	return ""
}

// ValidateDayOfWeek checks if the day_of_week is between 0 and 6.
func ValidateDayOfWeek(day int) string {
	if day < 0 || day > 6 {
		return "Day of week must be between 0 (Sunday) and 6 (Saturday)"
	}
	return ""
}

// ValidateSleepQuality checks if the sleep quality is between 1 and 5.
func ValidateSleepQuality(quality int) string {
	if quality < 1 || quality > 5 {
		return "Sleep quality must be between 1 and 5"
	}
	return ""
}

// SanitizeString trims whitespace and limits length to prevent abuse.
func SanitizeString(s string, maxLen int) string {
	s = strings.TrimSpace(s)
	if len(s) > maxLen {
		s = s[:maxLen]
	}
	return s
}
