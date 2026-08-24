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

# Chromium resolves its profile/config directory via glib's getpwuid(), not
# the $HOME env var -- uid 1001 had no /etc/passwd entry, so glib fell back
# to "/" regardless of $HOME, and Chrome failed trying to mkdir /.config
# (confirmed live: setting ENV HOME alone did not fix it). A real passwd
# entry with a writable home directory fixes this at the source.
RUN addgroup -g 1001 -S appuser \
    && adduser -u 1001 -S -G appuser -h /home/appuser -s /sbin/nologin appuser \
    && mkdir -p /home/appuser \
    && chown -R appuser:appuser /home/appuser

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo
COPY --from=builder /newspaper-api /app/newspaper-api
COPY ./migrations_v2 /app/migrations_v2

ENV HOME=/home/appuser

EXPOSE 8080
USER 1001:1001
ENTRYPOINT ["/app/newspaper-api"]
