package models

// ── Progression Badges ─────────────────────────────────────────────
// Badge represents a progression achievement earned through activity in
// the Fitness tab (workouts, streaks) and the Health tab (meals logged,
// days tracked). Badges are computed live from the user's stats on each
// request — nothing is persisted.
type Badge struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Emoji       string  `json:"emoji"`
	Description string  `json:"description"`
	Category    string  `json:"category"` // "fitness" | "health" | "mixed"
	Earned      bool    `json:"earned"`
	Progress    float64 `json:"progress"` // 0.0 – 1.0 toward earning the badge
	ProgressText string `json:"progressText"`
}
