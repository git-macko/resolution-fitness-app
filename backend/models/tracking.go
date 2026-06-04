package models

// ── Weight Log ───────────────────────────────────────────────────────
// WeightLog is a single weight measurement entry.
type WeightLog struct {
	ID                string  `json:"id"`
	UserID            string  `json:"userId"`
	Date              string  `json:"date"`
	WeightKg          float64 `json:"weightKg"`
	BodyFatPercentage float64 `json:"bodyFatPercentage,omitempty"`
	Notes             string  `json:"notes,omitempty"`
	CreatedAt         string  `json:"createdAt"`
}

// LogWeightRequest is the JSON body for POST /api/weight.
type LogWeightRequest struct {
	Date              string  `json:"date,omitempty"`
	WeightKg          float64 `json:"weightKg"`
	BodyFatPercentage float64 `json:"bodyFatPercentage,omitempty"`
	Notes             string  `json:"notes,omitempty"`
}

// ── Body Measurement ─────────────────────────────────────────────────
// BodyMeasurement records physical measurements at a point in time.
type BodyMeasurement struct {
	ID        string  `json:"id"`
	UserID    string  `json:"userId"`
	Date      string  `json:"date"`
	ChestCm   float64 `json:"chestCm,omitempty"`
	WaistCm   float64 `json:"waistCm,omitempty"`
	ArmsCm    float64 `json:"armsCm,omitempty"`
	ThighsCm  float64 `json:"thighsCm,omitempty"`
	HipsCm    float64 `json:"hipsCm,omitempty"`
	CreatedAt string  `json:"createdAt"`
}

// LogMeasurementsRequest is the JSON body for POST /api/measurements.
type LogMeasurementsRequest struct {
	Date     string  `json:"date,omitempty"`
	ChestCm  float64 `json:"chestCm,omitempty"`
	WaistCm  float64 `json:"waistCm,omitempty"`
	ArmsCm   float64 `json:"armsCm,omitempty"`
	ThighsCm float64 `json:"thighsCm,omitempty"`
	HipsCm   float64 `json:"hipsCm,omitempty"`
}

// ── Sleep Log ────────────────────────────────────────────────────────
// SleepLog tracks a single night's sleep.
type SleepLog struct {
	ID            string  `json:"id"`
	UserID        string  `json:"userId"`
	Date          string  `json:"date"`
	Bedtime       string  `json:"bedtime"`
	WakeTime      string  `json:"wakeTime"`
	DurationHours float64 `json:"durationHours"`
	Quality       int     `json:"quality"`
	CreatedAt     string  `json:"createdAt"`
}

// LogSleepRequest is the JSON body for POST /api/sleep.
type LogSleepRequest struct {
	Date     string `json:"date,omitempty"`
	Bedtime  string `json:"bedtime"`
	WakeTime string `json:"wakeTime"`
	Quality  int    `json:"quality"`
}

// ── Weight Trend ─────────────────────────────────────────────────────
// WeightTrendPoint is a single data point for the weight chart.
type WeightTrendPoint struct {
	Date     string  `json:"date"`
	WeightKg float64 `json:"weightKg"`
}
