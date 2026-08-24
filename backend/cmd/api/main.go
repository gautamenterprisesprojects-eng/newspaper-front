package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/enterprise/newspaper-portal-backend/internal/config"
	"github.com/enterprise/newspaper-portal-backend/internal/database"
	"github.com/enterprise/newspaper-portal-backend/internal/handlers"
	"github.com/enterprise/newspaper-portal-backend/internal/middleware"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
)

func main() {
	log.Println("⚡ Bootstrapping Newspaper Generator Studio SaaS (Canva/Figma Inspired Publisher Platform)...")

	// Load backend/.env when present; real environment variables always win.
	config.LoadEnvFile(".env")

	// Initialize PostgreSQL Connection Pool & Run 3NF SaaS Migrations
	_, err := database.InitDB()
	if err != nil {
		log.Println("⚠️ Proceeding with memory/stub fallback mode while database connection is addressed.")
	}

	app := fiber.New(fiber.Config{
		AppName:               "Newspaper Generator Studio SaaS v1.0",
		ReadTimeout:           30 * time.Second,
		WriteTimeout:          60 * time.Second,
		DisableStartupMessage: false,
		// Fiber's 4MB default is too small once the setup wizard's front/inside
		// header images are sent as base64 data URLs in the JSON body.
		BodyLimit: 20 * 1024 * 1024,
	})

	// Security & Observability Defenses
	app.Use(recover.New())
	app.Use(logger.New(logger.Config{
		Format: "[${time}] ${status} - ${latency} ${method} ${path} - Host: ${host}\n",
	}))
	allowedOrigins := os.Getenv("CORS_ALLOWED_ORIGINS")
	if allowedOrigins == "" {
		allowedOrigins = "http://localhost:3000, http://127.0.0.1:3000, http://localhost:3001, http://127.0.0.1:3001, https://studio.newspaper-generator.com"
	}
	app.Use(cors.New(cors.Config{
		AllowOrigins:     allowedOrigins,
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization, X-Requested-With",
		AllowMethods:     "GET, POST, PUT, DELETE, OPTIONS",
		AllowCredentials: true,
	}))
	app.Use(middleware.SecurityHelmet())

	// Health Check Target
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.Status(fiber.StatusOK).JSON(fiber.Map{
			"status":    "HEALTHY 🟢",
			"timestamp": time.Now().UTC().Format(time.RFC3339),
			"engine":    "Newspaper Generator Studio SaaS / PostgreSQL 16 / Cloudflare R2 / Razorpay",
		})
	})

	// -------------------------------------------------------------------------
	// PUBLIC LANDING & AUTHENTICATION ENDPOINTS
	// -------------------------------------------------------------------------
	auth := app.Group("/api/v1/auth")
	auth.Post("/login", handlers.SaaSAuthLogin)
	auth.Post("/request-access", handlers.SaaSRequestAccess)
	auth.Get("/pricing", handlers.SaaSGetPricing)

	// -------------------------------------------------------------------------
	// PUBLISHER WORKSPACE & SETUP WIZARD ENDPOINTS
	// -------------------------------------------------------------------------
	pub := app.Group("/api/v1/publisher", middleware.ZeroTrustAuth())
	pub.Post("/wizard-complete", handlers.SaaSCompleteWizard)
	pub.Get("/profile/:publisher_id", handlers.SaaSGetProfile)
	pub.Post("/settings", handlers.SaaSSaveSettings)
	pub.Get("/wallet/:publisher_id", handlers.SaaSGetWallet)
	pub.Post("/wallet/recharge", handlers.SaaSSimulateRecharge)
	pub.Post("/generator/calculate", handlers.SaaSPreCalculate)
	pub.Post("/generator/execute", handlers.SaaSExecuteGeneration)
	pub.Get("/history/:publisher_id", handlers.SaaSListPDFHistory)
	pub.Post("/manual-articles", handlers.SaaSSaveManualArticles)
	pub.Get("/manual-articles/:publisher_id", handlers.SaaSGetManualArticles)
	pub.Post("/manual-box-content", handlers.SaaSSaveManualBoxContent)
	pub.Get("/manual-box-content/:publisher_id", handlers.SaaSGetManualBoxContent)
	pub.Post("/issue-used-articles", handlers.SaaSSaveIssueUsedArticles)
	pub.Get("/issue-used-articles/:publisher_id", handlers.SaaSGetIssueUsedArticles)
	pub.Post("/masthead-teasers", handlers.SaaSSaveMastheadTeasers)
	pub.Get("/masthead-teasers/:publisher_id", handlers.SaaSGetMastheadTeasers)
	pub.Post("/youth-update-inside-author", handlers.SaaSSaveYouthUpdateInsideAuthor)
	pub.Get("/youth-update-inside-author/:publisher_id", handlers.SaaSGetYouthUpdateInsideAuthor)

	// -------------------------------------------------------------------------
	// ADMIN CONTROL PANEL ENDPOINTS
	// -------------------------------------------------------------------------
	admin := app.Group("/api/v1/saas-admin", middleware.ZeroTrustAuth(), middleware.RequireRole("ADMIN"))
	admin.Get("/overview", handlers.SaaSAdminOverview)
	admin.Post("/pricing-update", handlers.SaaSAdminUpdatePricing)
	admin.Post("/request/approve", handlers.SaaSAdminApproveRequest)
	admin.Post("/request/reject", handlers.SaaSAdminRejectRequest)
	admin.Post("/publishers/create", handlers.SaaSAdminCreatePublisher)
	admin.Get("/publishers/:publisher_id/credentials-pdf", handlers.SaaSAdminDownloadCredentialsPDF)
	admin.Post("/publishers/:publisher_id/wallet-adjust", handlers.SaaSAdminWalletAdjust)
	admin.Post("/publishers/:publisher_id/reset-password", handlers.SaaSAdminResetPassword)
	admin.Post("/publishers/:publisher_id/unlock-settings", handlers.SaaSAdminUnlockSettings)
	admin.Post("/publishers/:publisher_id/set-active", handlers.SaaSAdminSetPublisherActive)

	// Graceful Shutdown Protocol
	go func() {
		port := os.Getenv("PORT")
		if port == "" {
			port = "8080"
		}
		log.Printf("🚀 Newspaper Generator Studio API actively listening on port %s", port)
		if err := app.Listen(":" + port); err != nil {
			log.Fatalf("❌ Gateway boot failed: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("⚡ Gracefully downscaling Newspaper Generator Studio Gateway...")
	_ = app.Shutdown()
}
