// Package handlers — gym preference and crowd estimation endpoints.
package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"resolution-fitnessapp-backend/database"
	"resolution-fitnessapp-backend/models"
	"resolution-fitnessapp-backend/utils"

	"github.com/google/uuid"
)

// bestTimeClient is reused for all BestTime API calls. A short timeout keeps
// the dashboard responsive even when the upstream service is slow.
var bestTimeClient = &http.Client{
	Timeout: 3 * time.Second,
}

// googlePlacesAPIKey holds the configured Google Places API key.
// It is set once at startup via InitGooglePlacesKey.
var googlePlacesAPIKey string

// InitGooglePlacesKey sets the global Google Places API key.
func InitGooglePlacesKey(key string) {
	googlePlacesAPIKey = key
}

// overpassAPIURL holds the configured Overpass API endpoint.
var overpassAPIURL = "https://overpass-api.de/api/interpreter"

// InitOverpassAPIURL sets the global Overpass API URL.
func InitOverpassAPIURL(url string) {
	if url != "" {
		overpassAPIURL = url
	}
}

// googlePlacesClient is reused for all Google Places API calls.
var googlePlacesClient = &http.Client{
	Timeout: 4 * time.Second,
}

// hoursUnknownText is used when opening hours data is missing or malformed.
const hoursUnknownText = "Hours unknown"

// gymAutoRefreshCooldown is the minimum time between background attempts to
// re-fetch a gym's opening hours. Short enough that the user sees fresh data
// after a transient Google/Overpass failure, long enough that we don't drain
// upstream API quotas on every dashboard focus.
const gymAutoRefreshCooldown = 5 * time.Minute

// inFlightRefresh tracks userIDs currently mid-background-refresh so concurrent
// dashboard fetches don't all hit Google/Overpass for the same user.
// Used as a sentinel registry (LoadOrStore); delete the key when the goroutine
// finishes so a later attempt can run after the cooldown.
var inFlightRefresh sync.Map

// GetUserGym handles GET /api/profile/gym.
// Returns the user's configured gym preference.
func GetUserGym(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	if userID == "" {
		utils.WriteError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	gym, err := fetchUserGym(userID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to load gym preference")
		return
	}

	utils.WriteSuccess(w, gym, "Gym preference loaded")
}

// UpdateUserGym handles PUT /api/profile/gym.
// Updates the user's gym preference.
func UpdateUserGym(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	if userID == "" {
		utils.WriteError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	var req models.UpdateUserGymRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.Type = strings.ToLower(strings.TrimSpace(req.Type))
	if req.Type != "home" {
		req.Type = "commercial"
	}
	if req.Capacity <= 0 {
		req.Capacity = 150
	}

	_, err := database.DB.Exec(`
		UPDATE user_settings SET
			gym_type = ?, gym_name = ?, gym_address = ?, gym_place_id = ?, gym_phone = ?, gym_website = ?, gym_lat = ?, gym_lng = ?, gym_capacity = ?, gym_opening_hours = ?, updated_at = datetime('now')
		WHERE user_id = ?
	`, req.Type, strings.TrimSpace(req.Name), strings.TrimSpace(req.Address), strings.TrimSpace(req.PlaceID), strings.TrimSpace(req.Phone), strings.TrimSpace(req.Website), req.Lat, req.Lng, req.Capacity, req.OpeningHours, userID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to update gym preference")
		return
	}

	gym, _ := fetchUserGym(userID)
	utils.WriteSuccess(w, gym, "Gym preference updated")
}

// GetGymCrowd handles GET /api/gym-crowd.
// Returns a crowd estimate for the user's configured gym. Uses BestTime when
// available; otherwise falls back to a time-of-day simulation.
func GetGymCrowd(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	if userID == "" {
		utils.WriteError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	info, err := fetchGymCrowd(userID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to estimate crowd")
		return
	}

	utils.WriteSuccess(w, info, "Crowd estimate loaded")
}

// ReportGymCrowd handles POST /api/gym-crowd/report.
// Stores a user-reported crowd level for the user's configured gym and returns
// an updated crowd estimate that includes the fresh report.
//
// Intentionally accepts commercial gyms with empty `gym_opening_hours` so a
// user who picks a gym and immediately tries to report crowd (before the
// background enrichment completes) gets their reading surfaced on the card.
// Restricting this to populated-hours gyms would hide the user's most
// relevant signal during the first few minutes after gym selection.
func ReportGymCrowd(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	if userID == "" {
		utils.WriteError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	gym, err := fetchUserGym(userID)
	if err != nil || gym == nil || gym.Type != "commercial" {
		utils.WriteError(w, http.StatusBadRequest, "Configure a commercial gym before reporting crowd levels")
		return
	}

	var req models.GymCrowdReportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.Level < 1 || req.Level > 5 {
		utils.WriteError(w, http.StatusBadRequest, "Crowd level must be between 1 and 5")
		return
	}

	// Overwrite any report from this user for the same gym in the last hour
	// so a single user cannot skew the average with many rapid taps.
	placeID := strings.TrimSpace(gym.PlaceID)
	name := strings.TrimSpace(gym.Name)
	address := strings.TrimSpace(gym.Address)

	tx, err := database.DB.Begin()
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to start transaction")
		return
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`
		DELETE FROM gym_crowd_reports
		WHERE user_id = ?
		  AND created_at > datetime('now', '-1 hour')
		  AND ((? != '' AND gym_place_id = ?) OR (gym_name = ? AND gym_address = ?))
	`, userID, placeID, placeID, name, address); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to clear previous report")
		return
	}

	reportID := uuid.New().String()
	if _, err := tx.Exec(`
		INSERT INTO gym_crowd_reports (id, user_id, gym_name, gym_address, gym_place_id, gym_lat, gym_lng, level, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
	`, reportID, userID, name, address, placeID, gym.Lat, gym.Lng, req.Level); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to save report")
		return
	}

	if err := tx.Commit(); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to commit report")
		return
	}

	info, err := fetchGymCrowd(userID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to refresh crowd estimate")
		return
	}

	utils.WriteSuccess(w, info, "Crowd report saved")
}

