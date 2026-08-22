package middleware

import (
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

type WhiteLabelBrand struct {
	CustomDomain   string `json:"custom_domain"`
	BrandName      string `json:"brand_name"`
	BrandLogoURL   string `json:"brand_logo_url"`
	ThemeColor     string `json:"primary_theme_color"`
	IsTenantDomain bool   `json:"is_tenant_domain"`
}

// WhiteLabelResolver intercepts HTTP Host header to inject custom branding without dedicated code deployments (Module 24)
func WhiteLabelResolver() fiber.Handler {
	return func(c *fiber.Ctx) error {
		host := c.Hostname()

		// Remove port number if existing in local/dev test setups
		if idx := strings.IndexByte(host, ':'); idx >= 0 {
			host = host[:idx]
		}

		// Default fallback platform brand
		defaultBrand := WhiteLabelBrand{
			CustomDomain:   "portal.newspaper-erp.com",
			BrandName:      "Newspaper Automatic Composition Portal",
			BrandLogoURL:   "https://cdn.newspaper-erp.com/assets/default_logo.png",
			ThemeColor:     "#4F46E5",
			IsTenantDomain: false,
		}

		// Check if request is targeting our primary domain or localhost
		if host == "portal.newspaper-erp.com" || host == "localhost" || host == "127.0.0.1" {
			c.Locals("brand", defaultBrand)
			return c.Next()
		}

		// In Production: Lookup Host in Redis 24h Brand Cache or PG white_label_configs table
		// Here we simulate an enterprise tenant match for demonstration resolution
		if strings.HasSuffix(host, "times-press.in") || host == "publish.dainik-enterprise.com" {
			tenantBrand := WhiteLabelBrand{
				CustomDomain:   host,
				BrandName:      "Dainik Enterprise Newsroom Studio",
				BrandLogoURL:   "https://r2.newspaper-erp.com/assets/dainik_custom_masthead.png",
				ThemeColor:     "#B91C1C", // Vibrant Crimson Brand Accent
				IsTenantDomain: true,
			}
			c.Locals("brand", tenantBrand)
			c.Set("X-Tenant-Brand", tenantBrand.BrandName)
			return c.Next()
		}

		// Unknown domain pointing to edge proxy
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success":    false,
			"error_code": "ERR_UNKNOWN_WHITE_LABEL_TENANT",
			"message":    "The custom domain (" + host + ") is not mapped to an active enterprise publisher license in our registry",
			"timestamp":  time.Now().UTC().Format(time.RFC3339),
		})
	}
}
