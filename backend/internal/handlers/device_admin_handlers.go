package handlers

import (
	"log"
	"strings"
	"time"

	"github.com/enterprise/newspaper-portal-backend/internal/config"
	"github.com/enterprise/newspaper-portal-backend/internal/database"
	"github.com/gofiber/fiber/v2"
)

// ---------------------------------------------------------------------------
// The admin side of device binding: see who is bound, issue a link, cut a
// device loose. Every handler below returns a plain reason on failure -- an
// admin locking a publisher out (or failing to unlock one) must never be left
// guessing what happened.
// ---------------------------------------------------------------------------

type adminDeviceRow struct {
	ID         string     `db:"id" json:"id"`
	TrustLevel string     `db:"trust_level" json:"trust_level"`
	UserAgent  string     `db:"user_agent" json:"user_agent"`
	FirstIP    string     `db:"first_ip" json:"first_ip"`
	LastIP     string     `db:"last_ip" json:"last_ip"`
	FirstSeen  time.Time  `db:"first_seen" json:"first_seen"`
	LastSeen   time.Time  `db:"last_seen" json:"last_seen"`
	RevokedAt  *time.Time `db:"revoked_at" json:"revoked_at"`
	// Set for the browser making this very request, so the panel can mark it
	// and an admin cannot unbind themselves by accident.
	IsCurrent bool `db:"-" json:"is_current"`
}

type adminAccountDevices struct {
	PublisherID   string           `json:"publisher_id"`
	Username      string           `json:"username"`
	NewspaperName string           `json:"newspaper_name"`
	Role          string           `json:"role"`
	SlotsUsed     int              `json:"slots_used"`
	SlotsTotal    int              `json:"slots_total"`
	Devices       []adminDeviceRow `json:"devices"`
	PendingLink   *pendingLinkInfo `json:"pending_link"`
}