// fetchUserGym loads the user's gym preference from the database.
//
// Self-heals when the user_settings row is missing — historically the
// Register handler swallowed errors on the initial settings INSERT, so a
// user could end up with a `users` row but no `user_settings` row. Without
// this guard, dashboard calls would return nil for the gym crowd (since
// fetchUserGym returned an error), and UpdateUserGym's UPDATE would
// silently affect 0 rows, so the user could never persist a gym.
//
// Mirrors the lazy-seed pattern already used by fetchSettingsByUserID.
func fetchUserGym(userID string) (*models.UserGym, error) {
	var gym models.UserGym
	query := `
		SELECT COALESCE(gym_type, ''), COALESCE(gym_name, ''), COALESCE(gym_address, ''), COALESCE(gym_place_id, ''), COALESCE(gym_phone, ''), COALESCE(gym_website, ''), COALESCE(gym_lat, 0), COALESCE(gym_lng, 0), COALESCE(gym_capacity, 150), COALESCE(gym_opening_hours, ''), COALESCE(gym_hours_refresh_at, '')
		FROM user_settings WHERE user_id = ?
	`
	err := database.DB.QueryRow(query, userID).Scan(&gym.Type, &gym.Name, &gym.Address, &gym.PlaceID, &gym.Phone, &gym.Website, &gym.Lat, &gym.Lng, &gym.Capacity, &gym.OpeningHours, &gym.HoursRefreshAt)
	if errors.Is(err, sql.ErrNoRows) {
		// Lazy-seed: a user without a user_settings row gets one. We use
		// INSERT OR IGNORE so concurrent fetches don't race to create a
		// duplicate. The next scan picks up the freshly-created row with
		// the column defaults (gym_type='', capacity=150, etc.) which is
		// exactly what fetchGymCrowd expects for an "unconfigured" state.
		if _, seedErr := database.DB.Exec(
			`INSERT OR IGNORE INTO user_settings (user_id, created_at, updated_at) VALUES (?, datetime('now'), datetime('now'))`,
			userID,
		); seedErr != nil {
			log.Printf("[gym] self-heal: failed to seed user_settings row for user %s: %v", userID, seedErr)
			return nil, seedErr
		}
		log.Printf("[gym] self-heal: lazy-seeded user_settings row for user %s", userID)
		err = database.DB.QueryRow(query, userID).Scan(&gym.Type, &gym.Name, &gym.Address, &gym.PlaceID, &gym.Phone, &gym.Website, &gym.Lat, &gym.Lng, &gym.Capacity, &gym.OpeningHours, &gym.HoursRefreshAt)
	}
	if err != nil {
		log.Printf("[gym] fetchUserGym failed for user %s: %v", userID, err)
		return nil, err
	}
	return &gym, nil
}

// maybeScheduleBackgroundHoursRefresh kicks off a fire-and-forget goroutine
// that re-fetches opening hours from Google (placeId) or Overpass (lat/lng)
// when the user has an empty openingHours record. The dashboard response is
// not blocked on this — a follow-up GET /api/dashboard will pick up the
// result once the upstream call returns and persists.
//
// Guards:
//   - Only fires for commercial gyms.
//   - Only fires when a placeId or both lat+lng are present (we need at
//     least one to query the upstream).
//   - Per-user in-flight registry prevents duplicate concurrent fetches.
//   - DB-side cooldown (gym_hours_refresh_at) prevents hammering on every
//     dashboard focus.
func maybeScheduleBackgroundHoursRefresh(userID string, gym *models.UserGym) {
	if gym == nil || gym.Type != "commercial" {
		return
	}
	hasPlaceID := strings.TrimSpace(gym.PlaceID) != ""
	hasLatLng := gym.Lat != 0 || gym.Lng != 0
	if !hasPlaceID && !hasLatLng {
		return
	}
	if !isEligibleForRefresh(userID) {
		return
	}
	// LoadOrStore returns (_, false) only if the key was newly stored. If a
	// dashboard load is already mid-refresh for this user, skip.
	if _, loaded := inFlightRefresh.LoadOrStore(userID, struct{}{}); loaded {
		return
	}
	go func() {
		defer inFlightRefresh.Delete(userID)
		backgroundEnrichHours(userID)
	}()
}

// isEligibleForRefresh returns true when the user has never had a background
// refresh or the last one was older than gymAutoRefreshCooldown.
// On a DB read error we return false: a sick DB should not be piled on by
// more enrichment attempts, otherwise a single transient write failure would
// defeat the cooldown entirely.
func isEligibleForRefresh(userID string) bool {
	var last string
	err := database.DB.QueryRow(
		`SELECT COALESCE(gym_hours_refresh_at, '') FROM user_settings WHERE user_id = ?`,
		userID,
	).Scan(&last)
	if err != nil {
		log.Printf("[gym] eligibility check failed for user %s: %v", userID, err)
		return false
	}
	if last == "" {
		return true
	}
	t, parseErr := time.Parse("2006-01-02 15:04:05", last)
	if parseErr != nil {
		// Unparseable timestamp — assume stale and retry.
		return true
	}
	return time.Since(t) > gymAutoRefreshCooldown
}

