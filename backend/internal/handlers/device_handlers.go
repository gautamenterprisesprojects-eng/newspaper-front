package handlers

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/enterprise/newspaper-portal-backend/internal/config"
	"github.com/enterprise/newspaper-portal-backend/internal/database"
	"github.com/gofiber/fiber/v2"
)

// ---------------------------------------------------------------------------
// Device binding
//
// An account may only be used from browsers that an admin explicitly enrolled
// through a one-time link. Publishers get one browser; the shared admin
// account gets four. An admin-trusted browser may sign into any publisher
// account without consuming that publisher's own slot -- otherwise the first
// support login would lock the real publisher out of their own account.
//
// Two secrets live in cookies, both httpOnly so page JavaScript can never
// read them, and both scoped to the parent domain so the generator subdomain
// sees them too:
//
//	pm_device -- the permanent device credential, issued once at binding
//	pm_enrol  -- a short-lived carrier for the one-time link's token, set
//	             when the browser opens /enrol and consumed by the next login
//
// Only hashes are stored. A database leak yields no usable credential.
// ---------------------------------------------------------------------------

const (
	deviceCookieName = "pm_device"
	enrolCookieName  = "pm_enrol"

	// A publisher gets exactly one browser; the shared admin account gets
	// four (two people, a laptop and a phone each).
	publisherDeviceSlots = 1
	adminDeviceSlots     = 4

	enrolTokenTTL  = 24 * time.Hour
	enrolCookieTTL = 30 * time.Minute

	// The generator launch token is deliberately long-lived and stateless.
	// It is NOT backed by a session cookie: in batch mode the generator runs
	// inside a hidden iframe, and iframe cookie behaviour varies with the
	// viewer's third-party-cookie settings -- a dependency that would fail
	// for one publisher on one browser and be near-impossible to diagnose.
	// Carrying the whole proof in the URL has no such failure mode, and six
	// hours means a long editing session survives a page refresh.
	generatorTokenTTL = 6 * time.Hour
)

// DeviceGateEnabled is the kill switch. False leaves every check below inert,
// so the whole feature can be switched off with one environment variable and
// a restart, at any hour, without touching code or data.
func DeviceGateEnabled() bool {
	v := strings.TrimSpace(strings.ToLower(os.Getenv("DEVICE_GATE_ENABLED")))
	return v == "true" || v == "1" || v == "yes"
}

// ClientIP is the visitor's own address. Fiber's ProxyHeader hands back the
// whole X-Forwarded-For chain ("122.175.210.152, 172.16.2.1") when a request
// crossed two proxies, as every request here does -- host nginx, then the
// compose nginx. The first entry is the client; the rest are our own hops and
// only make the audit trail harder to read.
func ClientIP(c *fiber.Ctx) string {
	raw := c.IP()
	if idx := strings.Index(raw, ","); idx >= 0 {
		raw = raw[:idx]
	}
	return strings.TrimSpace(raw)
}

func hashSecret(secret string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(secret)))
	return hex.EncodeToString(sum[:])
}

func randomSecret() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func deviceSlotsFor(role string) int {
	if strings.EqualFold(role, "ADMIN") || strings.EqualFold(role, "SUPER_ADMIN") {
		return adminDeviceSlots
	}
	return publisherDeviceSlots
}

func trustLevelFor(role string) string {
	if strings.EqualFold(role, "ADMIN") || strings.EqualFold(role, "SUPER_ADMIN") {
		return "admin"
	}
	return "publisher"
}

// liveDevice is one enrolled, unrevoked browser.
type liveDevice struct {
	ID          string `db:"id"`
	PublisherID string `db:"publisher_id"`
	TrustLevel  string `db:"trust_level"`
}

func lookupLiveDevice(secret string) (*liveDevice, bool) {
	if secret == "" || database.DB == nil {
		return nil, false
	}
	var d liveDevice
	err := database.DB.Get(&d,
		"SELECT id, publisher_id, trust_level FROM account_devices WHERE device_hash = $1 AND revoked_at IS NULL",
		hashSecret(secret))
	if err != nil {
		return nil, false
	}
	return &d, true
}