type pendingLinkInfo struct {
	ExpiresAt time.Time `db:"expires_at" json:"expires_at"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
}

// SaaSAdminListDevices powers the whole डिवाइस screen in one request: every
// account, its bound browsers, its slot usage and any link still waiting to
// be used.
func SaaSAdminListDevices(c *fiber.Ctx) error {
	if database.DB == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Database unavailable."})
	}

	var accounts []struct {
		ID            string `db:"id"`
		Username      string `db:"username"`
		Role          string `db:"role"`
		NewspaperName string `db:"newspaper_name"`
	}
	if err := database.DB.Select(&accounts,
		`SELECT p.id, p.username, p.role, COALESCE(pr.newspaper_name, '') AS newspaper_name
		 FROM publishers p
		 LEFT JOIN publisher_profiles pr ON pr.publisher_id = p.id
		 WHERE p.is_active = TRUE
		 ORDER BY (p.role = 'ADMIN') DESC, p.username`); err != nil {
		log.Printf("device list: accounts query failed: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "Could not load the accounts."})
	}

	// Which device is asking, so the panel can mark "this browser".
	currentDeviceID := ""
	if device, ok := lookupLiveDevice(c.Cookies(deviceCookieName)); ok {
		currentDeviceID = device.ID
	}

	out := make([]adminAccountDevices, 0, len(accounts))
	for _, account := range accounts {
		entry := adminAccountDevices{
			PublisherID:   account.ID,
			Username:      account.Username,
			NewspaperName: account.NewspaperName,
			Role:          account.Role,
			SlotsTotal:    deviceSlotsFor(account.Role),
			Devices:       []adminDeviceRow{},
		}

		var devices []adminDeviceRow
		if err := database.DB.Select(&devices,
			`SELECT id, trust_level, user_agent, first_ip, last_ip, first_seen, last_seen, revoked_at
			 FROM account_devices WHERE publisher_id = $1 AND revoked_at IS NULL
			 ORDER BY first_seen`, account.ID); err != nil {
			log.Printf("device list: devices query failed for %s: %v", account.Username, err)
			return c.Status(500).JSON(fiber.Map{"error": "Could not load the bound devices."})
		}
		for i := range devices {
			devices[i].IsCurrent = devices[i].ID == currentDeviceID
		}
		entry.Devices = devices
		entry.SlotsUsed = len(devices)

		var pending pendingLinkInfo
		if err := database.DB.Get(&pending,
			`SELECT expires_at, created_at FROM enrolment_tokens
			 WHERE publisher_id = $1 AND used_at IS NULL AND cancelled_at IS NULL AND expires_at > NOW()
			 ORDER BY created_at DESC LIMIT 1`, account.ID); err == nil {
			entry.PendingLink = &pending
		}

		out = append(out, entry)
	}

	return c.JSON(fiber.Map{
		"gate_enabled": DeviceGateEnabled(),
		"accounts":     out,
	})
}

// SaaSAdminIssueEnrolmentLink mints the one-time link an admin sends over
// WhatsApp. Any link already outstanding for that account is cancelled, so
// there is never more than one live link per account to keep track of.
//
// The raw token is returned exactly once, here. Only its hash is stored, so
// a link that gets lost cannot be recovered -- it has to be re-issued.
func SaaSAdminIssueEnrolmentLink(c *fiber.Ctx) error {
	publisherID := strings.TrimSpace(c.Params("publisher_id"))
	if publisherID == "" {
		return c.Status(400).JSON(fiber.Map{"error": "publisher_id is required."})
	}
	if database.DB == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Database unavailable."})
	}

	var account struct {
		Username string `db:"username"`
		Role     string `db:"role"`
	}
	if err := database.DB.Get(&account,
		"SELECT username, role FROM publishers WHERE id = $1 AND is_active = TRUE", publisherID); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "That account does not exist or is suspended."})
	}

	// Refusing here rather than issuing a link that is guaranteed to fail at
	// binding time: the admin needs to unbind first, and should be told so
	// now rather than after the publisher has already tried it.
	var liveCount int
	if err := database.DB.Get(&liveCount,
		"SELECT COUNT(*) FROM account_devices WHERE publisher_id = $1 AND revoked_at IS NULL",
		publisherID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Could not count the existing devices."})
	}
	if liveCount >= deviceSlotsFor(account.Role) {
		return c.Status(409).JSON(fiber.Map{
			"error": "इस अकाउंट के सारे device slots भरे हैं. पहले कोई device unbind करें, फिर नया लिंक बनाएं.",
		})
	}

	token, err := randomSecret()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Could not generate a secure link."})
	}
	adminUsername, _ := c.Locals("username").(string)
	expiresAt := time.Now().Add(enrolTokenTTL)

	tx, err := database.DB.Beginx()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed starting transaction."})
	}
	defer tx.Rollback()

	if _, err := tx.Exec(
		`UPDATE enrolment_tokens SET cancelled_at = NOW()
		 WHERE publisher_id = $1 AND used_at IS NULL AND cancelled_at IS NULL`, publisherID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Could not cancel the previous link."})
	}
	if _, err := tx.Exec(
		`INSERT INTO enrolment_tokens (publisher_id, token_hash, expires_at, created_by)
		 VALUES ($1, $2, $3, $4)`, publisherID, hashSecret(token), expiresAt, adminUsername); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Could not store the new link."})
	}
	if err := tx.Commit(); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed finalizing the link."})
	}

	return c.JSON(fiber.Map{
		"success":    true,
		"username":   account.Username,
		"link":       strings.TrimRight(config.FrontendURL(), "/") + "/enrol?t=" + token,
		"expires_at": expiresAt.UTC().Format(time.RFC3339),
		"message":    "लिंक बन गया. 24 घंटे में इस्तेमाल करना ज़रूरी है.",
	})
}

// SaaSAdminRevokeDevice cuts one browser loose. The row is kept and stamped
// rather than deleted, so the audit trail survives and the same cookie can
// never be silently accepted again.
func SaaSAdminRevokeDevice(c *fiber.Ctx) error {
	deviceID := strings.TrimSpace(c.Params("device_id"))
	if deviceID == "" {
		return c.Status(400).JSON(fiber.Map{"error": "device_id is required."})
	}
	if database.DB == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Database unavailable."})
	}

	// Refusing to let an admin unbind the browser they are sitting at: with
	// the gate on, that is an immediate self-lockout requiring SSH to undo.
	if device, ok := lookupLiveDevice(c.Cookies(deviceCookieName)); ok && device.ID == deviceID {
		return c.Status(409).JSON(fiber.Map{
			"error": "यह वही browser है जिससे आप अभी लॉगिन हैं. इसे unbind नहीं कर सकते.",
		})
	}

	adminUsername, _ := c.Locals("username").(string)
	res, err := database.DB.Exec(
		"UPDATE account_devices SET revoked_at = NOW(), revoked_by = $1 WHERE id = $2 AND revoked_at IS NULL",
		adminUsername, deviceID)
	if err != nil {
		log.Printf("device revoke failed for %s: %v", deviceID, err)
		return c.Status(500).JSON(fiber.Map{"error": "Device unbind नहीं हो पाया."})
	}
	if affected, _ := res.RowsAffected(); affected == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "यह device पहले ही unbind हो चुका है."})
	}

	return c.JSON(fiber.Map{"success": true, "message": "Device unbind हो गया. अब नया enrolment लिंक भेजें."})
}

// SaaSAdminDeviceBlocks is the "is a publisher stuck, or is someone probing
// us?" feed -- the refusals the gate produced, newest first.
func SaaSAdminDeviceBlocks(c *fiber.Ctx) error {
	if database.DB == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Database unavailable."})
	}
	var rows []struct {
		Username  string    `db:"username" json:"username"`
		IPAddress string    `db:"ip_address" json:"ip_address"`
		UserAgent string    `db:"user_agent" json:"user_agent"`
		Status    string    `db:"status" json:"status"`
		LoginTime time.Time `db:"login_time" json:"login_time"`
	}
	if err := database.DB.Select(&rows,
		`SELECT username, COALESCE(ip_address, '') AS ip_address, COALESCE(user_agent, '') AS user_agent,
		        status, login_time
		 FROM login_logs
		 WHERE status IN ('DEVICE_BLOCKED', 'DEVICE_SLOTS_FULL', 'ENROLMENT_TOKEN_INVALID')
		 ORDER BY login_time DESC LIMIT 50`); err != nil {
		log.Printf("device blocks query failed: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "Could not load the blocked attempts."})
	}
	return c.JSON(fiber.Map{"blocks": rows})
}