// backgroundEnrichHours reads the gym row, calls the most appropriate upstream
// details endpoint, and surgically persists ONLY the opening_hours +
// hours_refresh_at columns if hours were returned. The user's name/address/
// placeId/lat/lng/phone/website are never overwritten here — those are
// user-editable and a stale background refresh must not clobber an unsaved
// manual edit.
func backgroundEnrichHours(userID string) {
	gym, err := fetchUserGym(userID)
	if err != nil {
		log.Printf("[gym] background refresh: failed to load settings for user %s: %v", userID, err)
		// Still mark the attempt time so we don't loop forever.
		_, _ = database.DB.Exec(
			`UPDATE user_settings SET gym_hours_refresh_at = datetime('now') WHERE user_id = ?`,
			userID,
		)
		return
	}

	// Atomic write ordering: do the conditional UPDATE first, then bump the
	// cooldown stamp only on success.
	//   - If we stamped BEFORE the conditional UPDATE, the stamp would destroy
	//     the snapshot's `gym_hours_refresh_at` and the WHERE clause would
	//     always match the post-stamp DB state — making a concurrent
	//     `UpdateUserGym` clear (which doesn't bump refresh_at) indistinguishable
	//     from "happy path" and silently undoing the user's clear.
	//   - If we stamp AFTER the conditional UPDATE and the conditional failed
	//     (concurrent edit), the cooldown stays untouched and the next
	//     eligible retry still happens — exactly what we want.
	// See TestBackgroundEnrich_PersistsHoursWhenUpstreamSucceeds for the
	// happy-path coverage and the conditional WHERE clause for the detection.

	var (
		info        *models.GymSearchResult
		fetchErr    error
		placeID     = strings.TrimSpace(gym.PlaceID)
		tryOverpass = placeID == "" && (gym.Lat != 0 || gym.Lng != 0)
	)
	if placeID != "" {
		info, fetchErr = fetchGooglePlaceDetails(placeID)
	} else if tryOverpass {
		info, fetchErr = fetchOverpassGymDetails(gym.Lat, gym.Lng)
	}
	if fetchErr != nil {
		log.Printf("[gym] background refresh failed for user %s place=%q: %v", userID, placeID, fetchErr)
		return
	}
	if info == nil || strings.TrimSpace(info.OpeningHours) == "" {
		// Upstream succeeded but no opening hours were attached. Quietly
		// leave the stored value empty; the user can still fill it in
		// manually. We don't overwrite to avoid wiping legacy hours.
		return
	}

	// Only persist when the new value differs from the existing one. We use
	// a single conditional UPDATE that matches the snapshot's openingHours
	// AND refresh_at, and atomically writes BOTH `gym_opening_hours` and
	// the `gym_hours_refresh_at` cooldown stamp on success.
	//
	// Why we match BOTH columns: UpdateUserGym (the user-initiated PUT)
	// doesn't bump `gym_hours_refresh_at`, so a clear-or-edit-then-goroutine
	// race correctly fails the WHERE match (rowsAffected == 0) and the
	// goroutine does not clobber the user's most recent intent.
	//
	// Why we combine the conditional UPDATE and the stamp into ONE
	// statement: between a conditional UPDATE that succeeds and a separate
	// stamp UPDATE, a concurrent dashboard fetch could briefly observe
	// "hours=new, refresh_at=old" and dispatch a redundant goroutine. The
	// in-flight registry suppresses that goroutine today, but combining both
	// writes into a single SQL statement eliminates that window entirely.
	//
	// The background enrichment is intentionally surgical: it does not touch
	// `updated_at`, so a user auditing that column can still tell manual
	// edits apart from a silent auto-refresh.
	if info.OpeningHours == gym.OpeningHours {
		// No-op: upstream matches our snapshot. Still stamp the cooldown so
		// the next dashboard load doesn't immediately re-attempt.
		_, _ = database.DB.Exec(
			`UPDATE user_settings SET gym_hours_refresh_at = datetime('now') WHERE user_id = ?`,
			userID,
		)
		return
	}
	res, err := database.DB.Exec(
		`UPDATE user_settings
		 SET gym_opening_hours = ?, gym_hours_refresh_at = datetime('now')
		 WHERE user_id = ? AND gym_opening_hours = ? AND gym_hours_refresh_at = ?`,
		info.OpeningHours, userID, gym.OpeningHours, gym.HoursRefreshAt,
	)
	if err != nil {
		log.Printf("[gym] background refresh: failed to persist hours for user %s: %v", userID, err)
		return
	}
	if rows, _ := res.RowsAffected(); rows == 0 {
		log.Printf("[gym] background refresh: concurrent edit detected for user %s, skipping", userID)
		return
	}
	log.Printf("[gym] background refresh: persisted opening hours for user %s", userID)
}

