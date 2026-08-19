// Package handlers — exercise image generation via Google Gemini.
// Generates clean fitness illustrations for exercises using the
// Gemini 2.5 Flash Image (Nano Banana) API and caches them locally.
package handlers

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"resolution-fitnessapp-backend/database"
	"resolution-fitnessapp-backend/utils"

	"github.com/google/uuid"
)

// exerciseImageModel is the Gemini model used for image generation.
// Gemini 2.5 Flash Image (Nano Banana) — fast, cheap, high quality.
const exerciseImageModel = "gemini-2.5-flash-image"

// exerciseImageTimeout is the max time to wait for a single image generation.
const exerciseImageTimeout = 60 * time.Second

// exerciseImageDir is the subdirectory under uploads/ for generated exercise images.
const exerciseImageDir = "uploads/exercises"

// exerciseImageWash maps muscle groups to background wash colours for
// consistent, clean illustration style per muscle group.
var exerciseImageWash = map[string]string{
	"chest":     "soft red accent",
	"back":      "soft blue accent",
	"legs":      "soft green accent",
	"shoulders": "soft amber accent",
	"arms":      "soft violet accent",
	"core":      "soft teal accent",
	"cardio":    "soft pink accent",
}

// batchGenerateState tracks an in-progress batch generation request.
type batchGenerateState struct {
	Total     int    `json:"total"`
	Completed int    `json:"completed"`
	Failed    int    `json:"failed"`
	Status    string `json:"status"` // "running", "done"
}

var (
	batchMu   sync.Mutex
	batchJobs = map[string]*batchGenerateState{}
)

// GenerateExerciseImage handles POST /api/exercises/{exerciseId}/generate-image.
// Generates a clean fitness illustration for a single exercise using
// Gemini 2.5 Flash Image and saves it to the uploads directory.
func GenerateExerciseImage(w http.ResponseWriter, r *http.Request) {
	exerciseID := r.PathValue("exerciseId")
	if exerciseID == "" {
		utils.WriteError(w, http.StatusBadRequest, "Exercise ID is required")
		return
	}

	// Fetch exercise from DB
	var name, muscleGroup, imageURL string
	err := database.DB.QueryRow(
		"SELECT name, muscle_group, COALESCE(image_url, '') FROM exercises WHERE id = ? AND is_active = 1",
		exerciseID,
	).Scan(&name, &muscleGroup, &imageURL)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "Exercise not found")
		return
	}

	// Check if an AI-generated image already exists (skip regeneration)
	if strings.Contains(imageURL, "/uploads/exercises/") {
		utils.WriteSuccess(w, map[string]string{"imageUrl": imageURL}, "Exercise already has an AI-generated image")
		return
	}

	// Generate the image
	imageURL, err = generateAndSaveExerciseImage(name, muscleGroup)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to generate image: %v", err))
		return
	}

	// Update the exercise in the database
	database.DB.Exec("UPDATE exercises SET image_url = ? WHERE id = ?", imageURL, exerciseID)

	utils.WriteSuccess(w, map[string]string{"imageUrl": imageURL}, "Exercise image generated")
}

// GenerateAllExerciseImages handles POST /api/exercises/generate-images.
// Batch-generates AI images for all exercises that don't already have one.
// Optional query param: ?muscle_group=chest to limit to one group.
// Returns a batch job ID that can be polled with GET /api/exercises/generate-images/status?id=xxx.
func GenerateAllExerciseImages(w http.ResponseWriter, r *http.Request) {
	muscleGroup := r.URL.Query().Get("muscle_group")

	// Count exercises without AI images
	query := "SELECT COUNT(*) FROM exercises WHERE is_active = 1 AND (image_url IS NULL OR image_url = '' OR image_url NOT LIKE '%/uploads/exercises/%')"
	var args []interface{}
	if muscleGroup != "" {
		query += " AND muscle_group = ?"
		args = append(args, strings.ToLower(muscleGroup))
	}

	var total int
	database.DB.QueryRow(query, args...).Scan(&total)
	if total == 0 {
		utils.WriteSuccess(w, map[string]interface{}{"total": 0, "completed": 0}, "All exercises already have AI images")
		return
	}

	// Start async batch generation
	jobID := uuid.New().String()
	batchMu.Lock()
	batchJobs[jobID] = &batchGenerateState{Total: total, Status: "running"}
	batchMu.Unlock()

	go runBatchImageGeneration(jobID, muscleGroup)

	utils.WriteAccepted(w, map[string]string{"jobId": jobID}, fmt.Sprintf("Batch generation started for %d exercises", total))
}

// GetExerciseImageStatus handles GET /api/exercises/generate-images/status?id=xxx.
func GetExerciseImageStatus(w http.ResponseWriter, r *http.Request) {
	jobID := r.URL.Query().Get("id")
	if jobID == "" {
		utils.WriteError(w, http.StatusBadRequest, "Job ID is required")
		return
	}

	batchMu.Lock()
	job, ok := batchJobs[jobID]
	batchMu.Unlock()

	if !ok {
		utils.WriteError(w, http.StatusNotFound, "Job not found")
		return
	}

	utils.WriteSuccess(w, job, "Batch generation status")
}

