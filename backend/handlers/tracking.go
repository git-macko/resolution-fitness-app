// Package handlers — body tracking endpoints.
// Weight logs, body measurements, and sleep tracking.
package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"resolution-fitnessapp-backend/database"
	"resolution-fitnessapp-backend/models"
	"resolution-fitnessapp-backend/utils"

	"github.com/google/uuid"
)

// ── Weight Tracking ─────────────────────────────────────────────────

// GetWeightLogs handles GET /api/weight.
// Lists weight entries with optional date range. Query: ?days=30 or ?from=2025-01-01&to=2025-04-07
func GetWeightLogs(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	// Determine date range
	daysStr := r.URL.Query().Get("days")
	fromDate := r.URL.Query().Get("from")
	toDate := r.URL.Query().Get("to")

	var query string
	var args []interface{}
	args = append(args, userID)

	if fromDate != "" && toDate != "" {
		query = `SELECT id, user_id, date, weight_kg, COALESCE(body_fat_percentage, 0),
		         COALESCE(notes, ''), created_at FROM weight_logs
		         WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date ASC`
		args = append(args, fromDate, toDate)
	} else if daysStr != "" {
		days, _ := strconv.Atoi(daysStr)
		if days <= 0 { days = 30 }
		query = `SELECT id, user_id, date, weight_kg, COALESCE(body_fat_percentage, 0),
		         COALESCE(notes, ''), created_at FROM weight_logs
		         WHERE user_id = ? AND date >= date('now', '-` + strconv.Itoa(days) + ` days') ORDER BY date ASC`
	} else {
		query = `SELECT id, user_id, date, weight_kg, COALESCE(body_fat_percentage, 0),
		         COALESCE(notes, ''), created_at FROM weight_logs
		         WHERE user_id = ? ORDER BY date DESC LIMIT 90`
	}

	rows, err := database.DB.Query(query, args...)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to fetch weight logs")
		return
	}
	defer rows.Close()

	var logs []models.WeightLog
	for rows.Next() {
		var wl models.WeightLog
		rows.Scan(&wl.ID, &wl.UserID, &wl.Date, &wl.WeightKg,
			&wl.BodyFatPercentage, &wl.Notes, &wl.CreatedAt)
		logs = append(logs, wl)
	}

	if logs == nil {
		logs = []models.WeightLog{}
	}

	utils.WriteSuccess(w, logs, "Weight logs retrieved")
}

// LogWeight handles POST /api/weight.
// Logs a new weight entry for the authenticated user.
func LogWeight(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	var req models.LogWeightRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.WeightKg <= 0 || req.WeightKg > 500 {
		utils.WriteError(w, http.StatusBadRequest, "Weight must be between 1 and 500 kg")
		return
	}

	date := req.Date
	if date == "" {
		date = utils.TodayString()
	}

	// Upsert — use INSERT OR REPLACE for the UNIQUE(user_id, date) constraint
	id := uuid.New().String()
	_, err := database.DB.Exec(`
		INSERT INTO weight_logs (id, user_id, date, weight_kg, body_fat_percentage, notes, created_at)
		VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
		ON CONFLICT(user_id, date) DO UPDATE SET
			weight_kg = excluded.weight_kg,
			body_fat_percentage = excluded.body_fat_percentage,
			notes = excluded.notes
	`, id, userID, date, req.WeightKg, req.BodyFatPercentage, req.Notes)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to log weight")
		return
	}

	weightLog := models.WeightLog{
		ID: id, UserID: userID, Date: date,
		WeightKg: req.WeightKg, BodyFatPercentage: req.BodyFatPercentage,
		Notes: req.Notes,
	}

	utils.WriteCreated(w, weightLog, "Weight logged")
}

// DeleteWeightLog handles DELETE /api/weight/{logId}.
func DeleteWeightLog(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	logID := r.PathValue("logId")

	var ownerID string
	err := database.DB.QueryRow("SELECT user_id FROM weight_logs WHERE id = ?", logID).Scan(&ownerID)
	if err != nil || ownerID != userID {
		utils.WriteError(w, http.StatusNotFound, "Weight log not found")
		return
	}

	database.DB.Exec("DELETE FROM weight_logs WHERE id = ?", logID)
	utils.WriteSuccess(w, nil, "Weight log deleted")
}