// RefreshGymHours handles POST /api/profile/gym/refresh-hours.
// Synchronously re-fetches details from Google/Overpass and persists any new
// opening hours so the user doesn't need to re-select their gym just to
// recover from a failed initial details call. The current crowd estimate is
// then returned so the dashboard re-renders immediately.
//
// Intentionally uses an UNCONDITIONAL UPDATE (no snapshot match) because the
// user explicitly invoked this endpoint — we should always honour their
// intent even if a background auto-refresh is mid-flight. This is the
// deliberate inverse of the conditional UPDATE in backgroundEnrichHours,
// which defends against implicit clobbering.
func RefreshGymHours(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	if userID == "" {
		utils.WriteError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	gym, err := fetchUserGym(userID)
	if err != nil || gym == nil || gym.Type != "commercial" {
		utils.WriteError(w, http.StatusBadRequest, "Configure a commercial gym before refreshing hours")
		return
	}

	placeID := strings.TrimSpace(gym.PlaceID)
	hasLatLng := gym.Lat != 0 || gym.Lng != 0
	if placeID == "" && !hasLatLng {
		utils.WriteError(w, http.StatusBadRequest, "Cannot refresh hours without a placeId or coordinates")
		return
	}

	// Clear the cooldown so any auto-enrichment loop that fires right after
	// this user-initiated refresh still has a fresh window to retry.
	_, _ = database.DB.Exec(
		`UPDATE user_settings SET gym_hours_refresh_at = datetime('now') WHERE user_id = ?`,
		userID,
	)

	var info *models.GymSearchResult
	var fetchErr error
	if placeID != "" {
		info, fetchErr = fetchGooglePlaceDetails(placeID)
	} else {
		info, fetchErr = fetchOverpassGymDetails(gym.Lat, gym.Lng)
	}

	if fetchErr != nil {
		log.Printf("[gym] manual refresh failed for user %s place=%q: %v", userID, placeID, fetchErr)
		utils.WriteSuccess(w, fetchGymCrowdOrUnknown(userID, gym), "Hours still unavailable")
		return
	}
	refreshed := false
	upToDate := false
	if info != nil && strings.TrimSpace(info.OpeningHours) != "" {
		if info.OpeningHours == gym.OpeningHours {
			upToDate = true
		} else {
			if _, err := database.DB.Exec(
				`UPDATE user_settings SET gym_opening_hours = ? WHERE user_id = ?`,
				info.OpeningHours, userID,
			); err == nil {
				gym.OpeningHours = info.OpeningHours
				refreshed = true
			}
		}
	}

	// Return the freshly recomputed crowd estimate so the dashboard can
	// re-render without an extra round-trip.
	var msg string
	switch {
	case refreshed:
		msg = "Hours refreshed"
	case upToDate:
		msg = "Hours are up to date"
	default:
		msg = "Hours still unavailable"
	}
	info2, fcErr := fetchGymCrowd(userID)
	if fcErr != nil || info2 == nil {
		utils.WriteSuccess(w, gym, msg)
		return
	}
	utils.WriteSuccess(w, info2, msg)
}

// fetchGymCrowdOrUnknown is a small helper used by RefreshGymHours when the
// upstream call failed but we still want to return something to the client.
func fetchGymCrowdOrUnknown(userID string, gym *models.UserGym) *models.GymCrowdInfo {
	if info, err := fetchGymCrowd(userID); err == nil && info != nil {
		return info
	}
	name := gym.Name
	if name == "" {
		name = "Your Gym"
	}
	return &models.GymCrowdInfo{
		Type:         "commercial",
		Name:         name,
		Address:      gym.Address,
		Label:        hoursUnknownText,
		Capacity:     gym.Capacity,
		Phone:        gym.Phone,
		Website:      gym.Website,
		Source:       "unknown_hours",
		IsOpen:       false,
		StatusText:   hoursUnknownText,
		OpeningHours: "",
	}
}

// fetchGymCrowd estimates the current crowd level for the user's gym.
// For home gyms it always returns a "just you" state. For commercial
// gyms it tries BestTime real data first, then cache, then simulation.
// Returns nil when the user has not configured a gym yet.
func fetchGymCrowd(userID string) (*models.GymCrowdInfo, error) {
	gym, err := fetchUserGym(userID)
	if err != nil {
		// No settings row yet — gym not configured.
		return nil, nil
	}

	if gym.Type == "" {
		// Gym not configured.
		return nil, nil
	}

	name := gym.Name
	if name == "" {
		name = "Your Gym"
	}

	if gym.Type == "home" {
		return &models.GymCrowdInfo{
			Type:         "home",
			Name:         name,
			Percentage:   0,
			Label:        "Just you — perfect time to train",
			Capacity:     gym.Capacity,
			Source:       "home",
			IsOpen:       true,
			OpeningHours: "",
		}, nil
	}

	// Load user/community reports early so the empty-hours branch below can
	// still surface a fresh user report instead of the generic "unknown_hours"
	// label (which would otherwise hide the user's own crowd reading).
	userReport := fetchLatestUserGymCrowdReport(userID, gym)
	community := fetchCommunityGymCrowdReport(gym, 60*time.Minute)

	// If we have no opening hours, we can't know whether the gym is open.
	// Before returning a generic "unknown_hours", kick off a fire-and-forget
	// re-fetch (when a placeId or lat/lng is known) AND honour any fresh
	// user/community report so a user who immediately submits a level after
	// picking the gym isn't ignored.
	if strings.TrimSpace(gym.OpeningHours) == "" {
		maybeScheduleBackgroundHoursRefresh(userID, gym)
		if shouldUseUserReport(userReport) {
			percent := levelToPercent(userReport.Level)
			return &models.GymCrowdInfo{
				Type:         "commercial",
				Name:         name,
				Address:      gym.Address,
				Label:        crowdLabel(percent),
				Percentage:   percent,
				Capacity:     gym.Capacity,
				Phone:        gym.Phone,
				Website:      gym.Website,
				Source:       "user_report",
				IsOpen:       false, // we genuinely don't know
				StatusText:   hoursUnknownText,
				OpeningHours: "",
				UserReport:   userReport,
				Community:    community,
			}, nil
		}
		if community != nil && community.Count > 0 {
			percent := levelToPercent(community.Level)
			return &models.GymCrowdInfo{
				Type:         "commercial",
				Name:         name,
				Address:      gym.Address,
				Label:        crowdLabel(percent),
				Percentage:   percent,
				Capacity:     gym.Capacity,
				Phone:        gym.Phone,
				Website:      gym.Website,
				Source:       "community",
				IsOpen:       false,
				StatusText:   hoursUnknownText,
				OpeningHours: "",
				UserReport:   userReport,
				Community:    community,
			}, nil
		}
		return &models.GymCrowdInfo{
			Type:         "commercial",
			Name:         name,
			Address:      gym.Address,
			Label:        hoursUnknownText,
			Capacity:     gym.Capacity,
			Phone:        gym.Phone,
			Website:      gym.Website,
			Source:       "unknown_hours",
			IsOpen:       false,
			StatusText:   hoursUnknownText,
			OpeningHours: "",
		}, nil
	}

	// Try real BestTime data first if the gym name + address are provided.
	var percentage int
	var source string
	if os.Getenv("BESTTIME_API_KEY") != "" && strings.TrimSpace(gym.Name) != "" && strings.TrimSpace(gym.Address) != "" {
		cached, err := fetchCachedBestTime(gym.Name, gym.Address)
		if err == nil {
			percentage = cached
			source = "besttime"
		} else {
			fetched, err := fetchBestTimeBusyness(gym.Name, gym.Address)
			if err == nil {
				_ = upsertBestTimeCache(gym.Name, gym.Address, fetched)
				percentage = fetched
				source = "besttime"
			}
		}
	}

	// Fall back to simulation when no real data is available.
	if source != "besttime" {
		percentage = simulateCrowdPercentage()
		source = "simulated"
	}

	// Apply user/community overrides (the userReport/community values were
	// fetched above so the empty-hours branch could also surface them).
	if shouldUseUserReport(userReport) {
		percentage = levelToPercent(userReport.Level)
		source = "user_report"
	} else if community != nil && community.Count > 0 {
		percentage = levelToPercent(community.Level)
		source = "community"
	}

	// If we have opening hours and the gym is closed, surface that instead of a fake crowd estimate.
	isOpen, statusText := evaluateOpenStatus(gym.OpeningHours)
	if !isOpen && gym.OpeningHours != "" {
		closedLabel := "Closed now"
		closedSource := "closed"
		if statusText == "Hours unknown" {
			closedLabel = "Hours unknown"
			closedSource = "unknown_hours"
		}
		return &models.GymCrowdInfo{
			Type:         "commercial",
			Name:         name,
			Address:      gym.Address,
			Label:        closedLabel,
			Capacity:     gym.Capacity,
			Phone:        gym.Phone,
			Website:      gym.Website,
			Source:       closedSource,
			IsOpen:       false,
			StatusText:   statusText,
			OpeningHours: gym.OpeningHours,
		}, nil
	}

	return &models.GymCrowdInfo{
		Type:         "commercial",
		Name:         name,
		Address:      gym.Address,
		Percentage:   percentage,
		Label:        crowdLabel(percentage),
		Capacity:     gym.Capacity,
		Phone:        gym.Phone,
		Website:      gym.Website,
		Source:       source,
		IsOpen:       isOpen,
		StatusText:   statusText,
		OpeningHours: gym.OpeningHours,
		UserReport:   userReport,
		Community:    community,
	}, nil
}

// levelToPercent converts a 1-5 crowd level to a 0-100 percentage.
// Level 1 = 0%, 2 = 25%, 3 = 50%, 4 = 75%, 5 = 100%.
func levelToPercent(level int) int {
	percent := (level - 1) * 25
	if percent < 0 {
		return 0
	}
	if percent > 100 {
		return 100
	}
	return percent
}

// shouldUseUserReport returns true when the user's report is fresh enough
// (within the last 30 minutes) to override the estimated crowd percentage.
func shouldUseUserReport(report *models.GymCrowdReportSummary) bool {
	if report == nil {
		return false
	}
	// SQLite datetime strings are stored as "YYYY-MM-DD HH:MM:SS" (UTC).
	created, err := time.Parse("2006-01-02 15:04:05", report.ReportedAt)
	if err != nil {
		return false
	}
	return time.Since(created) <= 30*time.Minute
}

// fetchLatestUserGymCrowdReport returns the current user's most recent report
// for the configured gym (within the last 24 hours), if any.
func fetchLatestUserGymCrowdReport(userID string, gym *models.UserGym) *models.GymCrowdReportSummary {
	placeID := strings.TrimSpace(gym.PlaceID)
	name := strings.TrimSpace(gym.Name)
	address := strings.TrimSpace(gym.Address)

	// Avoid matching reports for an unidentified gym.
	if placeID == "" && (name == "" || address == "") {
		return nil
	}

	var level int
	var reportedAt string
	err := database.DB.QueryRow(`
		SELECT level, created_at
		FROM gym_crowd_reports
		WHERE user_id = ?
		  AND created_at > datetime('now', '-24 hours')
		  AND ((? != '' AND gym_place_id = ?) OR (gym_name = ? AND gym_address = ?))
		ORDER BY created_at DESC
		LIMIT 1
	`, userID, placeID, placeID, name, address).Scan(&level, &reportedAt)
	if err != nil {
		return nil
	}

	return &models.GymCrowdReportSummary{
		Level:      level,
		ReportedAt: reportedAt,
	}
}

// fetchCommunityGymCrowdReport returns the average crowd level from all users
// for the configured gym within the given time window.
func fetchCommunityGymCrowdReport(gym *models.UserGym, window time.Duration) *models.GymCrowdCommunitySummary {
	placeID := strings.TrimSpace(gym.PlaceID)
	name := strings.TrimSpace(gym.Name)
	address := strings.TrimSpace(gym.Address)

	// Avoid matching reports for an unidentified gym.
	if placeID == "" && (name == "" || address == "") {
		return nil
	}

	var avgLevel float64
	var count int
	modifier := fmt.Sprintf("-%d minutes", int(window.Minutes()))
	err := database.DB.QueryRow(`
		SELECT COALESCE(AVG(level), 0), COUNT(*)
		FROM gym_crowd_reports
		WHERE created_at > datetime('now', ?)
		  AND ((? != '' AND gym_place_id = ?) OR (gym_name = ? AND gym_address = ?))
	`, modifier, placeID, placeID, name, address).Scan(&avgLevel, &count)
	if err != nil || count == 0 {
		return nil
	}

	return &models.GymCrowdCommunitySummary{
		Level: int(math.Round(avgLevel)),
		Count: count,
	}
}

// simulateCrowdPercentage returns a time-of-day based occupancy estimate.
func simulateCrowdPercentage() int {
	now := time.Now()
	hour := now.Hour()
	weekday := now.Weekday()

	var base int
	switch {
	case hour >= 5 && hour < 7:
		base = 25
	case hour >= 7 && hour < 10:
		base = 70
	case hour >= 10 && hour < 12:
		base = 55
	case hour >= 12 && hour < 14:
		base = 65
	case hour >= 14 && hour < 17:
		base = 45
	case hour >= 17 && hour < 21:
		base = 85
	case hour >= 21 && hour < 23:
		base = 40
	default:
		base = 10
	}

	if weekday == time.Saturday || weekday == time.Sunday {
		if hour >= 9 && hour < 13 {
			base += 10
		} else if hour >= 17 {
			base -= 20
		}
	}

	sway := rand.Intn(11) - 5
	percent := base + sway
	if percent < 0 {
		percent = 0
	}
	if percent > 100 {
		percent = 100
	}
	return percent
}

// crowdLabel returns a friendly label for the crowd percentage.
func crowdLabel(percent int) string {
	switch {
	case percent < 20:
		return "Not busy — great time to go"
	case percent < 40:
		return "Quiet"
	case percent < 60:
		return "Moderate"
	case percent < 80:
		return "Busy"
	default:
		return "Very busy — expect a wait"
	}
}

// evaluateOpenStatus parses the stored opening hours JSON and determines
// whether the venue is currently open. It returns a status label such as
// "Open now" or "Closed now" and an boolean indicating open state.
func evaluateOpenStatus(openingHoursJSON string) (bool, string) {
	if openingHoursJSON == "" {
		return true, ""
	}

	var hours models.OpeningHours
	if err := json.Unmarshal([]byte(openingHoursJSON), &hours); err != nil {
		return false, hoursUnknownText // malformed data: we can't confirm it's open
	}

	// Raw OSM text from Overpass fallback. We can only confidently handle 24/7.
	if hours.RawText != "" {
		clean := strings.ToLower(strings.TrimSpace(hours.RawText))
		if clean == "24/7" || clean == "24/7 open" {
			return true, "Open 24/7"
		}
		return true, hours.RawText
	}

	now := time.Now()
	weekday := int(now.Weekday()) // 0 = Sunday
	currentMinutes := now.Hour()*60 + now.Minute()

	for _, p := range hours.Periods {
		openDay := p.Open.Day
		closeDay := p.Close.Day
		openMinutes := p.Open.Hour*60 + p.Open.Minute
		closeMinutes := p.Close.Hour*60 + p.Close.Minute

		// Normalize cross-day periods (e.g., open Sat 22:00 -> close Sun 02:00)
		var dayOffset int
		if closeDay < openDay {
			closeDay += 7
		}
		if closeDay == openDay {
			dayOffset = 0
		} else {
			dayOffset = closeDay - openDay
		}

		for d := 0; d <= dayOffset; d++ {
			checkDay := (openDay + d) % 7
			if checkDay != weekday {
				continue
			}
			start := openMinutes
			end := closeMinutes
			if d < dayOffset {
				end = 24*60 - 1
			}
			if d > 0 {
				start = 0
			}
			if currentMinutes >= start && currentMinutes <= end {
				return true, fmt.Sprintf("Open now · Closes at %s", formatHourMinute12(p.Close.Hour, p.Close.Minute))
			}
		}
	}

	// Find next opening time today or later
	for d := 0; d < 7; d++ {
		checkDay := (weekday + d) % 7
		periods := filterPeriodsByDay(hours.Periods, checkDay)
		if len(periods) > 0 {
			p := periods[0]
			dayLabel := "at"
			if d != 0 {
				dayLabel = fmt.Sprintf("%s at", dayName(checkDay))
			}
			return false, fmt.Sprintf("Closed now · Opens %s %s", dayLabel, formatHourMinute12(p.Open.Hour, p.Open.Minute))
		}
	}

	return false, "Closed now"
}


// filterPeriodsByDay returns the periods that open on the given day of week.
func filterPeriodsByDay(periods []models.Period, day int) []models.Period {
	var out []models.Period
	for _, p := range periods {
		if p.Open.Day == day {
			out = append(out, p)
		}
	}
	return out
}

// dayName returns the short name of a weekday (0 = Sunday).
func dayName(day int) string {
	names := []string{"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"}
	if day < 0 || day >= len(names) {
		return ""
	}
	return names[day]
}

// formatHourMinute12 returns an AM/PM representation of a 0-23 hour/minute pair.
// Example: 14,30 -> "2:30 PM"; 9,5 -> "9:05 AM".
func formatHourMinute12(hour, minute int) string {
	if hour < 0 || hour > 23 || minute < 0 || minute > 59 {
		return fmt.Sprintf("%02d:%02d", hour, minute)
	}
	ampm := "AM"
	displayHour := hour
	if displayHour >= 12 {
		ampm = "PM"
		if displayHour > 12 {
			displayHour -= 12
		}
	}
	if displayHour == 0 {
		displayHour = 12
	}
	return fmt.Sprintf("%d:%02d %s", displayHour, minute, ampm)
}

// bestTimeForecastRequest is the payload expected by BestTime's forecast endpoint.
type bestTimeForecastRequest struct {
	APIKeyPrivate string `json:"api_key_private"`
	VenueName     string `json:"venue_name"`
	VenueAddress  string `json:"venue_address"`
}

// bestTimeForecastResponse mirrors the parts of BestTime's response we care about.
type bestTimeForecastResponse struct {
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
	Data    struct {
		VenueID string `json:"venue_id"`
	} `json:"data,omitempty"`
	Analysis struct {
		HourAnalysis struct {
			IntensityNr  int    `json:"intensity_nr"`
			IntensityTxt string `json:"intensity_txt"`
		} `json:"hour_analysis"`
	} `json:"analysis,omitempty"`
}

// fetchBestTimeBusyness calls BestTime's /forecasts endpoint for a venue.
// It returns the current hour's intensity (0-100) on success.
func fetchBestTimeBusyness(name, address string) (int, error) {
	apiKey := os.Getenv("BESTTIME_API_KEY")
	if apiKey == "" {
		return 0, fmt.Errorf("BESTTIME_API_KEY not configured")
	}

	baseURL := os.Getenv("BESTTIME_API_URL")
	if baseURL == "" {
		baseURL = "https://besttime.app/api/v1"
	}

	reqBody, err := json.Marshal(bestTimeForecastRequest{
		APIKeyPrivate: apiKey,
		VenueName:     strings.TrimSpace(name),
		VenueAddress:  strings.TrimSpace(address),
	})
	if err != nil {
		return 0, err
	}

	req, err := http.NewRequest(http.MethodPost, baseURL+"/forecasts", bytes.NewBuffer(reqBody))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := bestTimeClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, err
	}

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("besttime returned status %d: %s", resp.StatusCode, string(body))
	}

	var result bestTimeForecastResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return 0, err
	}

	if result.Status != "OK" {
		return 0, fmt.Errorf("besttime returned non-OK status: %s (%s)", result.Status, result.Message)
	}

	// BestTime returns 0-100 intensity for the current hour.
	percentage := result.Analysis.HourAnalysis.IntensityNr
	if percentage < 0 {
		percentage = 0
	}
	if percentage > 100 {
		percentage = 100
	}
	return percentage, nil
}

