package config

import (
	"bufio"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"log"
	"os"
	"strings"
	"sync"
)

// LoadEnvFile reads a KEY=VALUE .env file into the process environment.
// Variables already present in the real environment win, so container-provided
// configuration is never overwritten by a checked-in file.
func LoadEnvFile(path string) {
	f, err := os.Open(path)
	if err != nil {
		return // absent .env is normal in container deployments
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		key, value, found := strings.Cut(line, "=")
		if !found {
			continue
		}

		key = strings.TrimSpace(key)
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		if key == "" {
			continue
		}
		if _, exists := os.LookupEnv(key); !exists {
			_ = os.Setenv(key, value)
		}
	}
}

var (
	jwtSecretOnce sync.Once
	jwtSecret     []byte
)

// JWTSecret returns the HMAC signing key for access tokens.
//
// If JWT_SECRET is unset, a random key is generated for this process rather
// than falling back to a constant: a hardcoded default that ships in the source
// tree lets anyone mint valid admin tokens. The cost is that tokens do not
// survive a restart, which the warning calls out.
func JWTSecret() []byte {
	jwtSecretOnce.Do(func() {
		if s := os.Getenv("JWT_SECRET"); s != "" {
			jwtSecret = []byte(s)
			return
		}

		buf := make([]byte, 32)
		if _, err := rand.Read(buf); err != nil {
			log.Fatalf("❌ JWT_SECRET is unset and no secure random source is available: %v", err)
		}
		jwtSecret = []byte(hex.EncodeToString(buf))
		log.Println("⚠️ [Security] JWT_SECRET is not set. Generated an ephemeral signing key for this process; all sessions will be invalidated on restart. Set JWT_SECRET in the environment or backend/.env.")
	})
	return jwtSecret
}

// FrontendURL returns the origin of the publisher-facing app, used to build
// the login link printed on the credentials PDF.
func FrontendURL() string {
	if v := os.Getenv("FRONTEND_URL"); v != "" {
		return strings.TrimRight(v, "/")
	}
	return "http://localhost:3001"
}

var (
	credsKeyOnce sync.Once
	credsKey     []byte
)

// CredentialsEncryptionKey returns the AES-256 key used to store publisher
// passwords in a form admins can retrieve (see pkg/secure). This is separate
// from the bcrypt hash used for login, which cannot be reversed.
//
// Same pattern as JWTSecret: if CREDENTIALS_ENCRYPTION_KEY is unset, a random
// key is generated for this process. Passwords encrypted under an ephemeral
// key become undecryptable after a restart — the admin "view password" field
// falls back to "not available" for those rows, but login is unaffected since
// it only ever uses the bcrypt hash.
func CredentialsEncryptionKey() []byte {
	credsKeyOnce.Do(func() {
		if s := os.Getenv("CREDENTIALS_ENCRYPTION_KEY"); s != "" {
			sum := sha256.Sum256([]byte(s))
			credsKey = sum[:]
			return
		}

		buf := make([]byte, 32)
		if _, err := rand.Read(buf); err != nil {
			log.Fatalf("❌ CREDENTIALS_ENCRYPTION_KEY is unset and no secure random source is available: %v", err)
		}
		credsKey = buf
		log.Println("⚠️ [Security] CREDENTIALS_ENCRYPTION_KEY is not set. Generated an ephemeral key for this process; publisher passwords stored before a restart will show as unavailable in the admin panel. Set CREDENTIALS_ENCRYPTION_KEY in the environment or backend/.env.")
	})
	return credsKey
}
