package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// geminiKey holds the Google Gemini API key loaded from config at startup.
// When empty, AI endpoints fall back to simulated responses.
var geminiKey string

// geminiModel holds the Gemini model name loaded from config at startup.
// Defaults to "gemini-3.5-flash" if not configured.
var geminiModel string

// DefaultGeminiModel is the default model used for AI Coach chat and food scans.
// The project is locked to gemini-3.5-flash; no other AI provider or model is used.
const DefaultGeminiModel = "gemini-3.5-flash"

// ErrQuotaExceeded is returned when the Gemini API reports that the
// free-tier/request quota has been exhausted (HTTP 429 / RESOURCE_EXHAUSTED).
var ErrQuotaExceeded = errors.New("gemini quota exceeded")

// geminiLimitMessage is the user-facing message shown when the Gemini
// free-tier quota has been exhausted.
const geminiLimitMessage = "Mimi's daily AI limit has been used up. Please try again later."

// geminiFoodScanLimitMessage is the user-facing message shown when the Gemini
// free-tier quota has been exhausted for the food scanner.
const geminiFoodScanLimitMessage = "The AI food scanning limit has been used up. Please try again later."

// geminiHTTPClient is the HTTP client used for Gemini API calls.
// It is package-level so tests can substitute a mock server.
// Per-request timeouts are enforced via context in callGemini/streamGemini.
var geminiHTTPClient = &http.Client{}

// geminiChatTimeout is the maximum time to wait for a non-streaming chat reply.
const geminiChatTimeout = 30 * time.Second

// geminiStreamTimeout is the maximum time to wait for a streaming reply.
const geminiStreamTimeout = 60 * time.Second

// InitGeminiKey sets the global Gemini API key.
// Called from main.go during startup with the server-level GEMINI_API_KEY.
func InitGeminiKey(key string) {
	geminiKey = key
}

// InitGeminiModel sets the global Gemini model name.
// Called from main.go during startup with the server-level GEMINI_MODEL.
func InitGeminiModel(model string) {
	if model == "" {
		model = DefaultGeminiModel
	}
	geminiModel = model
}

// GeminiModel returns the currently configured Gemini model name.
func GeminiModel() string {
	if geminiModel == "" {
		return DefaultGeminiModel
	}
	return geminiModel
}

// callGemini sends a request body to the Gemini generateContent endpoint for the
// given model and returns the parsed response. Returns an non-nil error on any
// network, HTTP, or parsing failure.
func callGemini(model string, reqBody geminiGenerateRequest) (*geminiGenerateResponse, error) {
	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", model, geminiKey)
	httpReq, err := http.NewRequest("POST", url, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	ctx, cancel := context.WithTimeout(context.Background(), geminiChatTimeout)
	defer cancel()

	resp, err := geminiHTTPClient.Do(httpReq.WithContext(ctx))
	if err != nil {
		return nil, fmt.Errorf("api call: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, ErrQuotaExceeded
	}

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	var geminiResp geminiGenerateResponse
	if err := json.Unmarshal(respBytes, &geminiResp); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}

	if geminiResp.Error != nil {
		if geminiResp.Error.Code == 429 {
			return nil, ErrQuotaExceeded
		}
		return nil, fmt.Errorf("gemini API error (%d): %s", geminiResp.Error.Code, geminiResp.Error.Message)
	}

	if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("gemini returned no candidates")
	}

	return &geminiResp, nil
}

// geminiStreamChunk represents a single chunk from Gemini's streamGenerateContent endpoint.
type geminiStreamChunk struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
	Error *struct {
		Message string `json:"message"`
		Code    int    `json:"code"`
	} `json:"error,omitempty"`
}

// streamGemini sends a request to Gemini's streamGenerateContent endpoint and
// calls the provided callback for each text chunk received. It returns the
// complete concatenated text and any error encountered.
func streamGemini(model string, reqBody geminiGenerateRequest, onChunk func(string)) (string, error) {
	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:streamGenerateContent?key=%s", model, geminiKey)
	httpReq, err := http.NewRequest("POST", url, bytes.NewReader(jsonBody))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	ctx, cancel := context.WithTimeout(context.Background(), geminiStreamTimeout)
	defer cancel()

	resp, err := geminiHTTPClient.Do(httpReq.WithContext(ctx))
	if err != nil {
		return "", fmt.Errorf("api call: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		return "", ErrQuotaExceeded
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("gemini API returned status %d: %s", resp.StatusCode, string(body))
	}

	var fullText strings.Builder

	// Gemini's streamGenerateContent returns a JSON array of chunks. Use a
	// json.Decoder so we don't have to manually strip array brackets/commas.
	decoder := json.NewDecoder(resp.Body)
	token, err := decoder.Token()
	if err != nil {
		return fullText.String(), fmt.Errorf("read stream token: %w", err)
	}

	delim, ok := token.(json.Delim)
	if !ok || delim != '[' {
		return fullText.String(), fmt.Errorf("unexpected stream start token: %v", token)
	}

	for decoder.More() {
		var chunk geminiStreamChunk
		if err := decoder.Decode(&chunk); err != nil {
			return fullText.String(), fmt.Errorf("decode stream chunk: %w", err)
		}

		if chunk.Error != nil {
			return fullText.String(), fmt.Errorf("gemini API error (%d): %s", chunk.Error.Code, chunk.Error.Message)
		}

		if len(chunk.Candidates) > 0 && len(chunk.Candidates[0].Content.Parts) > 0 {
			text := chunk.Candidates[0].Content.Parts[0].Text
			if text != "" {
				fullText.WriteString(text)
				if onChunk != nil {
					onChunk(text)
				}
			}
		}
	}

	return fullText.String(), nil
}

// geminiGenerateRequest is the request body sent to the Gemini generateContent endpoint.
type geminiGenerateRequest struct {
	Contents         []geminiContent        `json:"contents"`
	SystemInstruction *geminiContent          `json:"systemInstruction,omitempty"`
	GenerationConfig geminiGenerationConfig `json:"generationConfig"`
}

type geminiContent struct {
	Role  string       `json:"role,omitempty"`
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text       string            `json:"text,omitempty"`
	InlineData *geminiInlineData `json:"inline_data,omitempty"`
}

type geminiInlineData struct {
	MimeType string `json:"mime_type"`
	Data     string `json:"data"`
}

type geminiGenerationConfig struct {
	ResponseMimeType string `json:"responseMimeType"`
}

// geminiGenerateResponse mirrors the top-level response from Gemini generateContent.
type geminiGenerateResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
	Error *struct {
		Message string `json:"message"`
		Code    int    `json:"code"`
	} `json:"error,omitempty"`
}