// fetchCachedBestTime returns a cached busyness value if it is fresh (under 60 minutes).
func fetchCachedBestTime(name, address string) (int, error) {
	var percentage int
	err := database.DB.QueryRow(`
		SELECT percentage
		FROM besttime_cache
		WHERE venue_name = ? AND venue_address = ?
		  AND datetime(updated_at) > datetime('now', '-60 minutes')
		LIMIT 1
	`, strings.TrimSpace(name), strings.TrimSpace(address)).Scan(&percentage)
	if err != nil {
		return 0, err
	}
	return percentage, nil
}

// upsertBestTimeCache stores a fresh busyness value for a venue.
func upsertBestTimeCache(name, address string, percentage int) error {
	id := uuid.New().String()
	_, err := database.DB.Exec(`
		INSERT INTO besttime_cache (id, venue_name, venue_address, percentage, updated_at)
		VALUES (?, ?, ?, ?, datetime('now'))
		ON CONFLICT(venue_name, venue_address)
		DO UPDATE SET percentage = excluded.percentage, updated_at = datetime('now')
	`, id, strings.TrimSpace(name), strings.TrimSpace(address), percentage)
	return err
}

// googlePlaceDetailsResponse mirrors the Google Places (New) Place Details
// response for the fields we request (id, displayName, formattedAddress,
// location, regularOpeningHours). The request asks for those fields via
// X-Goog-FieldMask.
type googlePlaceDetailsResponse struct {
	ID              string `json:"id"`
	DisplayName     struct {
		Text string `json:"text"`
	} `json:"displayName"`
	FormattedAddress string `json:"formattedAddress"`
	Location         struct {
		Lat float64 `json:"lat"`
		Lng float64 `json:"lng"`
	} `json:"location"`
	RegularOpeningHours struct {
		OpenNow     bool `json:"openNow"`
		Periods     []struct {
			Open  models.TimePoint `json:"open"`
			Close models.TimePoint `json:"close"`
		} `json:"periods"`
		WeekdayText []string `json:"weekdayText"`
	} `json:"regularOpeningHours"`
	InternationalPhoneNumber string `json:"internationalPhoneNumber,omitempty"`
	WebsiteURI               string `json:"websiteUri,omitempty"`
	Error struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Status  string `json:"status"`
	} `json:"error,omitempty"`
}

