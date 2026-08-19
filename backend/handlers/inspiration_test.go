// Package handlers — unit tests for the Build Inspiration endpoints.
// Covers photo upload limits, delete ownership, and empty listing.
package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"resolution-fitnessapp-backend/middleware"
	"resolution-fitnessapp-backend/models"
)

// createInspirationMultipart builds a multipart request with a JPEG in the
// "photo" field, mirroring how the mobile app uploads an inspiration photo.
func createInspirationMultipart(userID string) (*http.Request, *httptest.ResponseRecorder) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, _ := writer.CreateFormFile("photo", "inspo.jpg")
	jpegHeader := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46}
	part.Write(append(jpegHeader, bytes.Repeat([]byte{0x00, 0x00}, 50)...))
	writer.Close()

	req := httptest.NewRequest("POST", "/api/inspiration/photos", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if userID != "" {
		ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
		req = req.WithContext(ctx)
	}
	return req, httptest.NewRecorder()
}

// unmarshalInspirationPhoto extracts an InspirationPhoto from an APIResponse body.
func unmarshalInspirationPhoto(body []byte) models.InspirationPhoto {
	var resp models.APIResponse
	json.Unmarshal(body, &resp)
	data, _ := json.Marshal(resp.Data)
	var photo models.InspirationPhoto
	json.Unmarshal(data, &photo)
	return photo
}

// TestGetInspiration_Empty verifies an empty inspiration list is returned
// as an empty array (not null).
func TestGetInspiration_Empty(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	req, w := newRequest("GET", "/api/inspiration", nil, userID)
	GetInspiration(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GetInspiration: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp models.APIResponse
	json.Unmarshal(w.Body.Bytes(), &resp)
	data, _ := json.Marshal(resp.Data)
	var insp models.BuildInspiration
	json.Unmarshal(data, &insp)

	if insp.Photos == nil {
		t.Error("Photos should be an empty array, got nil")
	}
	if len(insp.Photos) != 0 {
		t.Errorf("Expected 0 photos, got %d", len(insp.Photos))
	}
}

// TestUploadInspirationPhoto_SuccessAndLimit verifies photos upload with 201
// and the 3-photo cap is enforced with 400 on the 4th.
func TestUploadInspirationPhoto_SuccessAndLimit(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	for i := 0; i < 3; i++ {
		req, w := createInspirationMultipart(userID)
		UploadInspirationPhoto(w, req)
		if w.Code != http.StatusCreated {
			t.Fatalf("Upload #%d: expected 201, got %d: %s", i+1, w.Code, w.Body.String())
		}
		photo := unmarshalInspirationPhoto(w.Body.Bytes())
		if photo.ID == "" || photo.PhotoURL == "" {
			t.Errorf("Upload #%d: photo should have id and photoUrl", i+1)
		}
	}

	// 4th upload should be rejected
	req, w := createInspirationMultipart(userID)
	UploadInspirationPhoto(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("4th upload: expected 400, got %d: %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "Maximum of 3") {
		t.Errorf("Expected limit message, got: %s", w.Body.String())
	}
}

// TestUploadInspirationPhoto_InvalidFileType verifies non-image uploads get 400.
func TestUploadInspirationPhoto_InvalidFileType(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, _ := writer.CreateFormFile("photo", "notes.txt")
	part.Write([]byte("not an image"))
	writer.Close()

	req := httptest.NewRequest("POST", "/api/inspiration/photos", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()

	UploadInspirationPhoto(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for invalid file type, got %d: %s", w.Code, w.Body.String())
	}
}

// TestDeleteInspirationPhoto verifies an owner can delete their photo and
// that deleting a missing/foreign photo returns 404.
func TestDeleteInspirationPhoto(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	userID := seedTestUser(t)
	otherUserID := seedTestUser(t)

	// Upload a photo, then delete it
	req, w := createInspirationMultipart(userID)
	UploadInspirationPhoto(w, req)
	photo := unmarshalInspirationPhoto(w.Body.Bytes())

	delReq, delW := newRequest("DELETE", "/api/inspiration/photos/{photoId}", nil, userID)
	delReq.SetPathValue("photoId", photo.ID)
	DeleteInspirationPhoto(delW, delReq)
	if delW.Code != http.StatusOK {
		t.Fatalf("Delete: expected 200, got %d: %s", delW.Code, delW.Body.String())
	}

	// Deleting the same photo again → 404
	delReq2, delW2 := newRequest("DELETE", "/api/inspiration/photos/{photoId}", nil, userID)
	delReq2.SetPathValue("photoId", photo.ID)
	DeleteInspirationPhoto(delW2, delReq2)
	if delW2.Code != http.StatusNotFound {
		t.Errorf("Delete missing: expected 404, got %d", delW2.Code)
	}

	// Another user cannot delete the first user's photo → 404
	req2, w2 := createInspirationMultipart(userID)
	UploadInspirationPhoto(w2, req2)
	photo2 := unmarshalInspirationPhoto(w2.Body.Bytes())

	foreignReq, foreignW := newRequest("DELETE", "/api/inspiration/photos/{photoId}", nil, otherUserID)
	foreignReq.SetPathValue("photoId", photo2.ID)
	DeleteInspirationPhoto(foreignW, foreignReq)
	if foreignW.Code != http.StatusNotFound {
		t.Errorf("Delete foreign photo: expected 404, got %d", foreignW.Code)
	}
}

