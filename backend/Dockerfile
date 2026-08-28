# ── Resolution Fitness — Backend Dockerfile ────────────────────────────
# Multi-stage build: compile the pure-Go binary, then copy it into a
# minimal Alpine runtime image.
#
# Build:        docker build -t resolution-backend -f backend/Dockerfile backend
# Run:          docker run -p 8080:8080 --env-file backend/.env -v resolution-data:/app/data resolution-backend
# Health check: http://localhost:8080/api/health

# ── Stage 1: Build ─────────────────────────────────────────────────────
FROM golang:1.25-alpine AS builder

WORKDIR /src

# Cache module downloads separately from source changes.
COPY go.mod go.sum ./
RUN go mod download

# Copy source and build a static binary (CGO disabled — pure-Go SQLite).
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/resolution-server .

# ── Stage 2: Runtime ───────────────────────────────────────────────────
FROM alpine:3.21

# ca-certificates for HTTPS calls to Gemini/Google/Overpass APIs,
# tzdata for correct local time handling.
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S app && adduser -S app -G app

WORKDIR /app

COPY --from=builder /out/resolution-server /app/resolution-server

# Writable directories: SQLite database lives in /app/data,
# user uploads (profile pics, food photos) in /app/uploads.
RUN mkdir -p /app/data /app/uploads \
    && chown -R app:app /app

USER app

ENV PORT=8080 \
    DB_PATH=/app/data/database.db \
    APP_ENV=production

EXPOSE 8080

# Volumes make database + uploads survive container restarts.
VOLUME ["/app/data", "/app/uploads"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://localhost:8080/api/health || exit 1

CMD ["./resolution-server"]
