.PHONY: run build test clean

# Run the server
run:
	go run .

# Build the binary
build:
	go build -o resolution-server .

# Run tests
test:
	go test ./tests/... -v

# Run all tests with coverage
test-cover:
	go test ./tests/... -cover

# Clean build artifacts
clean:
	rm -f resolution-server

# Download dependencies
deps:
	go mod tidy

# Format code
fmt:
	gofmt -w .
