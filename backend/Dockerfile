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

# Publisher credential PDFs (pkg/creds) are rendered via a headless
# Chromium-family browser (see pdf.go's findBrowser/renderHTMLToPDF, which
# already passes --no-sandbox for exactly this containerized-root-less
# scenario) -- without it, /saas-admin/publishers/create,
# /saas-admin/request/approve, and /saas-admin/publishers/:id/reset-password
# all fail outright, since PDF generation runs before any DB write. The Noto
# Devanagari font is required for the Hindi publisher/newspaper names on
# that PDF to render as real glyphs instead of tofu boxes.
RUN apk add --no-cache chromium font-noto ttf-dejavu \
    && ln -sf /usr/lib/chromium/chrome /usr/bin/chromium 2>/dev/null || true

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo
COPY --from=builder /newspaper-api /app/newspaper-api
COPY ./migrations_v2 /app/migrations_v2

# Chromium writes its profile/config dir under $HOME, which is otherwise
# unset for this non-root user -- it then tries (and fails) to create
# /.config, since /  isn't writable by uid 1001. /tmp is world-writable.
ENV HOME=/tmp

EXPOSE 8080
USER 1001:1001
ENTRYPOINT ["/app/newspaper-api"]