// fetchGooglePlaceDetails fetches exact name, address, and coordinates for a
// Google Place ID using the Places API (New).
func fetchGooglePlaceDetails(placeID string) (*models.GymSearchResult, error) {
	if googlePlacesAPIKey == "" {
		return nil, fmt.Errorf("google places api key not configured")
	}

	url := "https://places.googleapis.com/v1/places/" + url.PathEscape(placeID)
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Goog-Api-Key", googlePlacesAPIKey)
	// Field mask required by the new Places API to keep responses small.
	req.Header.Set("X-Goog-FieldMask", "id,displayName,formattedAddress,location,regularOpeningHours,internationalPhoneNumber,websiteUri")

	resp, err := googlePlacesClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("google places details returned status %d: %s", resp.StatusCode, string(body))
	}

	var result googlePlaceDetailsResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	if result.Error.Message != "" {
		return nil, fmt.Errorf("google places details error: %s", result.Error.Message)
	}

	// Serialize regular opening hours so we can store them in the database and
	// return them to the frontend without leaking the full Google response shape.
	var openingHoursJSON string
	if len(result.RegularOpeningHours.Periods) > 0 || result.RegularOpeningHours.OpenNow || len(result.RegularOpeningHours.WeekdayText) > 0 {
		hours := models.OpeningHours{
			OpenNow:     result.RegularOpeningHours.OpenNow,
			Periods:     make([]models.Period, 0, len(result.RegularOpeningHours.Periods)),
			WeekdayText: result.RegularOpeningHours.WeekdayText,
		}
		for _, p := range result.RegularOpeningHours.Periods {
			hours.Periods = append(hours.Periods, models.Period{
				Open:  p.Open,
				Close: p.Close,
			})
		}
		if b, err := json.Marshal(hours); err == nil {
			openingHoursJSON = string(b)
		}
	}

	return &models.GymSearchResult{
		Name:         result.DisplayName.Text,
		Address:      result.FormattedAddress,
		PlaceID:      result.ID,
		Phone:        result.InternationalPhoneNumber,
		Website:      result.WebsiteURI,
		Lat:          result.Location.Lat,
		Lng:          result.Location.Lng,
		OpeningHours: openingHoursJSON,
	}, nil
}