// ── Body Measurements ────────────────────────────────────────────────

// GetMeasurements handles GET /api/measurements.
func GetMeasurements(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	rows, err := database.DB.Query(`
		SELECT id, user_id, date, COALESCE(chest_cm, 0), COALESCE(waist_cm, 0),
		       COALESCE(arms_cm, 0), COALESCE(thighs_cm, 0), COALESCE(hips_cm, 0), created_at
		FROM body_measurements WHERE user_id = ? ORDER BY date DESC LIMIT 30
	`, userID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to fetch measurements")
		return
	}
	defer rows.Close()

	var measurements []models.BodyMeasurement
	for rows.Next() {
		var m models.BodyMeasurement
		rows.Scan(&m.ID, &m.UserID, &m.Date, &m.ChestCm, &m.WaistCm,
			&m.ArmsCm, &m.ThighsCm, &m.HipsCm, &m.CreatedAt)
		measurements = append(measurements, m)
	}

	if measurements == nil {
		measurements = []models.BodyMeasurement{}
	}

	utils.WriteSuccess(w, measurements, "Measurements retrieved")
}

// LogMeasurements handles POST /api/measurements.
func LogMeasurements(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	var req models.LogMeasurementsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	date := req.Date
	if date == "" {
		date = utils.TodayString()
	}

	id := uuid.New().String()
	_, err := database.DB.Exec(`
		INSERT INTO body_measurements (id, user_id, date, chest_cm, waist_cm, arms_cm, thighs_cm, hips_cm, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
	`, id, userID, date, req.ChestCm, req.WaistCm, req.ArmsCm, req.ThighsCm, req.HipsCm)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to log measurements")
		return
	}

	measurement := models.BodyMeasurement{
		ID: id, UserID: userID, Date: date,
		ChestCm: req.ChestCm, WaistCm: req.WaistCm,
		ArmsCm: req.ArmsCm, ThighsCm: req.ThighsCm, HipsCm: req.HipsCm,
	}

	utils.WriteCreated(w, measurement, "Measurements logged")
}

// ── Sleep Tracking ───────────────────────────────────────────────────

// GetSleepLogs handles GET /api/sleep.
func GetSleepLogs(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	rows, err := database.DB.Query(`
		SELECT id, user_id, date, bedtime, wake_time,
		       COALESCE(duration_hours, 0), COALESCE(quality, 3), created_at
		FROM sleep_logs WHERE user_id = ? ORDER BY date DESC LIMIT 30
	`, userID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to fetch sleep logs")
		return
	}
	defer rows.Close()

	var logs []models.SleepLog
	for rows.Next() {
		var sl models.SleepLog
		rows.Scan(&sl.ID, &sl.UserID, &sl.Date, &sl.Bedtime, &sl.WakeTime,
			&sl.DurationHours, &sl.Quality, &sl.CreatedAt)
		logs = append(logs, sl)
	}

	if logs == nil {
		logs = []models.SleepLog{}
	}

	utils.WriteSuccess(w, logs, "Sleep logs retrieved")
}

// LogSleep handles POST /api/sleep.
func LogSleep(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	var req models.LogSleepRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Bedtime == "" || req.WakeTime == "" {
		utils.WriteError(w, http.StatusBadRequest, "Bedtime and wake time are required")
		return
	}

	if errMsg := utils.ValidateSleepQuality(req.Quality); errMsg != "" {
		utils.WriteError(w, http.StatusBadRequest, errMsg)
		return
	}

	date := req.Date
	if date == "" {
		date = utils.TodayString()
	}

	id := uuid.New().String()
	_, err := database.DB.Exec(`
		INSERT INTO sleep_logs (id, user_id, date, bedtime, wake_time, quality, created_at)
		VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
	`, id, userID, date, req.Bedtime, req.WakeTime, req.Quality)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to log sleep")
		return
	}

	sleepLog := models.SleepLog{
		ID: id, UserID: userID, Date: date,
		Bedtime: req.Bedtime, WakeTime: req.WakeTime, Quality: req.Quality,
	}

	utils.WriteCreated(w, sleepLog, "Sleep logged")
}