// pendingEnrolment is a one-time link that has not been used, cancelled or
// expired.
type pendingEnrolment struct {
	ID          string `db:"id"`
	PublisherID string `db:"publisher_id"`
}

func lookupPendingEnrolment(token string) (*pendingEnrolment, bool) {
	if token == "" || database.DB == nil {
		return nil, false
	}
	var e pendingEnrolment
	err := database.DB.Get(&e,
		`SELECT id, publisher_id FROM enrolment_tokens
		 WHERE token_hash = $1 AND used_at IS NULL AND cancelled_at IS NULL AND expires_at > NOW()`,
		hashSecret(token))
	if err != nil {
		return nil, false
	}
	return &e, true
}

func setDeviceCookie(c *fiber.Ctx, secret string) {
	c.Cookie(&fiber.Cookie{
		Name:     deviceCookieName,
		Value:    secret,
		Domain:   deviceCookieDomain(),
		Path:     "/",
		Expires:  time.Now().Add(10 * 365 * 24 * time.Hour),
		HTTPOnly: true,
		Secure:   true,
		// Lax, not Strict: the generator lives on a subdomain of the same
		// registrable domain, so this still reaches it, while a Strict
		// cookie would be withheld on navigations that arrive from the
		// dashboard.
		SameSite: "Lax",
	})
}

func clearEnrolCookie(c *fiber.Ctx) {
	c.Cookie(&fiber.Cookie{
		Name:     enrolCookieName,
		Value:    "",
		Domain:   deviceCookieDomain(),
		Path:     "/",
		Expires:  time.Now().Add(-time.Hour),
		HTTPOnly: true,
		Secure:   true,
		SameSite: "Lax",
	})
}