// nominatimClient is reused for all Nominatim geocoding requests.
var nominatimClient = &http.Client{
	Timeout: 4 * time.Second,
}

// gymNameKeywords are used to filter Nominatim results to likely gyms.
var gymNameKeywords = []string{
	"gym", "fitness", "health club", "sports club", "crossfit",
	"planet fitness", "la fitness", "anytime fitness", "gold's gym",
	"ymca", "equinox", "crunch", "lifetime", "24 hour fitness",
}

// SearchGyms handles GET /api/gyms/search.
// Proxies a free-text query to Google Places (when configured) or Nominatim
// (OpenStreetMap) and returns gym-like venue suggestions with name and address.
func SearchGyms(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		utils.WriteSuccess(w, []models.GymSearchResult{}, "No query provided")
		return
	}

	var results []models.GymSearchResult
	var err error

	if googlePlacesAPIKey != "" {
		results, err = searchGooglePlacesGyms(query)
	}
	if googlePlacesAPIKey == "" || err != nil {
		results, err = searchNominatimGyms(query)
	}
	if err != nil {
		// Return empty results gracefully so the UI doesn't break.
		utils.WriteSuccess(w, []models.GymSearchResult{}, "Search unavailable")
		return
	}

	utils.WriteSuccess(w, results, "Gyms found")
}

// GetGymDetails handles GET /api/gyms/details.
// Returns exact name, address, coordinates, and opening hours for a gym.
// Accepts either a Google Place ID (`placeId`) or lat/lng for an Overpass fallback.
//
// Upstream errors (Google/Overpass rate limits, billing, etc.) are logged
// server-side but return a successful response with the identifiers we ALREADY
// know. This lets the frontend gracefully fall back to the autocomplete
// suggestion data it already has, avoiding noisy user-facing warnings.
func GetGymDetails(w http.ResponseWriter, r *http.Request) {
	placeID := strings.TrimSpace(r.URL.Query().Get("placeId"))

	if placeID != "" {
		info, err := fetchGooglePlaceDetails(placeID)
		if err != nil {
			log.Printf("[gym] google places details failed for %s: %v", placeID, err)
			info = &models.GymSearchResult{PlaceID: placeID}
			utils.WriteSuccess(w, info, "Place details unavailable")
			return
		}
		utils.WriteSuccess(w, info, "Place details loaded")
		return
	}

	// No Google placeId — fall back to Overpass for OSM opening hours.
	lat, err := strconv.ParseFloat(r.URL.Query().Get("lat"), 64)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "lat is required when placeId is omitted")
		return
	}
	lng, err := strconv.ParseFloat(r.URL.Query().Get("lng"), 64)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "lng is required when placeId is omitted")
		return
	}

	info, err := fetchOverpassGymDetails(lat, lng)
	if err != nil {
		log.Printf("[gym] overpass details failed for %f,%f: %v", lat, lng, err)
		info = &models.GymSearchResult{Lat: lat, Lng: lng}
		utils.WriteSuccess(w, info, "Place details unavailable")
		return
	}

	utils.WriteSuccess(w, info, "Place details loaded")
}

// nominatimResult mirrors the fields we care about from Nominatim's JSON.
type nominatimResult struct {
	DisplayName string `json:"display_name"`
	Type        string `json:"type"`
	Category    string `json:"category"`
	Lat         string `json:"lat"`
	Lon         string `json:"lon"`
	Address     struct {
		Name        string `json:"name"`
		Road        string `json:"road"`
		HouseNumber string `json:"house_number"`
		City        string `json:"city"`
		Town        string `json:"town"`
		State       string `json:"state"`
		Postcode    string `json:"postcode"`
		Country     string `json:"country"`
	} `json:"address"`
}

// searchNominatimGyms calls Nominatim's search API and filters results to gyms.
func searchNominatimGyms(query string) ([]models.GymSearchResult, error) {
	encoded := url.QueryEscape(strings.TrimSpace(query))
	reqURL := fmt.Sprintf("https://nominatim.openstreetmap.org/search?format=json&q=%s&limit=10&addressdetails=1", encoded)

	req, err := http.NewRequest(http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	// Nominatim requires a valid User-Agent.
	req.Header.Set("User-Agent", "ResolutionFitnessApp/1.0")

	resp, err := nominatimClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("nominatim returned status %d", resp.StatusCode)
	}

	var raw []nominatimResult
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}

	results := make([]models.GymSearchResult, 0, len(raw))
	seen := make(map[string]bool)
	for _, item := range raw {
		if !looksLikeGym(item) {
			continue
		}

		name := strings.TrimSpace(item.Address.Name)
		if name == "" {
			parts := strings.Split(item.DisplayName, ",")
			if len(parts) > 0 {
				name = strings.TrimSpace(parts[0])
			}
		}
		if name == "" {
			name = strings.TrimSpace(item.DisplayName)
		}
		addr := formatNominatimAddress(item)
		key := strings.ToLower(name + "|" + addr)
		if name == "" || seen[key] {
			continue
		}
		seen[key] = true

		lat, _ := strconv.ParseFloat(item.Lat, 64)
		lng, _ := strconv.ParseFloat(item.Lon, 64)
		results = append(results, models.GymSearchResult{
			Name:    name,
			Address: addr,
			PlaceID: "",
			Lat:     lat,
			Lng:     lng,
		})
	}

	return results, nil
}

// looksLikeGym returns true if a Nominatim result is likely a gym/fitness venue.
func looksLikeGym(item nominatimResult) bool {
	text := strings.ToLower(item.DisplayName + " " + item.Type + " " + item.Category)
	for _, kw := range gymNameKeywords {
		if strings.Contains(text, kw) {
			return true
		}
	}
	return false
}

