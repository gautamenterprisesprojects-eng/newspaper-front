package middleware

import (
	"fmt"
	"strings"
	"time"

	"github.com/enterprise/newspaper-portal-backend/internal/config"
	"github.com/enterprise/newspaper-portal-backend/internal/database"
	"github.com/enterprise/newspaper-portal-backend/internal/handlers"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/helmet"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type UserClaims struct {
	UserID         uuid.UUID
	OrganizationID uuid.UUID
	RoleName       string
	Username       string
}

// SecurityHelmet injects robust HTTP response security headers
func SecurityHelmet() fiber.Handler {
	return helmet.New(helmet.Config{
		XSSProtection:         "1; mode=block",
		ContentTypeNosniff:    "nosniff",
		XFrameOptions:         "DENY",
		HSTSMaxAge:            63072000,
		HSTSPreloadEnabled:    true,
		ContentSecurityPolicy: "default-src 'self'; img-src 'self' data: https://*.cloudflare.com; style-src 'self' 'unsafe-inline'; frame-ancestors 'none';",
	})
}

// ZeroTrustAuth verifies the Bearer token's signature and expiry, then injects
// the token's own claims into the request context.
func ZeroTrustAuth() fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success":    false,
				"error_code": "ERR_UNAUTHORIZED",
				"message":    "Missing or malformed Authorization Bearer token",
				"timestamp":  time.Now().UTC().Format(time.RFC3339),
			})
		}

		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

		claims := jwt.MapClaims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
			// Reject anything that is not HMAC, so an attacker cannot swap the
			// algorithm (e.g. to "none" or RS256 with a chosen public key).
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return config.JWTSecret(), nil
		}, jwt.WithValidMethods([]string{"HS256"}))

		if err != nil || !token.Valid {
			errorCode := "ERR_TOKEN_INVALID"
			message := "Access token is invalid"
			if strings.Contains(strings.ToLower(fmt.Sprint(err)), "expired") {
				errorCode = "ERR_TOKEN_EXPIRED"
				message = "Access token has expired; please sign in again"
			}
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success":    false,
				"error_code": errorCode,
				"message":    message,
				"timestamp":  time.Now().UTC().Format(time.RFC3339),
			})
		}

		userID := stringClaim(claims, "sub")

		// A signed, unexpired token alone isn't enough -- an admin suspending
		// a publisher (setting is_active = false) needs that to take effect
		// immediately, not wait out the token's own 72-hour expiry. One
		// lightweight lookup per request; skipped only if the DB itself isn't
		// up (matches the rest of this codebase's DB-optional dev fallback).
		if database.DB != nil && userID != "" {
			var isActive bool
			err := database.DB.Get(&isActive, "SELECT is_active FROM publishers WHERE id = $1", userID)
			if err != nil || !isActive {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
					"success":    false,
					"error_code": "ERR_ACCOUNT_SUSPENDED",
					"message":    "This account has been suspended or no longer exists",
					"timestamp":  time.Now().UTC().Format(time.RFC3339),
				})
			}
		}

		// A validly signed token is still not enough once the device gate is
		// on: it must have been issued to a browser that is still enrolled.
		// This is what stops a token being lifted off the bound browser and
		// replayed from somewhere else -- the login check alone cannot,
		// since it never runs again for the token's whole 72-hour life.
		// Tokens minted before the gate existed carry no claim at all, which
		// is why the cutover invalidates every outstanding session.
		if handlers.DeviceGateEnabled() && userID != "" {
			deviceID := stringClaim(claims, "did")
			if !handlers.DeviceIsLiveForAccount(deviceID, userID) {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
					"success":    false,
					"error_code": "ERR_DEVICE_NOT_ENROLLED",
					"message":    "यह डिवाइस अब अधिकृत नहीं है. एडमिन से संपर्क करें: 9303108665",
					"timestamp":  time.Now().UTC().Format(time.RFC3339),
				})
			}
		}

		// Inject the verified claims (never hardcoded identities) into context
		c.Locals("userID", userID)
		c.Locals("role", stringClaim(claims, "role"))
		c.Locals("username", stringClaim(claims, "username"))

		return c.Next()
	}
}

func stringClaim(claims jwt.MapClaims, key string) string {
	if v, ok := claims[key].(string); ok {
		return v
	}
	return ""
}

// RequireRole enforces strict RBAC matrix permissions on specific API groups
func RequireRole(allowedRoles ...string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userRole, ok := c.Locals("role").(string)
		if !ok {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"success":    false,
				"error_code": "ERR_FORBIDDEN_RBAC",
				"message":    "Access denied: unable to identify active user security role",
			})
		}

		for _, allowed := range allowedRoles {
			if strings.EqualFold(userRole, allowed) || strings.EqualFold(userRole, "SUPER_ADMIN") {
				return c.Next()
			}
		}

		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"success":    false,
			"error_code": "ERR_FORBIDDEN_RBAC",
			"message":    "Access denied: your assigned role (" + userRole + ") lacks sufficient RBAC privileges for this operation",
			"timestamp":  time.Now().UTC().Format(time.RFC3339),
		})
	}
}
