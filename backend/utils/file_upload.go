// Package utils — file handling helpers for uploads.
// Handles profile pictures, food photos, and other file uploads.
package utils

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

// AllowedImageExts lists the file extensions accepted for uploads.
var AllowedImageExts = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
	".webp": true,
}

// MaxUploadSize is the maximum allowed file upload size (10 MB).
const MaxUploadSize = 10 << 20 // 10 MB in bytes

// SaveUpload saves an uploaded file to the uploads directory.
// It generates a unique UUID-based filename to prevent collisions.
// Returns the relative path to the saved file (e.g., "uploads/abc123.jpg").
func SaveUpload(file io.Reader, originalFilename string, uploadDir string) (string, error) {
	// ── Validate file extension ────────────────────────────────────
	ext := strings.ToLower(filepath.Ext(originalFilename))
	if !AllowedImageExts[ext] {
		return "", fmt.Errorf("invalid file type: %s (allowed: jpg, jpeg, png, webp)", ext)
	}

	// ── Ensure upload directory exists ─────────────────────────────
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create upload directory: %w", err)
	}

	// ── Generate unique filename ───────────────────────────────────
	// UUID prevents collisions and path traversal attacks.
	filename := fmt.Sprintf("%s%s", uuid.New().String(), ext)
	filePath := filepath.Join(uploadDir, filename)

	// ── Write the file to disk ─────────────────────────────────────
	dst, err := os.Create(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to create file: %w", err)
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		os.Remove(filePath) // Clean up partial file
		return "", fmt.Errorf("failed to write file: %w", err)
	}

	return fmt.Sprintf("/uploads/%s", filename), nil
}

// DeleteFile removes a file from the uploads directory.
// The path should be the relative path (e.g., "/uploads/abc123.jpg" or "abc123.jpg").
// Returns silently if the file doesn't exist (idempotent).
func DeleteFile(path string) error {
	// Strip the /uploads/ prefix if present
	filename := strings.TrimPrefix(path, "/uploads/")
	filePath := filepath.Join("uploads", filename)

	if err := os.Remove(filePath); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