// formatNominatimAddress builds a single-line address from Nominatim details.
func formatNominatimAddress(item nominatimResult) string {
	parts := []string{}
	if item.Address.HouseNumber != "" {
		parts = append(parts, item.Address.HouseNumber)
	}
	if item.Address.Road != "" {
		parts = append(parts, item.Address.Road)
	}
	if item.Address.City != "" {
		parts = append(parts, item.Address.City)
	} else if item.Address.Town != "" {
		parts = append(parts, item.Address.Town)
	}
	if item.Address.State != "" {
		parts = append(parts, item.Address.State)
	}
	if item.Address.Postcode != "" {
		parts = append(parts, item.Address.Postcode)
	}
	return strings.Join(parts, ", ")
}

// overpassClient is reused for all Overpass API requests.
var overpassClient = &http.Client{
	Timeout: 4 * time.Second,
}

// overpassResponse mirrors the parts of the Overpass API response we care about.
type overpassResponse struct {
	Elements []struct {
		Type string            `json:"type"`
		Tags map[string]string `json:"tags"`
	} `json:"elements"`
}

// fetchOverpassGymDetails queries the Overpass API for a gym near the given
// lat/lng and returns any opening hours found in OpenStreetMap.
func fetchOverpassGymDetails(lat, lng float64) (*models.GymSearchResult, error) {
	// Use a small search radius to avoid picking up nearby unrelated venues.
	query := fmt.Sprintf(`[out:json][timeout:3];
(
  node["leisure"="fitness_centre"](around:100,%.6f,%.6f);
  way["leisure"="fitness_centre"](around:100,%.6f,%.6f);
  node["amenity"="gym"](around:100,%.6f,%.6f);
  way["amenity"="gym"](around:100,%.6f,%.6f);
  node["amenity"="fitness_center"](around:100,%.6f,%.6f);
  way["amenity"="fitness_center"](around:100,%.6f,%.6f);
);
out tags;`, lat, lng, lat, lng, lat, lng, lat, lng, lat, lng, lat, lng)

	formData := url.Values{}
	formData.Set("data", query)
	req, err := http.NewRequest(http.MethodPost, overpassAPIURL, strings.NewReader(formData.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", "ResolutionFitnessApp/1.0")

	resp, err := overpassClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("overpass returned status %d: %s", resp.StatusCode, string(body))
	}

	var result overpassResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	var openingHours string
	for _, el := range result.Elements {
		hours := strings.TrimSpace(el.Tags["opening_hours"])
		if hours != "" {
			openingHours = hours
			break
		}
	}

	return &models.GymSearchResult{
		Name:         "",
		Address:      "",
		PlaceID:      "",
		Lat:          lat,
		Lng:          lng,
		OpeningHours: overpassHoursToJSON(openingHours),
	}, nil
}

// overpassHoursToJSON converts an OSM opening_hours string into the same
// OpeningHours JSON format used for Google Places. Only simple cases are
// handled; everything else is preserved as raw text.
func overpassHoursToJSON(hours string) string {
	if hours == "" {
		return ""
	}

	clean := strings.ToLower(strings.TrimSpace(hours))

	// 24/7 gyms are always open.
	if clean == "24/7" || clean == "24/7 open" {
		h := models.OpeningHours{
			OpenNow:     true,
			Periods:     make([]models.Period, 0),
			WeekdayText: []string{"Open 24/7"},
			RawText:     hours,
		}
		b, _ := json.Marshal(h)
		return string(b)
	}

	// Default: store the raw string so the frontend can display it.
	h := models.OpeningHours{
		OpenNow:     true, // assume open unless we can prove otherwise
		Periods:     make([]models.Period, 0),
		WeekdayText: []string{hours},
		RawText:     hours,
	}
	b, _ := json.Marshal(h)
	return string(b)
}

// googlePlacesAutocompleteRequest is the request body for Google Places (New) Autocomplete.
type googlePlacesAutocompleteRequest struct {
	Input                  string   `json:"input"`
	IncludedPrimaryTypes   []string `json:"includedPrimaryTypes,omitempty"`
	IncludedRegionCodes    []string `json:"includedRegionCodes,omitempty"`
}

// googlePlacesAutocompleteResponse mirrors the parts of the Google Places
// (New) Autocomplete response we care about.
type googlePlacesAutocompleteResponse struct {
	Suggestions []struct {
		PlacePrediction struct {
			PlaceID string `json:"placeId"`
			Text    struct {
				Text     string `json:"text"`
				Language string `json:"languageCode"`
			} `json:"text"`
			StructuredFormat struct {
				PrimaryText   struct {
					Text string `json:"text"`
				} `json:"primaryText"`
				SecondaryText struct {
					Text string `json:"text"`
				} `json:"secondaryText"`
			} `json:"structuredFormat"`
		} `json:"placePrediction"`
	} `json:"suggestions"`
	Error struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Status  string `json:"status"`
	} `json:"error,omitempty"`
}

// searchGooglePlacesGyms calls the Google Places (New) Autocomplete API.
func searchGooglePlacesGyms(query string) ([]models.GymSearchResult, error) {
	if googlePlacesAPIKey == "" {
		return nil, fmt.Errorf("google places api key not configured")
	}

	reqBody, err := json.Marshal(googlePlacesAutocompleteRequest{
		Input:                strings.TrimSpace(query),
		IncludedPrimaryTypes: []string{"gym", "fitness_center", "sports_complex"},
	})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest(http.MethodPost, "https://places.googleapis.com/v1/places:autocomplete", bytes.NewBuffer(reqBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Goog-Api-Key", googlePlacesAPIKey)

	resp, err := googlePlacesClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("google places returned status %d: %s", resp.StatusCode, string(body))
	}

	var result googlePlacesAutocompleteResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	if result.Error.Message != "" {
		return nil, fmt.Errorf("google places error: %s", result.Error.Message)
	}

	results := make([]models.GymSearchResult, 0, len(result.Suggestions))
	seen := make(map[string]bool)
	for _, s := range result.Suggestions {
		name := strings.TrimSpace(s.PlacePrediction.StructuredFormat.PrimaryText.Text)
		addr := strings.TrimSpace(s.PlacePrediction.StructuredFormat.SecondaryText.Text)
		placeID := strings.TrimSpace(s.PlacePrediction.PlaceID)
		if name == "" {
			continue
		}
		if addr == "" {
			addr = strings.TrimSpace(s.PlacePrediction.Text.Text)
		}
		key := strings.ToLower(name + "|" + addr)
		if seen[key] {
			continue
		}
		seen[key] = true
		results = append(results, models.GymSearchResult{
			Name:    name,
			Address: addr,
			PlaceID: placeID,
			Lat:     0,
			Lng:     0,
		})
	}

	return results, nil
}
