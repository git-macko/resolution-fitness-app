// Package handlers — Build Inspiration endpoints.
// GET    /api/inspiration              → list the user's inspiration photos
// POST   /api/inspiration/photos       → upload an inspiration photo (max 3 per user)
// DELETE /api/inspiration/photos/{id} → remove one inspiration photo
// PUT    /api/inspiration/reorder      → reorder photos by ID list
package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"resolution-fitnessapp-backend/database"
	"resolution-fitnessapp-backend/models"
	"resolution-fitnessapp-backend/utils"

	"github.com/google/uuid"
)

// maxInspirationPhotos is the cap on user-uploaded inspiration photos.
const maxInspirationPhotos = 3

// ── Fetching ─────────────────────────────────────────────────────────

// fetchBuildInspiration loads the user's inspiration photos from the
// database. Used by both the dashboard aggregation and the standalone
// GET /api/inspiration endpoint.
func fetchBuildInspiration(userID string) models.BuildInspiration {
	result := models.BuildInspiration{
		Photos: []models.InspirationPhoto{},
	}

	rows, err := database.DB.Query(`
		SELECT id, photo_url, COALESCE(created_at, '')
		FROM build_inspiration WHERE user_id = ?
		ORDER BY sort_order ASC, created_at ASC
	`, userID)
	if err != nil {
		log.Printf("[inspiration] failed to query photos: %v", err)
		return result
	}
	defer rows.Close()

	for rows.Next() {
		var photo models.InspirationPhoto
		if err := rows.Scan(&photo.ID, &photo.PhotoURL, &photo.CreatedAt); err != nil {
			continue
		}
		result.Photos = append(result.Photos, photo)
	}

	if result.Photos == nil {
		result.Photos = []models.InspirationPhoto{}
	}
	return result
}

// GetInspiration handles GET /api/inspiration.
func GetInspiration(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	utils.WriteSuccess(w, fetchBuildInspiration(userID), "Inspiration retrieved")
}

// ── Photo Upload & Delete ────────────────────────────────────────────

// UploadInspirationPhoto handles POST /api/inspiration/photos.
// Accepts a multipart form with a "photo" file field and stores it as an
// inspiration photo. Enforces a maximum of 3 photos per user; the cap check
// and insert run in one transaction so concurrent uploads can't exceed it.
func UploadInspirationPhoto(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	// ── Limit upload size ────────────────────────────────────────
	r.Body = http.MaxBytesReader(w, r.Body, utils.MaxUploadSize)
	if err := r.ParseMultipartForm(utils.MaxUploadSize); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "File too large. Max 10MB")
		return
	}

	file, header, err := r.FormFile("photo")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "No photo provided")
		return
	}
	defer file.Close()

	photoURL, err := utils.SaveUpload(file, header.Filename, "uploads")
	if err != nil {
		if strings.Contains(err.Error(), "invalid file type") {
			utils.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		utils.WriteError(w, http.StatusInternalServerError, "Failed to save photo")
		return
	}

	// ── Cap check + insert in one transaction (atomic) ───────────
	tx, err := database.DB.Begin()
	if err != nil {
		utils.DeleteFile(photoURL)
		utils.WriteError(w, http.StatusInternalServerError, "Failed to save photo")
		return
	}

	var userPhotoCount int
	tx.QueryRow(`
		SELECT COUNT(*) FROM build_inspiration
		WHERE user_id = ?
	`, userID).Scan(&userPhotoCount)
	if userPhotoCount >= maxInspirationPhotos {
		tx.Rollback()
		utils.DeleteFile(photoURL)
		utils.WriteError(w, http.StatusBadRequest,
			fmt.Sprintf("Maximum of %d inspiration photos allowed. Delete one to add another.", maxInspirationPhotos))
		return
	}

	var nextOrder int
	tx.QueryRow(`
		SELECT COALESCE(MAX(sort_order), -1) + 1 FROM build_inspiration WHERE user_id = ?
	`, userID).Scan(&nextOrder)

	photoID := uuid.New().String()
	if _, err := tx.Exec(`
		INSERT INTO build_inspiration (id, user_id, photo_url, source, sort_order, created_at)
		VALUES (?, ?, ?, 'user', ?, datetime('now'))
	`, photoID, userID, photoURL, nextOrder); err != nil {
		tx.Rollback()
		utils.DeleteFile(photoURL)
		utils.WriteError(w, http.StatusInternalServerError, "Failed to save photo")
		return
	}
	if err := tx.Commit(); err != nil {
		utils.DeleteFile(photoURL)
		utils.WriteError(w, http.StatusInternalServerError, "Failed to save photo")
		return
	}

	photo := models.InspirationPhoto{
		ID:       photoID,
		PhotoURL: photoURL,
	}
	utils.WriteCreated(w, photo, "Inspiration photo added")
}

// DeleteInspirationPhoto handles DELETE /api/inspiration/photos/{photoId}.
// Only the owner of the photo can delete it.
func DeleteInspirationPhoto(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	photoID := r.PathValue("photoId")

	var photoURL string
	err := database.DB.QueryRow(`
		SELECT photo_url FROM build_inspiration
		WHERE id = ? AND user_id = ?
	`, photoID, userID).Scan(&photoURL)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "Inspiration photo not found")
		return
	}

	if _, err := database.DB.Exec(`
		DELETE FROM build_inspiration WHERE id = ? AND user_id = ?
	`, photoID, userID); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to delete photo")
		return
	}

	utils.DeleteFile(photoURL)
	utils.WriteSuccess(w, map[string]string{"id": photoID}, "Inspiration photo removed")
}

// ReorderInspirationPhotos handles PUT /api/inspiration/reorder.
// Accepts a JSON body with an ordered list of photo IDs and updates
// the sort_order column so the carousel reflects the new order.
func ReorderInspirationPhotos(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	var req struct {
		PhotoIDs []string `json:"photoIds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if len(req.PhotoIDs) == 0 {
		utils.WriteError(w, http.StatusBadRequest, "photoIds is required")
		return
	}
	if len(req.PhotoIDs) > maxInspirationPhotos {
		utils.WriteError(w, http.StatusBadRequest, fmt.Sprintf("Maximum of %d photos allowed", maxInspirationPhotos))
		return
	}

	tx, err := database.DB.Begin()
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to reorder")
		return
	}

	// Verify all IDs belong to this user and update sort_order.
	for i, id := range req.PhotoIDs {
		result, err := tx.Exec(
			"UPDATE build_inspiration SET sort_order = ? WHERE id = ? AND user_id = ?",
			i, id, userID,
		)
		if err != nil {
			tx.Rollback()
			utils.WriteError(w, http.StatusInternalServerError, "Failed to reorder")
			return
		}
		affected, _ := result.RowsAffected()
		if affected == 0 {
			tx.Rollback()
			utils.WriteError(w, http.StatusNotFound, "Photo not found or access denied")
			return
		}
	}

	if err := tx.Commit(); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to reorder")
		return
	}

	utils.WriteSuccess(w, nil, "Photos reordered")
}