// The cookie must be visible to generator.<domain> as well as the portal, so
// it is set on the parent domain. Derived from FRONTEND_URL rather than
// hardcoded, so local development (localhost, no domain attribute) works.
func deviceCookieDomain() string {
	raw := strings.TrimSpace(config.FrontendURL())
	if raw == "" {
		return ""
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	host := parsed.Hostname()
	if host == "" || host == "localhost" || host == "127.0.0.1" {
		return ""
	}
	return host
}

// ---------------------------------------------------------------------------
// The login decision
// ---------------------------------------------------------------------------

// DeviceDecision is the outcome of the device check for one login attempt.
type DeviceDecision struct {
	Allowed        bool
	DeviceID       string
	ViaAdminDevice bool
	// Status is written to login_logs so a stuck publisher can be told apart
	// from someone probing the login endpoint.
	Status string
}

// CheckLoginDevice runs after the password has been verified. It never
// reveals which of the several failure reasons applied -- the caller returns
// one generic refusal -- but records the precise reason for the admin panel.
func CheckLoginDevice(c *fiber.Ctx, publisherID, role string) DeviceDecision {
	if !DeviceGateEnabled() {
		return DeviceDecision{Allowed: true, Status: "SUCCESS"}
	}

	// An already-enrolled browser.
	if device, ok := lookupLiveDevice(c.Cookies(deviceCookieName)); ok {
		isAdminDevice := device.TrustLevel == "admin"
		if isAdminDevice || device.PublisherID == publisherID {
			database.DB.Exec(
				"UPDATE account_devices SET last_seen = NOW(), last_ip = $1 WHERE id = $2",
				ClientIP(c), device.ID)
			return DeviceDecision{
				Allowed:  true,
				DeviceID: device.ID,
				// An admin browser signing into somebody else's account is
				// support activity, not that publisher working -- and it
				// spends their wallet, so the log has to distinguish it.
				ViaAdminDevice: isAdminDevice && device.PublisherID != publisherID,
				Status:         "SUCCESS",
			}
		}
		// A publisher's browser reaching for a different account.
		return DeviceDecision{Status: "DEVICE_BLOCKED"}
	}

	// An unenrolled browser carrying a live one-time link.
	enrolment, ok := lookupPendingEnrolment(c.Cookies(enrolCookieName))
	if !ok {
		return DeviceDecision{Status: "DEVICE_BLOCKED"}
	}
	// Tokens are account-bound: a link issued for cliffdemo1 cannot enrol a
	// browser against cliffdemo2, even with cliffdemo2's password.
	if enrolment.PublisherID != publisherID {
		return DeviceDecision{Status: "ENROLMENT_TOKEN_INVALID"}
	}

	var liveCount int
	if err := database.DB.Get(&liveCount,
		"SELECT COUNT(*) FROM account_devices WHERE publisher_id = $1 AND revoked_at IS NULL",
		publisherID); err != nil {
		log.Printf("device slot count failed for %s: %v", publisherID, err)
		return DeviceDecision{Status: "DEVICE_BLOCKED"}
	}
	if liveCount >= deviceSlotsFor(role) {
		return DeviceDecision{Status: "DEVICE_SLOTS_FULL"}
	}

	secret, err := randomSecret()
	if err != nil {
		log.Printf("device secret generation failed: %v", err)
		return DeviceDecision{Status: "DEVICE_BLOCKED"}
	}

	tx, err := database.DB.Beginx()
	if err != nil {
		log.Printf("device binding transaction failed to start: %v", err)
		return DeviceDecision{Status: "DEVICE_BLOCKED"}
	}
	defer tx.Rollback()

	var deviceID string
	if err := tx.QueryRow(
		`INSERT INTO account_devices (publisher_id, device_hash, trust_level, user_agent, first_ip, last_ip)
		 VALUES ($1, $2, $3, $4, $5, $5) RETURNING id`,
		publisherID, hashSecret(secret), trustLevelFor(role), c.Get("User-Agent"), ClientIP(c),
	).Scan(&deviceID); err != nil {
		log.Printf("device binding insert failed for %s: %v", publisherID, err)
		return DeviceDecision{Status: "DEVICE_BLOCKED"}
	}
	// Spending the token inside the same transaction as the bind is what
	// makes a one-time link genuinely one-time: two browsers racing the same
	// link cannot both end up enrolled.
	res, err := tx.Exec(
		"UPDATE enrolment_tokens SET used_at = NOW(), used_device_id = $1 WHERE id = $2 AND used_at IS NULL",
		deviceID, enrolment.ID)
	if err != nil {
		log.Printf("enrolment token spend failed: %v", err)
		return DeviceDecision{Status: "DEVICE_BLOCKED"}
	}
	if affected, _ := res.RowsAffected(); affected != 1 {
		return DeviceDecision{Status: "ENROLMENT_TOKEN_INVALID"}
	}
	if err := tx.Commit(); err != nil {
		log.Printf("device binding commit failed: %v", err)
		return DeviceDecision{Status: "DEVICE_BLOCKED"}
	}

	setDeviceCookie(c, secret)
	clearEnrolCookie(c)
	return DeviceDecision{Allowed: true, DeviceID: deviceID, Status: "SUCCESS"}
}

// DeviceIDForToken is what the JWT's device claim is checked against on every
// later API request, so a token copied to another machine stops working.
func DeviceIsLiveForAccount(deviceID, publisherID string) bool {
	if deviceID == "" || database.DB == nil {
		return false
	}
	var d liveDevice
	err := database.DB.Get(&d,
		"SELECT id, publisher_id, trust_level FROM account_devices WHERE id = $1 AND revoked_at IS NULL",
		deviceID)
	if err != nil {
		return false
	}
	return d.TrustLevel == "admin" || d.PublisherID == publisherID
}

// ---------------------------------------------------------------------------
// Enrolment: the publisher-facing half of a one-time link
// ---------------------------------------------------------------------------

// SaaSEnrolBegin is called by the /enrol page with the token from the link.
// It parks the token in a short-lived cookie and reports which account the
// link belongs to, so the login form can name it. It deliberately does not
// log anybody in -- the password is still required.
func SaaSEnrolBegin(c *fiber.Ctx) error {
	var body struct {
		Token string `json:"token"`
	}
	if err := c.BodyParser(&body); err != nil || strings.TrimSpace(body.Token) == "" {
		return c.Status(400).JSON(fiber.Map{"error": "यह लिंक अधूरा है. एडमिन से नया लिंक लें."})
	}

	enrolment, ok := lookupPendingEnrolment(body.Token)
	if !ok {
		return c.Status(410).JSON(fiber.Map{"error": "यह लिंक इस्तेमाल हो चुका है या 24 घंटे में expire हो गया. एडमिन से नया लिंक लें."})
	}

	var username string
	if err := database.DB.Get(&username, "SELECT username FROM publishers WHERE id = $1", enrolment.PublisherID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "अकाउंट नहीं मिला."})
	}

	c.Cookie(&fiber.Cookie{
		Name:     enrolCookieName,
		Value:    strings.TrimSpace(body.Token),
		Domain:   deviceCookieDomain(),
		Path:     "/",
		Expires:  time.Now().Add(enrolCookieTTL),
		HTTPOnly: true,
		Secure:   true,
		SameSite: "Lax",
	})

	return c.JSON(fiber.Map{"success": true, "username": username})
}

