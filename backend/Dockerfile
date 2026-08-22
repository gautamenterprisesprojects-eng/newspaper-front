# Stage 1: Compile Enterprise API Server Binary
FROM golang:1.26-alpine AS builder
WORKDIR /app
RUN apk add --no-cache git ca-certificates tzdata
COPY go.mod go.sum ./
# Download dependencies
RUN go mod download
COPY . .
# Compile Go application without CGO for lightweight scratch/alpine execution
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /newspaper-api ./cmd/api

# Stage 2: Production Lightweight Execution Image
FROM alpine:3.19 AS production
WORKDIR /app
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo
COPY --from=builder /newspaper-api /app/newspaper-api
COPY ./migrations_v2 /app/migrations_v2

# KNOWN GAP: publisher credential PDFs (pkg/creds) are rendered via a locally
# installed Chromium-family browser (see pkg/creds/pdf.go), needed for correct
# Devanagari text shaping. This Alpine image does not include one, so
# /saas-admin/request/approve and /saas-admin/publishers/:id/reset-password
# will fail here until a headless-capable Chromium is added to this image
# (e.g. `apk add chromium` plus its required shared libraries and appropriate
# --no-sandbox handling) or those calls are routed to a service that has one.

EXPOSE 8080
USER 1001:1001
ENTRYPOINT ["/app/newspaper-api"]