// runBatchImageGeneration processes all exercises without AI images.
func runBatchImageGeneration(jobID, muscleGroup string) {
	query := "SELECT id, name, muscle_group FROM exercises WHERE is_active = 1 AND (image_url IS NULL OR image_url = '' OR image_url NOT LIKE '%/uploads/exercises/%')"
	var args []interface{}
	if muscleGroup != "" {
		query += " AND muscle_group = ?"
		args = append(args, strings.ToLower(muscleGroup))
	}
	query += " ORDER BY muscle_group, name"

	rows, err := database.DB.Query(query, args...)
	if err != nil {
		batchMu.Lock()
		batchJobs[jobID].Status = "done"
		batchMu.Unlock()
		return
	}
	defer rows.Close()

	type exerciseRow struct {
		ID, Name, MuscleGroup string
	}
	var exercises []exerciseRow
	for rows.Next() {
		var ex exerciseRow
		rows.Scan(&ex.ID, &ex.Name, &ex.MuscleGroup)
		exercises = append(exercises, ex)
	}
	rows.Close()

	for _, ex := range exercises {
		imageURL, err := generateAndSaveExerciseImage(ex.Name, ex.MuscleGroup)
		if err != nil {
			batchMu.Lock()
			batchJobs[jobID].Failed++
			batchMu.Unlock()
			continue
		}

		database.DB.Exec("UPDATE exercises SET image_url = ? WHERE id = ?", imageURL, ex.ID)

		batchMu.Lock()
		batchJobs[jobID].Completed++
		batchMu.Unlock()
	}

	batchMu.Lock()
	batchJobs[jobID].Status = "done"
	batchMu.Unlock()

	// Clean up old completed jobs after 5 minutes
	go func() {
		time.Sleep(5 * time.Minute)
		batchMu.Lock()
		delete(batchJobs, jobID)
		batchMu.Unlock()
	}()
}

// generateAndSaveExerciseImage calls the Gemini 2.5 Flash Image API to
// generate a clean fitness illustration, saves it to disk, and returns
// the URL path.
func generateAndSaveExerciseImage(exerciseName, muscleGroup string) (string, error) {
	if geminiKey == "" {
		return "", fmt.Errorf("Gemini API key not configured")
	}

	// Build a detailed prompt for a clean fitness illustration
	wash := exerciseImageWash[muscleGroup]
	if wash == "" {
		wash = "neutral background"
	}

	prompt := fmt.Sprintf(
		"A clean, professional fitness illustration of a person performing a %s exercise. "+
			"Style: modern vector-style fitness illustration with clean lines, minimal background (%s). "+
			"The figure should demonstrate proper form with clear body positioning. "+
			"No text, no watermarks, no UI elements. Square composition, suitable for a fitness app card.",
		exerciseName, wash,
	)

	// Call the Gemini Interactions API
	reqBody := map[string]interface{}{
		"model": exerciseImageModel,
		"input": []map[string]string{
			{"type": "text", "text": prompt},
		},
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	url := "https://generativelanguage.googleapis.com/v1beta/interactions"
	httpReq, err := http.NewRequest("POST", url, bytes.NewReader(jsonBody))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-goog-api-key", geminiKey)

	ctx, cancel := context.WithTimeout(context.Background(), exerciseImageTimeout)
	defer cancel()

	resp, err := geminiHTTPClient.Do(httpReq.WithContext(ctx))
	if err != nil {
		return "", fmt.Errorf("api call: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		return "", ErrQuotaExceeded
	}

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("gemini API returned status %d: %s", resp.StatusCode, string(respBytes))
	}

	// Parse the response — the interaction output contains base64 image data
	var interactionResp struct {
		OutputImage *struct {
			Data     string `json:"data"`
			MimeType string `json:"mime_type"`
		} `json:"output_image"`
		Steps []struct {
			Content struct {
				Parts []struct {
					Text       string `json:"text"`
					InlineData *struct {
						MimeType string `json:"mime_type"`
						Data     string `json:"data"`
					} `json:"inline_data,omitempty"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"steps"`
	}

	if err := json.Unmarshal(respBytes, &interactionResp); err != nil {
		return "", fmt.Errorf("parse response: %w", err)
	}

	// Extract image data — try output_image first, then scan steps
	var imageData []byte
	var mimeSuffix string

	if interactionResp.OutputImage != nil && interactionResp.OutputImage.Data != "" {
		imageData, err = base64.StdEncoding.DecodeString(interactionResp.OutputImage.Data)
		mimeSuffix = mimeToExt(interactionResp.OutputImage.MimeType)
	} else {
		// Scan steps for image data
		for _, step := range interactionResp.Steps {
			for _, part := range step.Content.Parts {
				if part.InlineData != nil && part.InlineData.Data != "" {
					imageData, err = base64.StdEncoding.DecodeString(part.InlineData.Data)
					mimeSuffix = mimeToExt(part.InlineData.MimeType)
					break
				}
			}
			if len(imageData) > 0 {
				break
			}
		}
	}

	if len(imageData) == 0 {
		return "", fmt.Errorf("no image data in response")
	}

	if mimeSuffix == "" {
		mimeSuffix = ".png"
	}

	// Save to uploads/exercises/
	if err := os.MkdirAll(exerciseImageDir, 0755); err != nil {
		return "", fmt.Errorf("create exercises dir: %w", err)
	}

	filename := fmt.Sprintf("%s%s", uuid.New().String(), mimeSuffix)
	filePath := filepath.Join(exerciseImageDir, filename)
	if err := os.WriteFile(filePath, imageData, 0644); err != nil {
		return "", fmt.Errorf("write image: %w", err)
	}

	return "/uploads/exercises/" + filename, nil
}

// mimeToExt converts a MIME type to a file extension.
func mimeToExt(mime string) string {
	switch {
	case strings.Contains(mime, "png"):
		return ".png"
	case strings.Contains(mime, "jpeg"), strings.Contains(mime, "jpg"):
		return ".jpg"
	case strings.Contains(mime, "webp"):
		return ".webp"
	default:
		return ".png"
	}
}