// ---------------------------------------------------------------------------
// The nginx gate
// ---------------------------------------------------------------------------

// SaaSDeviceCheck is what nginx's auth_request calls before serving any
// portal page. Body-less by design: nginx reads only the status code.
//
// A browser mid-enrolment (holding a live one-time link) passes too --
// otherwise the login page it needs would itself be blocked, and no new
// device could ever be enrolled.
func SaaSDeviceCheck(c *fiber.Ctx) error {
	if !DeviceGateEnabled() {
		return c.SendStatus(200)
	}
	if _, ok := lookupLiveDevice(c.Cookies(deviceCookieName)); ok {
		return c.SendStatus(200)
	}
	if _, ok := lookupPendingEnrolment(c.Cookies(enrolCookieName)); ok {
		return c.SendStatus(200)
	}
	return c.SendStatus(403)
}

// ---------------------------------------------------------------------------
// Generator launch tokens
// ---------------------------------------------------------------------------

func signGeneratorToken(publisherID string, expiry time.Time) string {
	payload := fmt.Sprintf("%s.%d", publisherID, expiry.Unix())
	mac := hmac.New(sha256.New, config.JWTSecret())
	mac.Write([]byte(payload))
	return payload + "." + hex.EncodeToString(mac.Sum(nil))
}

func verifyGeneratorToken(token string) bool {
	parts := strings.Split(strings.TrimSpace(token), ".")
	if len(parts) != 3 {
		return false
	}
	expiry, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil || time.Now().Unix() > expiry {
		return false
	}
	expected := signGeneratorToken(parts[0], time.Unix(expiry, 0))
	// Constant-time comparison: a byte-by-byte one leaks how much of a
	// forged signature was correct.
	return hmac.Equal([]byte(expected), []byte(strings.TrimSpace(token)))
}

// SaaSGeneratorLaunchToken is called by the dashboard immediately before it
// opens the generator (in a tab, or in the hidden iframe a batch run uses).
// The token proves "this came from a real dashboard launch"; without one the
// generator's own nginx serves nothing.
func SaaSGeneratorLaunchToken(c *fiber.Ctx) error {
	publisherID, _ := c.Locals("userID").(string)
	if publisherID == "" {
		return c.Status(401).JSON(fiber.Map{"error": "Not signed in."})
	}
	expiry := time.Now().Add(generatorTokenTTL)
	return c.JSON(fiber.Map{
		"launch_token": signGeneratorToken(publisherID, expiry),
		"expires_at":   expiry.UTC().Format(time.RFC3339),
	})
}

// SaaSGeneratorCheck is the generator subdomain's auth_request endpoint.
// nginx passes the original request line; the token rides in the query
// string, exactly like the launch parameters the dashboard already sends.
func SaaSGeneratorCheck(c *fiber.Ctx) error {
	if !DeviceGateEnabled() {
		return c.SendStatus(200)
	}
	original := c.Get("X-Original-URI")
	idx := strings.Index(original, "?")
	if idx < 0 {
		return c.SendStatus(403)
	}
	values, err := url.ParseQuery(original[idx+1:])
	if err != nil {
		return c.SendStatus(403)
	}
	if verifyGeneratorToken(values.Get("lt")) {
		return c.SendStatus(200)
	}
	return c.SendStatus(403)
}
