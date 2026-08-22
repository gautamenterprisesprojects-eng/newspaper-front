package handlers

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/enterprise/newspaper-portal-backend/internal/config"
	"github.com/enterprise/newspaper-portal-backend/internal/database"
	"github.com/enterprise/newspaper-portal-backend/pkg/creds"
	"github.com/enterprise/newspaper-portal-backend/pkg/secure"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

const youthUpdatePublisherID = "85a50d12-8aa3-4f88-93aa-8153443c1c98"

// authorizedPublisherID checks that the caller may act on the requested
// publisher. Admins may act on anyone; a publisher may only act on itself.
// Without this, any authenticated user could read or spend another tenant's
// wallet simply by changing the id in the URL or request body.
// It returns ok=false when the request has been rejected and the error response
// has already been written; the handler must then stop and return nil.
//
// Note: c.Status(..).JSON(..) returns a nil error on success, so it cannot
// double as an "access denied" signal — hence the explicit boolean.
func authorizedPublisherID(c *fiber.Ctx, requested string) (string, bool) {
	callerID, _ := c.Locals("userID").(string)
	role, _ := c.Locals("role").(string)

	if strings.EqualFold(role, "ADMIN") || strings.EqualFold(role, "SUPER_ADMIN") {
		if requested == "" {
			_ = c.Status(400).JSON(fiber.Map{"error": "publisher_id is required."})
			return "", false
		}
		return requested, true
	}

	if callerID == "" {
		_ = c.Status(401).JSON(fiber.Map{"error": "No authenticated publisher in this request."})
		return "", false
	}
	if requested != "" && requested != callerID {
		_ = c.Status(403).JSON(fiber.Map{"error": "You may only access your own publisher account."})
		return "", false
	}
	return callerID, true
}

func requireYouthUpdatePublisher(c *fiber.Ctx, publisherID string) bool {
	if publisherID == youthUpdatePublisherID {
		return true
	}

	_ = c.Status(403).JSON(fiber.Map{"error": "This Youth UPDATE setting is available only for the Youth UPDATE publisher."})
	return false
}

type PageSectionConfig struct {
	PageNumber int    `json:"page_number"`
	Section    string `json:"section"`
	HeaderType string `json:"header_type"`
	Notes      string `json:"notes"`
	Category   string `json:"category"`
}

func defaultPageSections(pageCount int) []PageSectionConfig {
	if pageCount <= 0 {
		pageCount = 8
	}
	defaults := []string{"Front Page", "Sports", "City", "Editorial", "Business", "Nation", "Entertainment", "Classifieds"}
	sections := make([]PageSectionConfig, 0, pageCount)
	for i := 1; i <= pageCount; i++ {
		section := "General News"
		if i <= len(defaults) {
			section = defaults[i-1]
		}
		headerType := "inside"
		category := "Madhyapradesh"
		if i == 1 {
			headerType = "front"
			category = "National/State"
		}
		sections = append(sections, PageSectionConfig{
			PageNumber: i,
			Section:    section,
			HeaderType: headerType,
			Notes:      "",
			Category:   category,
		})
	}
	return sections
}

func pageSectionsJSON(sections []PageSectionConfig, pageCount int) string {
	if len(sections) == 0 {
		sections = defaultPageSections(pageCount)
	}
	b, err := json.Marshal(sections)
	if err != nil {
		return "[]"
	}
	return string(b)
}

const dateOnlyLayout = "2006-01-02"

// nextVolumeNumber advances a publisher's volume number by however much
// calendar time has actually passed since their last edition, not just by
// one click. A Daily paper advances by the number of days elapsed; a Weekly
// paper by the number of weeks elapsed (rounded, floor of one) — so a
// publisher who skips a day (or a week) still sees that gap reflected in the
// next edition's volume number instead of it silently disappearing. Returns
// ok=false when there's nothing to compute from yet (no starting volume set,
// or either date fails to parse) — callers should leave the profile
// untouched in that case rather than inventing a baseline.
func nextVolumeNumber(publicationType string, lastVolumeNumber sql.NullInt64, lastPublishedDate sql.NullString, newPublicationDate string) (int, bool) {
	if !lastVolumeNumber.Valid || !lastPublishedDate.Valid || lastPublishedDate.String == "" || newPublicationDate == "" {
		return 0, false
	}

	lastDate, err := time.Parse(dateOnlyLayout, lastPublishedDate.String[:min(len(lastPublishedDate.String), 10)])
	if err != nil {
		return 0, false
	}
	nextDate, err := time.Parse(dateOnlyLayout, newPublicationDate[:min(len(newPublicationDate), 10)])
	if err != nil {
		return 0, false
	}

	daysElapsed := int(math.Round(nextDate.Sub(lastDate).Hours() / 24))
	increment := daysElapsed
	if strings.EqualFold(publicationType, "Weekly") {
		increment = int(math.Round(float64(daysElapsed) / 7.0))
	}
	if increment < 1 {
		// Regenerating the same (or an earlier) date doesn't retroactively
		// change the volume number — always advance by at least one edition
		// for a fresh generation call.
		increment = 1
	}

	return int(lastVolumeNumber.Int64) + increment, true
}

// --- 1. AUTHENTICATION & ACCESS REQUESTS ---

type LoginInput struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// SaaSAuthLogin processes publisher and admin logins with strict anti-enumeration security
func SaaSAuthLogin(c *fiber.Ctx) error {
	var input LoginInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid login format. Username and password required."})
	}

	if input.Username == "" || input.Password == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Username and password are required."})
	}

	// No offline credential fallback: issuing tokens to hardcoded usernames when
	// the database is unavailable is an authentication bypass.
	if database.DB == nil {
		log.Println("login rejected: database unavailable")
		return c.Status(503).JSON(fiber.Map{"error": "Authentication service is temporarily unavailable."})
	}

	var pub struct {
		ID           string `db:"id"`
		Username     string `db:"username"`
		PasswordHash string `db:"password_hash"`
		Role         string `db:"role"`
		IsActive     bool   `db:"is_active"`
	}

	err := database.DB.Get(&pub, "SELECT id, username, password_hash, role, is_active FROM publishers WHERE username = $1 AND is_active = TRUE", input.Username)
	if err != nil {
		// Log attempted username without revealing existence to client
		database.DB.Exec("INSERT INTO login_logs (username, ip_address, user_agent, status) VALUES ($1, $2, $3, $4)", input.Username, c.IP(), c.Get("User-Agent"), "FAILED_USER_NOT_FOUND")
		return c.Status(401).JSON(fiber.Map{"error": "You do not have access to this platform."})
	}

	// The stored bcrypt hash is the only accepted proof of identity. There is no
	// shared master password: one literal in the source would unlock every account.
	if err = bcrypt.CompareHashAndPassword([]byte(pub.PasswordHash), []byte(input.Password)); err != nil {
		database.DB.Exec("INSERT INTO login_logs (username, ip_address, user_agent, status) VALUES ($1, $2, $3, $4)", input.Username, c.IP(), c.Get("User-Agent"), "FAILED_INVALID_PASSWORD")
		return c.Status(401).JSON(fiber.Map{"error": "You do not have access to this platform."})
	}

	// Check if setup wizard is finished in publisher_profiles
	var isSetupCompleted bool
	_ = database.DB.Get(&isSetupCompleted, "SELECT is_setup_completed FROM publisher_profiles WHERE publisher_id = $1", pub.ID)
	if pub.Role == "ADMIN" {
		isSetupCompleted = true
	}

	// Generate secure JWT
	claims := jwt.MapClaims{
		"sub":      pub.ID,
		"username": pub.Username,
		"role":     pub.Role,
		"exp":      time.Now().Add(72 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, err := token.SignedString(config.JWTSecret())
	if err != nil {
		log.Printf("failed signing access token for %s: %v", pub.Username, err)
		return c.Status(500).JSON(fiber.Map{"error": "Could not issue an access token."})
	}

	database.DB.Exec("INSERT INTO login_logs (username, ip_address, user_agent, status) VALUES ($1, $2, $3, $4)", pub.Username, c.IP(), c.Get("User-Agent"), "SUCCESS")

	return c.JSON(fiber.Map{
		"token":              tokenStr,
		"publisher_id":       pub.ID,
		"username":           pub.Username,
		"role":               pub.Role,
		"is_setup_completed": isSetupCompleted,
		"message":            "Authentication successful. Welcome to Newspaper Generator Studio.",
	})
}

// SaaSRequestAccess registers a new publisher application for admin vetting
func SaaSRequestAccess(c *fiber.Ctx) error {
	var body struct {
		OwnerName       string `json:"owner_name"`
		NewspaperName   string `json:"newspaper_name"`
		Mobile          string `json:"mobile"`
		Email           string `json:"email"`
		City            string `json:"city"`
		State           string `json:"state"`
		PublicationType string `json:"publication_type"`
		RNINumber       string `json:"rni_number"`
		AadharDoc       string `json:"aadhar_doc"`
		RNIDoc          string `json:"rni_doc"`
		BFormDoc        string `json:"b_form_doc"`
		Message         string `json:"message"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request payload."})
	}

	if body.OwnerName == "" || body.NewspaperName == "" || body.Mobile == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Owner Name, Newspaper Name, and Mobile number are required fields."})
	}

	if database.DB != nil {
		_, err := database.DB.Exec(`
			INSERT INTO registration_requests (owner_name, newspaper_name, mobile, email, city, state, publication_type, rni_number, aadhar_doc, rni_doc, b_form_doc, message, status)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'PENDING')`,
			body.OwnerName, body.NewspaperName, body.Mobile, body.Email, body.City, body.State, body.PublicationType, body.RNINumber, body.AadharDoc, body.RNIDoc, body.BFormDoc, body.Message,
		)
		if err != nil {
			log.Printf("Error recording access request: %v", err)
		}
	}

	return c.JSON(fiber.Map{
		"success": true,
		"status":  "PENDING_ADMIN_APPROVAL",
		"message": "Your access request has been securely lodged. Our administrative suite will vet your newspaper details and issue login credentials upon approval.",
	})
}

// --- 2. SETUP WIZARD & PUBLISHER PROFILE ---

func SaaSCompleteWizard(c *fiber.Ctx) error {
	var body struct {
		PublisherID          string              `json:"publisher_id"`
		PublisherName        string              `json:"publisher_name"`
		NewspaperName        string              `json:"newspaper_name"`
		PublicationType      string              `json:"publication_type"`
		NumberOfEditions     int                 `json:"number_of_editions"`
		DefaultPageCount     string              `json:"default_page_count"`
		City                 string              `json:"city"`
		State                string              `json:"state"`
		Mobile               string              `json:"mobile"`
		Email                string              `json:"email"`
		FrontPageHeaderURL   string              `json:"front_page_header_url"`
		RemainingPageHeadURL string              `json:"remaining_page_header_url"`
		CoverPrice           string              `json:"cover_price"`
		PublicationStartYear int                 `json:"publication_start_year"`
		PageSections         []PageSectionConfig `json:"page_sections"`
		// One-time baseline for volume auto-increment (see nextVolumeNumber):
		// "my last edition was Volume LastVolumeNumber, dated LastPublishedDate."
		// Optional — a publisher who leaves this blank just doesn't get
		// automatic volume tracking until they fill it in later via the
		// profile page (SaaSExecuteGeneration only advances it when both are
		// already set).
		LastVolumeNumber  *int   `json:"last_volume_number"`
		LastPublishedDate string `json:"last_published_date"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid setup wizard payload."})
	}

	publisherID, ok := authorizedPublisherID(c, body.PublisherID)
	if !ok {
		return nil // rejection response already written
	}
	body.PublisherID = publisherID

	if database.DB != nil && body.PublisherID != "" {
		// A blank date must land in the column as NULL, not as an empty
		// string Postgres would reject trying to parse as a DATE.
		var lastPublishedDate interface{}
		if body.LastPublishedDate != "" {
			lastPublishedDate = body.LastPublishedDate
		}

		_, err := database.DB.Exec(`
			INSERT INTO publisher_profiles (publisher_id, publisher_name, newspaper_name, publication_type, number_of_editions, default_page_count, city, state, mobile, email, front_page_header_url, remaining_page_header_url, cover_price, publication_start_year, page_section_config, last_volume_number, last_published_date, is_setup_completed)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, $17, TRUE)
			ON CONFLICT (publisher_id) DO UPDATE SET
				publisher_name = EXCLUDED.publisher_name,
				newspaper_name = EXCLUDED.newspaper_name,
				publication_type = EXCLUDED.publication_type,
				number_of_editions = EXCLUDED.number_of_editions,
				default_page_count = EXCLUDED.default_page_count,
				city = EXCLUDED.city,
				state = EXCLUDED.state,
				mobile = EXCLUDED.mobile,
				email = EXCLUDED.email,
				front_page_header_url = EXCLUDED.front_page_header_url,
				remaining_page_header_url = EXCLUDED.remaining_page_header_url,
				cover_price = EXCLUDED.cover_price,
				publication_start_year = EXCLUDED.publication_start_year,
				page_section_config = EXCLUDED.page_section_config,
				last_volume_number = COALESCE(EXCLUDED.last_volume_number, publisher_profiles.last_volume_number),
				last_published_date = COALESCE(EXCLUDED.last_published_date, publisher_profiles.last_published_date),
				is_setup_completed = TRUE`,
			body.PublisherID, body.PublisherName, body.NewspaperName, body.PublicationType, body.NumberOfEditions, body.DefaultPageCount, body.City, body.State, body.Mobile, body.Email, body.FrontPageHeaderURL, body.RemainingPageHeadURL, body.CoverPrice, body.PublicationStartYear, pageSectionsJSON(body.PageSections, 8), body.LastVolumeNumber, lastPublishedDate,
		)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Database error persisting publisher setup: " + err.Error()})
		}
	}

	return c.JSON(fiber.Map{
		"success":            true,
		"is_setup_completed": true,
		"message":            "Newspaper profile setup wizard completed! Your publication is ready for automated generation.",
	})
}

func SaaSGetProfile(c *fiber.Ctx) error {
	pubID, ok := authorizedPublisherID(c, c.Params("publisher_id"))
	if !ok {
		return nil // rejection response already written
	}
	if database.DB == nil {
		return c.JSON(fiber.Map{
			"publisher_id": pubID, "publisher_name": "Rajeshwar Bhargava", "newspaper_name": "The Delhi Tribune",
			"publication_type": "Daily", "number_of_editions": 1, "default_page_count": "8",
			"front_page_header_url":     "https://r2.newspaper-studio.in/headers/front-header-master.pdf",
			"remaining_page_header_url": "https://r2.newspaper-studio.in/headers/inside-header-master.pdf",
			"page_sections":             defaultPageSections(8),
			"is_setup_completed":        true,
		})
	}
	prof, err := database.QueryMap("SELECT * FROM publisher_profiles WHERE publisher_id = $1 LIMIT 1", pubID)
	if err != nil {
		log.Printf("profile lookup failed for publisher %s: %v", pubID, err)
		return c.Status(404).JSON(fiber.Map{"error": "Publisher profile not found."})
	}
	if prof != nil {
		if raw, ok := prof["page_section_config"]; ok {
			switch v := raw.(type) {
			case []byte:
				var sections []PageSectionConfig
				if json.Unmarshal(v, &sections) == nil {
					prof["page_sections"] = sections
				}
			case string:
				var sections []PageSectionConfig
				if json.Unmarshal([]byte(v), &sections) == nil {
					prof["page_sections"] = sections
				}
			}
		}
	}
	return c.JSON(prof)
}

type ManualArticleInput struct {
	PageNumber int    `json:"page_number" db:"page_number"`
	Headline   string `json:"headline" db:"headline"`
	Body       string `json:"body" db:"body"`
	ImageURL   string `json:"image_url" db:"image_url"`
}

type IssueUsedArticleInput struct {
	ArticleID string `json:"article_id" db:"article_id"`
	Category  string `json:"category" db:"category"`
	Headline  string `json:"headline" db:"headline"`
	SourceURL string `json:"source_url" db:"source_url"`
}

type IssueUsedArticleRecord struct {
	PageNumber          int    `json:"page_number" db:"page_number"`
	PageLabel           string `json:"page_label" db:"page_label"`
	ArticleID           string `json:"article_id" db:"article_id"`
	Category            string `json:"category" db:"category"`
	Headline            string `json:"headline" db:"headline"`
	NormalizedHeadline  string `json:"normalized_headline" db:"normalized_headline"`
	SourceURL           string `json:"source_url" db:"source_url"`
	NormalizedSourceURL string `json:"normalized_source_url" db:"normalized_source_url"`
}

func normalizeArticleIdentity(value string) string {
	return strings.Join(strings.Fields(strings.ToLower(strings.TrimSpace(value))), " ")
}

func normalizeSourceURL(value string) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	normalized = strings.TrimSuffix(normalized, "/")
	return normalized
}

func validIssueScope(issueNumber string, publicationDate string) bool {
	return strings.TrimSpace(issueNumber) != "" && strings.TrimSpace(publicationDate) != ""
}

// SaaSGetIssueUsedArticles returns stories already used in this publisher's
// current issue so a single-page generator session can exclude them before it
// fetches live news for another page. `exclude_page_number` is used when a
// page is regenerated: that page's previous choices should be replaceable,
// while every other page stays blocked.
func SaaSGetIssueUsedArticles(c *fiber.Ctx) error {
	pubID, ok := authorizedPublisherID(c, c.Params("publisher_id"))
	if !ok {
		return nil
	}

	issueNumber := strings.TrimSpace(c.Query("issue_number_ank"))
	publicationDate := strings.TrimSpace(c.Query("publication_date"))
	if !validIssueScope(issueNumber, publicationDate) {
		return c.Status(400).JSON(fiber.Map{"error": "issue_number_ank and publication_date are required."})
	}

	excludePageNumber, _ := strconv.Atoi(c.Query("exclude_page_number", "0"))

	if database.DB == nil {
		return c.JSON(fiber.Map{
			"articles":             []IssueUsedArticleRecord{},
			"article_ids":          []string{},
			"normalized_headlines": []string{},
			"source_urls":          []string{},
		})
	}

	query := `
		SELECT page_number, page_label, article_id, category, headline, normalized_headline, source_url, normalized_source_url
		FROM publisher_issue_used_articles
		WHERE publisher_id = $1 AND issue_number_ank = $2 AND publication_date = $3`
	args := []any{pubID, issueNumber, publicationDate}
	if excludePageNumber > 0 {
		query += " AND page_number <> $4"
		args = append(args, excludePageNumber)
	}
	query += " ORDER BY page_number, created_at"

	var articles []IssueUsedArticleRecord
	if err := database.DB.Select(&articles, query, args...); err != nil {
		log.Printf("issue used article lookup failed for publisher %s: %v", pubID, err)
		return c.Status(500).JSON(fiber.Map{"error": "Failed loading used issue articles."})
	}

	articleIDs := make([]string, 0, len(articles))
	headlines := make([]string, 0, len(articles))
	sourceURLs := make([]string, 0, len(articles))
	for _, article := range articles {
		if article.ArticleID != "" {
			articleIDs = append(articleIDs, article.ArticleID)
		}
		if article.NormalizedHeadline != "" {
			headlines = append(headlines, article.NormalizedHeadline)
		}
		if article.NormalizedSourceURL != "" {
			sourceURLs = append(sourceURLs, article.NormalizedSourceURL)
		}
	}

	return c.JSON(fiber.Map{
		"articles":             articles,
		"article_ids":          articleIDs,
		"normalized_headlines": headlines,
		"source_urls":          sourceURLs,
	})
}

// SaaSSaveIssueUsedArticles replaces the used-story list for one page. This
// lets a publisher regenerate the same page without permanently blocking its
// old articles, while keeping all other pages in the issue protected.
func SaaSSaveIssueUsedArticles(c *fiber.Ctx) error {
	var body struct {
		PublisherID     string                  `json:"publisher_id"`
		IssueNumberAnk  string                  `json:"issue_number_ank"`
		PublicationDate string                  `json:"publication_date"`
		PageNumber      int                     `json:"page_number"`
		PageLabel       string                  `json:"page_label"`
		Articles        []IssueUsedArticleInput `json:"articles"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid issue article usage payload."})
	}

	publisherID, ok := authorizedPublisherID(c, body.PublisherID)
	if !ok {
		return nil
	}
	if body.PageNumber <= 0 || !validIssueScope(body.IssueNumberAnk, body.PublicationDate) {
		return c.Status(400).JSON(fiber.Map{"error": "publisher_id, issue_number_ank, publication_date and page_number are required."})
	}

	if database.DB == nil {
		return c.JSON(fiber.Map{"success": true, "count": len(body.Articles), "skipped": 0})
	}

	tx, err := database.DB.Beginx()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed initiating transaction: " + err.Error()})
	}
	defer tx.Rollback()

	if _, err := tx.Exec(
		`DELETE FROM publisher_issue_used_articles
		 WHERE publisher_id = $1 AND issue_number_ank = $2 AND publication_date = $3 AND page_number = $4`,
		publisherID, strings.TrimSpace(body.IssueNumberAnk), strings.TrimSpace(body.PublicationDate), body.PageNumber,
	); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed clearing previous page usage: " + err.Error()})
	}

	savedCount := 0
	skippedCount := 0
	for _, article := range body.Articles {
		headline := strings.TrimSpace(article.Headline)
		articleID := strings.TrimSpace(article.ArticleID)
		sourceURL := strings.TrimSpace(article.SourceURL)
		if headline == "" && articleID == "" && sourceURL == "" {
			continue
		}

		result, err := tx.Exec(
			`INSERT INTO publisher_issue_used_articles
				(publisher_id, issue_number_ank, publication_date, page_number, page_label, category, article_id, headline, normalized_headline, source_url, normalized_source_url, status, updated_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'USED', NOW())
			 ON CONFLICT DO NOTHING`,
			publisherID,
			strings.TrimSpace(body.IssueNumberAnk),
			strings.TrimSpace(body.PublicationDate),
			body.PageNumber,
			strings.TrimSpace(body.PageLabel),
			strings.TrimSpace(article.Category),
			articleID,
			headline,
			normalizeArticleIdentity(headline),
			sourceURL,
			normalizeSourceURL(sourceURL),
		)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Failed saving issue article usage: " + err.Error()})
		}
		rows, _ := result.RowsAffected()
		if rows > 0 {
			savedCount++
		} else {
			skippedCount++
		}
	}

	if err := tx.Commit(); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed committing issue article usage: " + err.Error()})
	}

	return c.JSON(fiber.Map{"success": true, "count": savedCount, "skipped": skippedCount})
}

// SaaSSaveManualArticles replaces the publisher's full set of manual articles
// on every call — these are fresh-per-issue content the publisher supplies
// right before generating, not a standing profile setting, so there is no
// history to preserve between submissions.
func SaaSSaveManualArticles(c *fiber.Ctx) error {
	var body struct {
		PublisherID string               `json:"publisher_id"`
		Articles    []ManualArticleInput `json:"articles"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid manual articles payload."})
	}

	publisherID, ok := authorizedPublisherID(c, body.PublisherID)
	if !ok {
		return nil // rejection response already written
	}

	if database.DB == nil {
		return c.JSON(fiber.Map{"success": true, "count": len(body.Articles)})
	}

	tx, err := database.DB.Beginx()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed initiating transaction: " + err.Error()})
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM manual_articles WHERE publisher_id = $1", publisherID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed clearing previous manual articles: " + err.Error()})
	}

	for _, article := range body.Articles {
		if article.PageNumber <= 0 || strings.TrimSpace(article.Headline) == "" || strings.TrimSpace(article.Body) == "" {
			continue
		}
		if _, err := tx.Exec(
			"INSERT INTO manual_articles (publisher_id, page_number, headline, body, image_url) VALUES ($1, $2, $3, $4, $5)",
			publisherID, article.PageNumber, article.Headline, article.Body, article.ImageURL,
		); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Failed saving manual article: " + err.Error()})
		}
	}

	if err := tx.Commit(); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed committing manual articles: " + err.Error()})
	}

	return c.JSON(fiber.Map{"success": true, "count": len(body.Articles)})
}

// SaaSGetManualArticles is called by the generator (not the portal frontend)
// during batch generation, cross-origin, using the same apiBase+authToken
// bearer pattern already used to fetch the publisher's profile/header images.
func SaaSGetManualArticles(c *fiber.Ctx) error {
	pubID, ok := authorizedPublisherID(c, c.Params("publisher_id"))
	if !ok {
		return nil // rejection response already written
	}

	if database.DB == nil {
		return c.JSON(fiber.Map{"articles": []ManualArticleInput{}})
	}

	pageNumber := c.Query("page_number")
	query := "SELECT page_number, headline, body, COALESCE(image_url, '') as image_url FROM manual_articles WHERE publisher_id = $1"
	args := []any{pubID}
	if pageNumber != "" {
		query += " AND page_number = $2"
		args = append(args, pageNumber)
	}
	query += " ORDER BY page_number, created_at"

	var articles []ManualArticleInput
	if err := database.DB.Select(&articles, query, args...); err != nil {
		log.Printf("manual articles lookup failed for publisher %s: %v", pubID, err)
		return c.Status(500).JSON(fiber.Map{"error": "Failed loading manual articles."})
	}

	return c.JSON(fiber.Map{"articles": articles})
}

// ManualBoxContentInput is manual_articles' richer successor: content for one
// specific box (slot_index) on one specific page, matching the generator's
// own per-box manual seeder (headline/subheadline/place/body/photo/caption)
// plus editor_portrait_url/editor_name for an Editorial page's two
// author-rail boxes — blank on every ordinary news box.
type ManualBoxContentInput struct {
	PageNumber        int    `json:"page_number" db:"page_number"`
	SlotIndex         int    `json:"slot_index" db:"slot_index"`
	Headline          string `json:"headline" db:"headline"`
	Subheadline       string `json:"subheadline" db:"subheadline"`
	Place             string `json:"place" db:"place"`
	Body              string `json:"body" db:"body"`
	ImageURL          string `json:"image_url" db:"image_url"`
	ImageCaption      string `json:"image_caption" db:"image_caption"`
	EditorPortraitURL string `json:"editor_portrait_url" db:"editor_portrait_url"`
	EditorName        string `json:"editor_name" db:"editor_name"`
}

// SaaSSaveManualBoxContent replaces the publisher's full set of manual box
// content on every call — same fresh-per-issue semantics as the
// manual_articles it succeeds (see SaaSSaveManualArticles).
func SaaSSaveManualBoxContent(c *fiber.Ctx) error {
	var body struct {
		PublisherID string                  `json:"publisher_id"`
		Boxes       []ManualBoxContentInput `json:"boxes"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid manual box content payload."})
	}

	publisherID, ok := authorizedPublisherID(c, body.PublisherID)
	if !ok {
		return nil // rejection response already written
	}

	if database.DB == nil {
		return c.JSON(fiber.Map{"success": true, "count": len(body.Boxes)})
	}

	tx, err := database.DB.Beginx()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed initiating transaction: " + err.Error()})
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM manual_box_content WHERE publisher_id = $1", publisherID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed clearing previous manual box content: " + err.Error()})
	}

	savedCount := 0
	for _, box := range body.Boxes {
		// Portrait/name are enrichment on a real entry, not a substitute for
		// one — matches EditorialSlotPanel.tsx's own manualEntryToStory gate
		// (hasCopy = headline || body). A portrait with no headline/body can
		// never render: the newswire pipeline requires real localized copy
		// for every story and throws "Not enough Hindi articles" otherwise.
		if box.PageNumber <= 0 || strings.TrimSpace(box.Headline) == "" || strings.TrimSpace(box.Body) == "" {
			continue
		}
		if _, err := tx.Exec(
			`INSERT INTO manual_box_content
				(publisher_id, page_number, slot_index, headline, subheadline, place, body, image_url, image_caption, editor_portrait_url, editor_name)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
			publisherID, box.PageNumber, box.SlotIndex, box.Headline, box.Subheadline, box.Place, box.Body, box.ImageURL, box.ImageCaption, box.EditorPortraitURL, box.EditorName,
		); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Failed saving manual box content: " + err.Error()})
		}
		savedCount++
	}

	if err := tx.Commit(); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed committing manual box content: " + err.Error()})
	}

	return c.JSON(fiber.Map{"success": true, "count": savedCount})
}

// SaaSGetManualBoxContent is called by the generator (not the portal
// frontend) during batch generation, cross-origin, using the same
// apiBase+authToken bearer pattern already used to fetch the publisher's
// profile/header images.
func SaaSGetManualBoxContent(c *fiber.Ctx) error {
	pubID, ok := authorizedPublisherID(c, c.Params("publisher_id"))
	if !ok {
		return nil // rejection response already written
	}

	if database.DB == nil {
		return c.JSON(fiber.Map{"boxes": []ManualBoxContentInput{}})
	}

	pageNumber := c.Query("page_number")
	query := `SELECT page_number, slot_index, headline, subheadline, place, body,
		COALESCE(image_url, '') as image_url, COALESCE(image_caption, '') as image_caption,
		COALESCE(editor_portrait_url, '') as editor_portrait_url, COALESCE(editor_name, '') as editor_name
		FROM manual_box_content WHERE publisher_id = $1`
	args := []any{pubID}
	if pageNumber != "" {
		query += " AND page_number = $2"
		args = append(args, pageNumber)
	}
	query += " ORDER BY page_number, slot_index, created_at"

	var boxes []ManualBoxContentInput
	if err := database.DB.Select(&boxes, query, args...); err != nil {
		log.Printf("manual box content lookup failed for publisher %s: %v", pubID, err)
		return c.Status(500).JSON(fiber.Map{"error": "Failed loading manual box content."})
	}

	return c.JSON(fiber.Map{"boxes": boxes})
}

// MastheadTeaserInput is one of Youth UPDATE's four front-page masthead
// teaser slots (cutout photo + headline + category label). ImageURL is a
// base64 data URL in practice, same as every other "uploaded image" field
// in this backend (front_page_header_url, manual_box_content.image_url) --
// there is no separate file-storage integration to call.
type MastheadTeaserInput struct {
	SlotIndex     int    `json:"slot_index" db:"slot_index"`
	Headline      string `json:"headline" db:"headline"`
	CategoryLabel string `json:"category_label" db:"category_label"`
	ImageURL      string `json:"image_url" db:"image_url"`
}

// SaaSSaveMastheadTeasers replaces the publisher's full set of masthead
// teaser slots on every call -- same fresh-per-issue, delete+reinsert
// semantics as SaaSSaveManualBoxContent. Built generically (any publisher_id
// may hold rows), but only Youth UPDATE's own frontend page calls this today.
func SaaSSaveMastheadTeasers(c *fiber.Ctx) error {
	var body struct {
		PublisherID string                `json:"publisher_id"`
		Teasers     []MastheadTeaserInput `json:"teasers"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid masthead teaser payload."})
	}

	publisherID, ok := authorizedPublisherID(c, body.PublisherID)
	if !ok {
		return nil // rejection response already written
	}

	if database.DB == nil {
		return c.JSON(fiber.Map{"success": true, "count": len(body.Teasers)})
	}

	tx, err := database.DB.Beginx()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed initiating transaction: " + err.Error()})
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM masthead_teaser_content WHERE publisher_id = $1", publisherID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed clearing previous masthead teasers: " + err.Error()})
	}

	savedCount := 0
	for _, teaser := range body.Teasers {
		if teaser.SlotIndex <= 0 {
			continue
		}
		if _, err := tx.Exec(
			`INSERT INTO masthead_teaser_content (publisher_id, slot_index, headline, category_label, image_url)
				VALUES ($1, $2, $3, $4, $5)`,
			publisherID, teaser.SlotIndex, teaser.Headline, teaser.CategoryLabel, teaser.ImageURL,
		); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Failed saving masthead teasers: " + err.Error()})
		}
		savedCount++
	}

	if err := tx.Commit(); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed committing masthead teasers: " + err.Error()})
	}

	return c.JSON(fiber.Map{"success": true, "count": savedCount})
}

// SaaSGetMastheadTeasers is called by the generator app (cross-origin,
// same apiBase+authToken bearer pattern as the profile fetch) as well as
// the portal frontend's own edit form.
func SaaSGetMastheadTeasers(c *fiber.Ctx) error {
	pubID, ok := authorizedPublisherID(c, c.Params("publisher_id"))
	if !ok {
		return nil // rejection response already written
	}

	if database.DB == nil {
		return c.JSON(fiber.Map{"teasers": []MastheadTeaserInput{}})
	}

	var teasers []MastheadTeaserInput
	if err := database.DB.Select(&teasers,
		`SELECT slot_index, headline, category_label, COALESCE(image_url, '') as image_url
			FROM masthead_teaser_content WHERE publisher_id = $1 ORDER BY slot_index`,
		pubID,
	); err != nil {
		log.Printf("masthead teaser lookup failed for publisher %s: %v", pubID, err)
		return c.Status(500).JSON(fiber.Map{"error": "Failed loading masthead teasers."})
	}

	return c.JSON(fiber.Map{"teasers": teasers})
}

type YouthUpdateInsideAuthorInput struct {
	SlotIndex   int    `json:"slot_index" db:"slot_index"`
	ImageURL    string `json:"image_url" db:"image_url"`
	EditorName  string `json:"editor_name" db:"editor_name"`
	Designation string `json:"designation" db:"designation"`
}

func SaaSSaveYouthUpdateInsideAuthor(c *fiber.Ctx) error {
	var body struct {
		PublisherID string                         `json:"publisher_id"`
		Authors     []YouthUpdateInsideAuthorInput `json:"authors"`
		ImageURL    string                         `json:"image_url"`
		EditorName  string                         `json:"editor_name"`
		Designation string                         `json:"designation"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid Youth UPDATE inside author payload."})
	}

	publisherID, ok := authorizedPublisherID(c, body.PublisherID)
	if !ok {
		return nil
	}
	if !requireYouthUpdatePublisher(c, publisherID) {
		return nil
	}

	if database.DB == nil {
		return c.JSON(fiber.Map{"success": true, "count": len(body.Authors)})
	}

	authors := body.Authors
	if len(authors) == 0 && (body.ImageURL != "" || body.EditorName != "" || body.Designation != "") {
		authors = []YouthUpdateInsideAuthorInput{{
			SlotIndex:   1,
			ImageURL:    body.ImageURL,
			EditorName:  body.EditorName,
			Designation: body.Designation,
		}}
	}

	tx, err := database.DB.Beginx()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed initiating transaction: " + err.Error()})
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM youth_update_inside_author WHERE publisher_id = $1", publisherID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed clearing Youth UPDATE inside authors: " + err.Error()})
	}

	savedCount := 0
	for _, author := range authors {
		if author.SlotIndex < 1 || author.SlotIndex > 3 {
			continue
		}
		if _, err := tx.Exec(
			`INSERT INTO youth_update_inside_author (publisher_id, slot_index, image_url, editor_name, designation, updated_at)
				VALUES ($1, $2, $3, $4, $5, NOW())`,
			publisherID, author.SlotIndex, author.ImageURL, author.EditorName, author.Designation,
		); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Failed saving Youth UPDATE inside authors: " + err.Error()})
		}
		savedCount++
	}

	if err := tx.Commit(); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed committing Youth UPDATE inside authors: " + err.Error()})
	}

	return c.JSON(fiber.Map{"success": true, "count": savedCount})
}

func SaaSGetYouthUpdateInsideAuthor(c *fiber.Ctx) error {
	pubID, ok := authorizedPublisherID(c, c.Params("publisher_id"))
	if !ok {
		return nil
	}
	if !requireYouthUpdatePublisher(c, pubID) {
		return nil
	}

	if database.DB == nil {
		return c.JSON(YouthUpdateInsideAuthorInput{})
	}

	var authors []YouthUpdateInsideAuthorInput
	if err := database.DB.Select(&authors,
		`SELECT slot_index, COALESCE(image_url, '') as image_url,
			COALESCE(editor_name, '') as editor_name,
			COALESCE(designation, '') as designation
			FROM youth_update_inside_author WHERE publisher_id = $1 ORDER BY slot_index`,
		pubID,
	); err != nil {
		return c.JSON(fiber.Map{"authors": []YouthUpdateInsideAuthorInput{}})
	}

	response := fiber.Map{"authors": authors}
	if len(authors) > 0 {
		response["image_url"] = authors[0].ImageURL
		response["editor_name"] = authors[0].EditorName
		response["designation"] = authors[0].Designation
	}
	return c.JSON(response)
}

// --- 3. WALLET & RECHARGE ENGINE ---

func SaaSGetWallet(c *fiber.Ctx) error {
	pubID, ok := authorizedPublisherID(c, c.Params("publisher_id"))
	if !ok {
		return nil // rejection response already written
	}
	if database.DB == nil {
		return c.JSON(fiber.Map{"balance_inr": 2150.00, "currency": "INR", "status": "ACTIVE"})
	}

	var balance float64
	if err := database.DB.Get(&balance, "SELECT balance_inr FROM wallets WHERE publisher_id = $1 LIMIT 1", pubID); err != nil {
		log.Printf("wallet lookup failed for publisher %s: %v", pubID, err)
		return c.Status(404).JSON(fiber.Map{"error": "Wallet not found for this publisher."})
	}

	txns, err := database.QueryMaps("SELECT * FROM wallet_transactions WHERE publisher_id = $1 ORDER BY created_at DESC LIMIT 25", pubID)
	if err != nil {
		log.Printf("wallet ledger lookup failed for publisher %s: %v", pubID, err)
		txns = []map[string]interface{}{}
	}

	return c.JSON(fiber.Map{
		"publisher_id":        pubID,
		"balance_inr":         balance,
		"currency":            "INR",
		"recent_transactions": txns,
	})
}

func SaaSSimulateRecharge(c *fiber.Ctx) error {
	var body struct {
		PublisherID     string  `json:"publisher_id"`
		AmountINR       float64 `json:"amount_inr"`
		RazorpayOrderID string  `json:"razorpay_order_id"`
		RazorpayPayID   string  `json:"razorpay_payment_id"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid recharge payload."})
	}

	publisherID, ok := authorizedPublisherID(c, body.PublisherID)
	if !ok {
		return nil // rejection response already written
	}
	body.PublisherID = publisherID

	if body.AmountINR <= 0 {
		return c.Status(400).JSON(fiber.Map{"error": "Recharge amount must be greater than zero."})
	}

	if database.DB != nil && body.PublisherID != "" {
		tx, err := database.DB.Beginx()
		if err == nil {
			var currBal float64
			_ = tx.Get(&currBal, "SELECT balance_inr FROM wallets WHERE publisher_id = $1 FOR UPDATE", body.PublisherID)
			newBal := currBal + body.AmountINR
			_, _ = tx.Exec("UPDATE wallets SET balance_inr = $1, updated_at = NOW() WHERE publisher_id = $2", newBal, body.PublisherID)

			// Record receipt
			_, _ = tx.Exec("INSERT INTO payments (publisher_id, razorpay_order_id, razorpay_payment_id, amount_inr, status) VALUES ($1, $2, $3, $4, 'SUCCESS')", body.PublisherID, body.RazorpayOrderID, body.RazorpayPayID, body.AmountINR)

			// Record ledger
			var walletID string
			_ = tx.Get(&walletID, "SELECT id FROM wallets WHERE publisher_id = $1 LIMIT 1", body.PublisherID)
			if walletID != "" {
				_, _ = tx.Exec("INSERT INTO wallet_transactions (wallet_id, publisher_id, txn_type, amount_inr, balance_after_inr, description, ref_id) VALUES ($1, $2, 'RECHARGE', $3, $4, $5, $6)",
					walletID, body.PublisherID, body.AmountINR, newBal, fmt.Sprintf("Razorpay recharge (%s)", body.RazorpayPayID), body.RazorpayOrderID)
			}
			_ = tx.Commit()
			return c.JSON(fiber.Map{"success": true, "balance_after_inr": newBal, "message": fmt.Sprintf("Successfully recharged ₹%.2f via Razorpay!", body.AmountINR)})
		}
	}

	return c.JSON(fiber.Map{"success": true, "balance_after_inr": 2150.00 + body.AmountINR, "message": fmt.Sprintf("Successfully recharged ₹%.2f via Razorpay simulation!", body.AmountINR)})
}

// --- 4. NEWSPAPER GENERATOR STUDIO & ATOMIC WALLET DEDUCTION ---

func SaaSGetPricing(c *fiber.Ctx) error {
	rate := 50.00
	if database.DB != nil {
		var valStr string
		err := database.DB.Get(&valStr, "SELECT value FROM application_settings WHERE key = 'per_page_cost'")
		if err == nil {
			if r, parseErr := strconv.ParseFloat(valStr, 64); parseErr == nil && r > 0 {
				rate = r
			}
		}
	}
	return c.JSON(fiber.Map{
		"per_page_cost_inr": rate,
		"currency":          "INR",
		"unit":              "Page",
		"pricing_tier_examples": []fiber.Map{
			{"pages": 6, "cost_inr": rate * 6},
			{"pages": 8, "cost_inr": rate * 8},
			{"pages": 12, "cost_inr": rate * 12},
			{"pages": 24, "cost_inr": rate * 24},
		},
	})
}

func SaaSPreCalculate(c *fiber.Ctx) error {
	var body struct {
		PublisherID     string `json:"publisher_id"`
		IssueNumberAnk  string `json:"issue_number_ank"`
		PublicationDate string `json:"publication_date"`
		PageCount       int    `json:"page_count"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid pre-calculation payload."})
	}

	publisherID, ok := authorizedPublisherID(c, body.PublisherID)
	if !ok {
		return nil // rejection response already written
	}
	body.PublisherID = publisherID

	if body.PageCount <= 0 {
		body.PageCount = 8
	}
	rate := 50.00
	if database.DB != nil {
		var valStr string
		_ = database.DB.Get(&valStr, "SELECT value FROM application_settings WHERE key = 'per_page_cost'")
		if r, err := strconv.ParseFloat(valStr, 64); err == nil && r > 0 {
			rate = r
		}
	}
	totalCost := float64(body.PageCount) * rate

	// Fetch actual wallet balance
	currBal := 2150.00
	if database.DB != nil && body.PublisherID != "" {
		_ = database.DB.Get(&currBal, "SELECT balance_inr FROM wallets WHERE publisher_id = $1", body.PublisherID)
	}

	remBal := currBal - totalCost
	hasSufficient := remBal >= 0

	return c.JSON(fiber.Map{
		"issue_number":        body.IssueNumberAnk,
		"publication_date":    body.PublicationDate,
		"pages":               body.PageCount,
		"rate_per_page_inr":   rate,
		"generation_cost_inr": totalCost,
		"wallet_balance_inr":  currBal,
		"remaining_balance":   remBal,
		"sufficient_balance":  hasSufficient,
	})
}

func SaaSExecuteGeneration(c *fiber.Ctx) error {
	var body struct {
		PublisherID          string              `json:"publisher_id"`
		IssueNumberAnk       string              `json:"issue_number_ank"`
		PublicationDate      string              `json:"publication_date"`
		PageCount            int                 `json:"page_count"`
		FrontPageHeaderURL   string              `json:"front_page_header_url"`
		RemainingPageHeadURL string              `json:"remaining_page_header_url"`
		PageSections         []PageSectionConfig `json:"page_sections"`
	}
	if err := c.BodyParser(&body); err != nil || body.PageCount <= 0 || body.IssueNumberAnk == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Issue Number (Ank) and valid Page Count are required to initialize generator."})
	}

	publisherID, ok := authorizedPublisherID(c, body.PublisherID)
	if !ok {
		return nil // rejection response already written
	}
	body.PublisherID = publisherID

	rate := 50.00
	if database.DB != nil {
		var valStr string
		_ = database.DB.Get(&valStr, "SELECT value FROM application_settings WHERE key = 'per_page_cost'")
		if r, err := strconv.ParseFloat(valStr, 64); err == nil && r > 0 {
			rate = r
		}
	}
	cost := float64(body.PageCount) * rate
	pdfURL := fmt.Sprintf("https://r2.newspaper-studio.in/pdfs/issue-%s-%dpages-%d.pdf", strings.ReplaceAll(body.IssueNumberAnk, " ", "-"), body.PageCount, time.Now().Unix())
	frontHeaderURL := body.FrontPageHeaderURL
	insideHeaderURL := body.RemainingPageHeadURL
	pageSections := body.PageSections
	var newVolumeNumber int
	var hasVolume bool

	if database.DB != nil && body.PublisherID != "" {
		var volumeState struct {
			PublicationType   string         `db:"publication_type"`
			LastVolumeNumber  sql.NullInt64  `db:"last_volume_number"`
			LastPublishedDate sql.NullString `db:"last_published_date"`
		}
		if err := database.DB.Get(&volumeState, "SELECT publication_type, last_volume_number, last_published_date::text FROM publisher_profiles WHERE publisher_id = $1", body.PublisherID); err == nil {
			newVolumeNumber, hasVolume = nextVolumeNumber(volumeState.PublicationType, volumeState.LastVolumeNumber, volumeState.LastPublishedDate, body.PublicationDate)
		}
	}

	if database.DB != nil && body.PublisherID != "" {
		if frontHeaderURL == "" || insideHeaderURL == "" || len(pageSections) == 0 {
			var saved struct {
				FrontPageHeaderURL   string `db:"front_page_header_url"`
				RemainingPageHeadURL string `db:"remaining_page_header_url"`
				PageSectionConfig    string `db:"page_section_config"`
			}
			if err := database.DB.Get(&saved, "SELECT front_page_header_url, remaining_page_header_url, page_section_config::text FROM publisher_profiles WHERE publisher_id = $1", body.PublisherID); err == nil {
				if frontHeaderURL == "" {
					frontHeaderURL = saved.FrontPageHeaderURL
				}
				if insideHeaderURL == "" {
					insideHeaderURL = saved.RemainingPageHeadURL
				}
				if len(pageSections) == 0 && saved.PageSectionConfig != "" {
					_ = json.Unmarshal([]byte(saved.PageSectionConfig), &pageSections)
				}
			}
		}
		if len(pageSections) == 0 {
			pageSections = defaultPageSections(body.PageCount)
		}
		tx, err := database.DB.Beginx()
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Failed initiating transaction: " + err.Error()})
		}
		defer tx.Rollback()

		var currBal float64
		var walletID string
		err = tx.QueryRow("SELECT id, balance_inr FROM wallets WHERE publisher_id = $1 FOR UPDATE", body.PublisherID).Scan(&walletID, &currBal)
		if err != nil && err != sql.ErrNoRows {
			return c.Status(500).JSON(fiber.Map{"error": "Error querying publisher wallet."})
		}

		if currBal < cost {
			return c.Status(402).JSON(fiber.Map{
				"error":              "Insufficient wallet balance.",
				"wallet_balance":     currBal,
				"required_amount":    cost,
				"deficit":            cost - currBal,
				"recharge_suggested": true,
			})
		}

		newBal := currBal - cost
		_, err = tx.Exec("UPDATE wallets SET balance_inr = $1, updated_at = NOW() WHERE id = $2", newBal, walletID)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Failed updating wallet balance."})
		}

		// Insert generated PDF archive record
		var pdfID string
		err = tx.QueryRow(`
			INSERT INTO generated_pdfs (publisher_id, issue_number_ank, publication_date, page_count, cost_inr, rate_per_page_inr, pdf_url, front_page_header_url, remaining_page_header_url, page_section_config, status)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 'SUCCESS') RETURNING id`,
			body.PublisherID, body.IssueNumberAnk, body.PublicationDate, body.PageCount, cost, rate, pdfURL, frontHeaderURL, insideHeaderURL, pageSectionsJSON(pageSections, body.PageCount)).Scan(&pdfID)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Failed logging generated PDF."})
		}

		// Record ledger transaction
		_, err = tx.Exec(`
			INSERT INTO wallet_transactions (wallet_id, publisher_id, txn_type, amount_inr, balance_after_inr, description, ref_id)
			VALUES ($1, $2, 'GENERATION_CHARGE', $3, $4, $5, $6)`,
			walletID, body.PublisherID, -cost, newBal, fmt.Sprintf("Newspaper composition for Issue %s (%d Pages @ ₹%.2f)", body.IssueNumberAnk, body.PageCount, rate), pdfID)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Failed recording transaction ledger."})
		}

		// Advance this publisher's front-page template rotation by one so the
		// next "generate all pages" click never repeats this edition's design.
		var frontTemplateIndex int
		if err := tx.QueryRow(
			"UPDATE publisher_profiles SET last_front_template_index = last_front_template_index + 1 WHERE publisher_id = $1 RETURNING last_front_template_index",
			body.PublisherID,
		).Scan(&frontTemplateIndex); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Failed advancing front template rotation."})
		}

		// Persist the advanced volume number + this edition's date as the new
		// baseline for next time — only when the publisher has actually set a
		// starting volume (hasVolume); otherwise there's nothing to advance.
		if hasVolume {
			if _, err := tx.Exec(
				"UPDATE publisher_profiles SET last_volume_number = $1, last_published_date = $2 WHERE publisher_id = $3",
				newVolumeNumber, body.PublicationDate, body.PublisherID,
			); err != nil {
				return c.Status(500).JSON(fiber.Map{"error": "Failed advancing volume number."})
			}
		}

		_ = tx.Commit()

		response := fiber.Map{
			"success":                   true,
			"issue_number":              body.IssueNumberAnk,
			"pdf_url":                   pdfURL,
			"front_page_header_url":     frontHeaderURL,
			"remaining_page_header_url": insideHeaderURL,
			"page_sections":             pageSections,
			"cost_deducted_inr":         cost,
			"remaining_balance":         newBal,
			"front_template_index":      frontTemplateIndex,
			"message":                   fmt.Sprintf("Newspaper Issue '%s' generated successfully! PDF is ready for print and download.", body.IssueNumberAnk),
		}
		if hasVolume {
			response["volume_number"] = newVolumeNumber
		}

		return c.JSON(response)
	}
	if len(pageSections) == 0 {
		pageSections = defaultPageSections(body.PageCount)
	}

	return c.JSON(fiber.Map{
		"success":                   true,
		"issue_number":              body.IssueNumberAnk,
		"pdf_url":                   pdfURL,
		"front_page_header_url":     frontHeaderURL,
		"remaining_page_header_url": insideHeaderURL,
		"page_sections":             pageSections,
		"cost_deducted_inr":         cost,
		"remaining_balance":         2150.00 - cost,
		"message":                   fmt.Sprintf("Newspaper Issue '%s' generated via simulation studio!", body.IssueNumberAnk),
	})
}

// --- 5. PDF HISTORY ARCHIVES ---

func SaaSListPDFHistory(c *fiber.Ctx) error {
	pubID, ok := authorizedPublisherID(c, c.Params("publisher_id"))
	if !ok {
		return nil // rejection response already written
	}
	limitStr := c.Query("limit", "5")
	limit, _ := strconv.Atoi(limitStr)
	if limit <= 0 {
		limit = 100 // View All limit
	}

	if database.DB == nil {
		return c.JSON(fiber.Map{
			"history": []fiber.Map{
				{"id": "pdf_1", "issue_number_ank": "Ank 125", "publication_date": time.Now().Format("2006-01-02"), "page_count": 8, "cost_inr": 600.00, "status": "SUCCESS", "pdf_url": "https://r2.newspaper-studio.in/pdfs/issue-125.pdf"},
				{"id": "pdf_2", "issue_number_ank": "Ank 124", "publication_date": time.Now().AddDate(0, 0, -1).Format("2006-01-02"), "page_count": 8, "cost_inr": 600.00, "status": "SUCCESS", "pdf_url": "https://r2.newspaper-studio.in/pdfs/issue-124.pdf"},
			},
			"count": 2,
		})
	}

	pdfs, err := database.QueryMaps("SELECT * FROM generated_pdfs WHERE publisher_id = $1 ORDER BY created_at DESC LIMIT $2", pubID, limit)
	if err != nil {
		log.Printf("pdf history lookup failed for publisher %s: %v", pubID, err)
		return c.Status(500).JSON(fiber.Map{"error": "Could not load PDF history."})
	}

	return c.JSON(fiber.Map{"history": pdfs, "count": len(pdfs)})
}

// --- 6. ADMIN CONTROL PANEL SUITE ---

func SaaSAdminOverview(c *fiber.Ctx) error {
	if database.DB == nil {
		return c.JSON(fiber.Map{"publishers": 1, "pending_requests": 1, "total_pdfs_generated": 5, "total_revenue_inr": 3300.00})
	}
	var pubCount, reqCount, pdfCount int
	var rev float64
	_ = database.DB.Get(&pubCount, "SELECT COUNT(*) FROM publishers WHERE role = 'PUBLISHER'")
	_ = database.DB.Get(&reqCount, "SELECT COUNT(*) FROM registration_requests WHERE status = 'PENDING'")
	_ = database.DB.Get(&pdfCount, "SELECT COUNT(*) FROM generated_pdfs")
	_ = database.DB.Get(&rev, "SELECT COALESCE(SUM(cost_inr), 0) FROM generated_pdfs")

	requests, err := database.QueryMaps("SELECT * FROM registration_requests ORDER BY created_at DESC LIMIT 20")
	if err != nil {
		log.Printf("registration request listing failed: %v", err)
		requests = []map[string]interface{}{}
	}

	publishers, err := database.QueryMaps(`
		SELECT p.id, p.username, p.is_active, p.created_at, p.password_encrypted, COALESCE(w.balance_inr, 0) as balance_inr, pp.newspaper_name, pp.publisher_name, pp.email, pp.mobile
		FROM publishers p
		LEFT JOIN wallets w ON p.id = w.publisher_id
		LEFT JOIN publisher_profiles pp ON p.id = pp.publisher_id
		WHERE p.role = 'PUBLISHER'
		ORDER BY p.created_at DESC`)
	if err != nil {
		log.Printf("publisher listing failed: %v", err)
		publishers = []map[string]interface{}{}
	}
	// Decrypt server-side, for admin eyes only; never store or log the
	// plaintext, and never expose password_encrypted (the ciphertext) itself.
	for _, pub := range publishers {
		enc, _ := pub["password_encrypted"].(string)
		delete(pub, "password_encrypted")
		if enc == "" {
			pub["password"] = nil
			continue
		}
		plain, err := secure.Decrypt(enc)
		if err != nil {
			pub["password"] = nil
			continue
		}
		pub["password"] = plain
	}

	return c.JSON(fiber.Map{
		"metrics": fiber.Map{
			"total_publishers":     pubCount,
			"pending_requests":     reqCount,
			"total_pdfs_generated": pdfCount,
			"total_revenue_inr":    rev,
		},
		"registration_requests": requests,
		"publishers":            publishers,
	})
}

func SaaSAdminUpdatePricing(c *fiber.Ctx) error {
	var body struct {
		PerPageCostINR float64 `json:"per_page_cost_inr"`
	}
	if err := c.BodyParser(&body); err != nil || body.PerPageCostINR <= 0 {
		return c.Status(400).JSON(fiber.Map{"error": "Valid per-page INR cost required."})
	}

	valStr := fmt.Sprintf("%.2f", body.PerPageCostINR)
	if database.DB != nil {
		_, _ = database.DB.Exec("INSERT INTO application_settings (key, value, description, updated_at) VALUES ('per_page_cost', $1, 'Admin updated rate', NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()", valStr)
	}
	return c.JSON(fiber.Map{"success": true, "per_page_cost_inr": body.PerPageCostINR, "message": fmt.Sprintf("Global newspaper generation rate successfully updated to ₹%.2f per page!", body.PerPageCostINR)})
}

// SaaSAdminCreatePublisher lets an admin create a publisher account directly,
// without going through a public registration request. Credentials are stored
// in the database exactly like approved publishers: bcrypt for login,
// encrypted plaintext for admin display, and a locked credentials PDF.
func SaaSAdminCreatePublisher(c *fiber.Ctx) error {
	var body struct {
		Username        string  `json:"username"`
		Password        string  `json:"password"`
		PDFPassword     string  `json:"pdf_password"`
		PublisherName   string  `json:"publisher_name"`
		NewspaperName   string  `json:"newspaper_name"`
		PublicationType string  `json:"publication_type"`
		Email           string  `json:"email"`
		Mobile          string  `json:"mobile"`
		City            string  `json:"city"`
		State           string  `json:"state"`
		InitialBalance  float64 `json:"initial_balance_inr"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid publisher details."})
	}

	body.Username = strings.TrimSpace(body.Username)
	body.PublisherName = strings.TrimSpace(body.PublisherName)
	body.NewspaperName = strings.TrimSpace(body.NewspaperName)
	body.PublicationType = strings.TrimSpace(body.PublicationType)
	if body.PublicationType == "" {
		body.PublicationType = "Daily"
	}

	if len(body.Username) < 3 {
		return c.Status(400).JSON(fiber.Map{"error": "Username must be at least 3 characters."})
	}
	if len(body.Password) < 6 {
		return c.Status(400).JSON(fiber.Map{"error": "Password must be at least 6 characters."})
	}
	if len(body.PDFPassword) < 6 {
		return c.Status(400).JSON(fiber.Map{"error": "PDF lock password must be at least 6 characters."})
	}
	if body.PublisherName == "" || body.NewspaperName == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Publisher name and newspaper name are required."})
	}
	if body.InitialBalance < 0 {
		return c.Status(400).JSON(fiber.Map{"error": "Initial wallet balance cannot be negative."})
	}
	if database.DB == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Database unavailable."})
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Could not secure the password."})
	}
	encryptedPassword, err := secure.Encrypt(body.Password)
	if err != nil {
		log.Printf("password encryption failed during direct publisher creation: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "Could not secure the password."})
	}

	adminUsername, _ := c.Locals("username").(string)
	pdfBytes, err := creds.GeneratePublisherCredentialsPDF(creds.Info{
		NewspaperName: body.NewspaperName,
		OwnerName:     body.PublisherName,
		City:          body.City,
		State:         body.State,
		Mobile:        body.Mobile,
		Email:         body.Email,
		Username:      body.Username,
		Password:      body.Password,
		LoginURL:      config.FrontendURL() + "/login",
		IssuedBy:      adminUsername,
	}, body.PDFPassword)
	if err != nil {
		log.Printf("credentials pdf generation failed for direct publisher %s: %v", body.Username, err)
		return c.Status(500).JSON(fiber.Map{"error": "Could not generate the credentials PDF: " + err.Error()})
	}

	tx, err := database.DB.Beginx()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed starting transaction."})
	}
	defer tx.Rollback()

	var publisherID string
	err = tx.QueryRow(
		"INSERT INTO publishers (username, password_hash, password_encrypted, role, is_active) VALUES ($1, $2, $3, 'PUBLISHER', TRUE) RETURNING id",
		body.Username, string(hash), encryptedPassword,
	).Scan(&publisherID)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique constraint") {
			return c.Status(409).JSON(fiber.Map{"error": "That username is already taken. Choose another."})
		}
		return c.Status(500).JSON(fiber.Map{"error": "Could not create the publisher account."})
	}

	if _, err = tx.Exec(
		`INSERT INTO publisher_profiles
			(publisher_id, publisher_name, newspaper_name, publication_type, email, mobile, city, state)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		publisherID, body.PublisherName, body.NewspaperName, body.PublicationType, body.Email, body.Mobile, body.City, body.State,
	); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Could not create the publisher profile."})
	}

	var walletID string
	if err = tx.QueryRow("INSERT INTO wallets (publisher_id, balance_inr) VALUES ($1, $2) RETURNING id", publisherID, body.InitialBalance).Scan(&walletID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Could not create the publisher wallet."})
	}
	if body.InitialBalance > 0 {
		if _, err = tx.Exec(
			"INSERT INTO wallet_transactions (wallet_id, publisher_id, txn_type, amount_inr, balance_after_inr, description) VALUES ($1, $2, 'CREDIT', $3, $4, $5)",
			walletID, publisherID, body.InitialBalance, body.InitialBalance, fmt.Sprintf("Initial wallet balance set by admin %s", adminUsername),
		); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Could not record the initial wallet balance."})
		}
	}
	if _, err = tx.Exec("INSERT INTO publisher_credential_documents (publisher_id, pdf_data, issued_by) VALUES ($1, $2, $3)", publisherID, pdfBytes, adminUsername); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Could not store the credentials document."})
	}

	if err := tx.Commit(); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed finalizing publisher creation."})
	}

	return c.JSON(fiber.Map{
		"success":                true,
		"publisher_id":           publisherID,
		"username":               body.Username,
		"credentials_pdf_base64": base64.StdEncoding.EncodeToString(pdfBytes),
		"message":                "Publisher account created and credentials saved in database.",
	})
}

// SaaSAdminApproveRequest provisions a publisher account with an
// admin-chosen username/password, and issues a password-locked PDF
// containing those credentials (the lock password is also admin-chosen).
func SaaSAdminApproveRequest(c *fiber.Ctx) error {
	var body struct {
		RequestID   string `json:"request_id"`
		Username    string `json:"username"`
		Password    string `json:"password"`
		PDFPassword string `json:"pdf_password"`
	}
	if err := c.BodyParser(&body); err != nil || body.RequestID == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Valid request ID required."})
	}
	body.Username = strings.TrimSpace(body.Username)

	if len(body.Username) < 3 {
		return c.Status(400).JSON(fiber.Map{"error": "Username must be at least 3 characters."})
	}
	if len(body.Password) < 6 {
		return c.Status(400).JSON(fiber.Map{"error": "Password must be at least 6 characters."})
	}
	if len(body.PDFPassword) < 6 {
		return c.Status(400).JSON(fiber.Map{"error": "PDF lock password must be at least 6 characters."})
	}
	if database.DB == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Database unavailable."})
	}

	var req struct {
		OwnerName     string `db:"owner_name"`
		NewspaperName string `db:"newspaper_name"`
		Email         string `db:"email"`
		Mobile        string `db:"mobile"`
		City          string `db:"city"`
		State         string `db:"state"`
		Status        string `db:"status"`
	}
	if err := database.DB.Get(&req, "SELECT owner_name, newspaper_name, email, mobile, city, state, status FROM registration_requests WHERE id = $1", body.RequestID); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Registration request not found."})
	}
	if req.Status != "PENDING" {
		return c.Status(409).JSON(fiber.Map{"error": fmt.Sprintf("This request has already been %s.", strings.ToLower(req.Status))})
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Could not secure the password."})
	}
	encryptedPassword, err := secure.Encrypt(body.Password)
	if err != nil {
		log.Printf("password encryption failed during approval: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "Could not secure the password."})
	}

	adminUsername, _ := c.Locals("username").(string)

	// Rendered before opening the DB transaction: it shells out to a headless
	// browser and can take a couple of seconds, which shouldn't hold row locks.
	pdfBytes, err := creds.GeneratePublisherCredentialsPDF(creds.Info{
		NewspaperName: req.NewspaperName,
		OwnerName:     req.OwnerName,
		City:          req.City,
		State:         req.State,
		Mobile:        req.Mobile,
		Email:         req.Email,
		Username:      body.Username,
		Password:      body.Password,
		LoginURL:      config.FrontendURL() + "/login",
		IssuedBy:      adminUsername,
	}, body.PDFPassword)
	if err != nil {
		log.Printf("credentials pdf generation failed for %s: %v", body.Username, err)
		return c.Status(500).JSON(fiber.Map{"error": "Could not generate the credentials PDF: " + err.Error()})
	}

	tx, err := database.DB.Beginx()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed starting transaction."})
	}
	defer tx.Rollback()

	var newPubID string
	err = tx.QueryRow(
		"INSERT INTO publishers (username, password_hash, password_encrypted, role, is_active) VALUES ($1, $2, $3, 'PUBLISHER', TRUE) RETURNING id",
		body.Username, string(hash), encryptedPassword,
	).Scan(&newPubID)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique constraint") {
			return c.Status(409).JSON(fiber.Map{"error": "That username is already taken. Choose another."})
		}
		return c.Status(500).JSON(fiber.Map{"error": "Could not create the publisher account."})
	}
	if _, err = tx.Exec("INSERT INTO wallets (publisher_id, balance_inr) VALUES ($1, 0.00)", newPubID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Could not create the publisher wallet."})
	}
	if _, err = tx.Exec(
		"INSERT INTO publisher_profiles (publisher_id, publisher_name, newspaper_name, email, mobile, city, state) VALUES ($1, $2, $3, $4, $5, $6, $7)",
		newPubID, req.OwnerName, req.NewspaperName, req.Email, req.Mobile, req.City, req.State,
	); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Could not create the publisher profile."})
	}
	if _, err = tx.Exec("INSERT INTO publisher_credential_documents (publisher_id, pdf_data, issued_by) VALUES ($1, $2, $3)", newPubID, pdfBytes, adminUsername); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Could not store the credentials document."})
	}
	if _, err = tx.Exec("UPDATE registration_requests SET status = 'APPROVED', updated_at = NOW() WHERE id = $1", body.RequestID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Could not update the request status."})
	}

	if err := tx.Commit(); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed finalizing approval."})
	}

	return c.JSON(fiber.Map{
		"success":                true,
		"publisher_id":           newPubID,
		"username":               body.Username,
		"credentials_pdf_base64": base64.StdEncoding.EncodeToString(pdfBytes),
		"message":                "Publisher approved and login credentials issued.",
	})
}

func SaaSAdminRejectRequest(c *fiber.Ctx) error {
	var body struct {
		RequestID string `json:"request_id"`
	}
	if err := c.BodyParser(&body); err != nil || body.RequestID == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Valid request ID required."})
	}
	if database.DB == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Database unavailable."})
	}

	res, err := database.DB.Exec("UPDATE registration_requests SET status = 'REJECTED', updated_at = NOW() WHERE id = $1 AND status = 'PENDING'", body.RequestID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed rejecting the request."})
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "Pending request not found (it may already be processed)."})
	}
	return c.JSON(fiber.Map{"success": true, "message": "Publisher application rejected."})
}

// SaaSAdminDownloadCredentialsPDF re-serves the most recently issued locked
// credentials PDF for a publisher (e.g. if the original download was lost).
func SaaSAdminDownloadCredentialsPDF(c *fiber.Ctx) error {
	publisherID := c.Params("publisher_id")
	if publisherID == "" {
		return c.Status(400).JSON(fiber.Map{"error": "publisher_id is required."})
	}
	if database.DB == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Database unavailable."})
	}

	var pdfData []byte
	var username string
	err := database.DB.QueryRow(`
		SELECT d.pdf_data, p.username
		FROM publisher_credential_documents d
		JOIN publishers p ON p.id = d.publisher_id
		WHERE d.publisher_id = $1
		ORDER BY d.created_at DESC LIMIT 1`, publisherID).Scan(&pdfData, &username)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "No credentials document found for this publisher."})
	}

	c.Set("Content-Type", "application/pdf")
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s-credentials.pdf"`, username))
	return c.Send(pdfData)
}

// SaaSAdminWalletAdjust lets an admin credit or debit a publisher's wallet
// directly (bonus credit, goodwill refund, correcting an error), with a
// mandatory reason recorded in the ledger for audit purposes.
func SaaSAdminWalletAdjust(c *fiber.Ctx) error {
	publisherID := c.Params("publisher_id")
	var body struct {
		AmountINR float64 `json:"amount_inr"` // positive = credit, negative = debit
		Reason    string  `json:"reason"`
	}
	if err := c.BodyParser(&body); err != nil || publisherID == "" || body.AmountINR == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "publisher_id and a non-zero amount_inr are required."})
	}
	if strings.TrimSpace(body.Reason) == "" {
		return c.Status(400).JSON(fiber.Map{"error": "A reason is required for wallet adjustments."})
	}
	if database.DB == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Database unavailable."})
	}

	adminUsername, _ := c.Locals("username").(string)

	tx, err := database.DB.Beginx()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed starting transaction."})
	}
	defer tx.Rollback()

	var walletID string
	var currBal float64
	if err := tx.QueryRow("SELECT id, balance_inr FROM wallets WHERE publisher_id = $1 FOR UPDATE", publisherID).Scan(&walletID, &currBal); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Wallet not found for this publisher."})
	}

	newBal := currBal + body.AmountINR
	if newBal < 0 {
		return c.Status(400).JSON(fiber.Map{"error": "This adjustment would make the wallet balance negative."})
	}

	if _, err := tx.Exec("UPDATE wallets SET balance_inr = $1, updated_at = NOW() WHERE id = $2", newBal, walletID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed updating the wallet."})
	}

	txnType := "CREDIT"
	if body.AmountINR < 0 {
		txnType = "DEBIT"
	}
	desc := fmt.Sprintf("Admin adjustment by %s: %s", adminUsername, body.Reason)
	if _, err := tx.Exec(
		"INSERT INTO wallet_transactions (wallet_id, publisher_id, txn_type, amount_inr, balance_after_inr, description) VALUES ($1, $2, $3, $4, $5, $6)",
		walletID, publisherID, txnType, body.AmountINR, newBal, desc,
	); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed recording the ledger entry."})
	}

	if err := tx.Commit(); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed finalizing the adjustment."})
	}

	return c.JSON(fiber.Map{"success": true, "balance_after_inr": newBal, "message": "Wallet balance updated."})
}

// SaaSAdminResetPassword lets an admin set a new login password for a
// publisher and issues a freshly locked credentials PDF reflecting it.
func SaaSAdminResetPassword(c *fiber.Ctx) error {
	publisherID := c.Params("publisher_id")
	var body struct {
		NewPassword string `json:"new_password"`
		PDFPassword string `json:"pdf_password"`
	}
	if err := c.BodyParser(&body); err != nil || publisherID == "" {
		return c.Status(400).JSON(fiber.Map{"error": "publisher_id and new_password are required."})
	}
	if len(body.NewPassword) < 6 {
		return c.Status(400).JSON(fiber.Map{"error": "Password must be at least 6 characters."})
	}
	if len(body.PDFPassword) < 6 {
		return c.Status(400).JSON(fiber.Map{"error": "PDF lock password must be at least 6 characters."})
	}
	if database.DB == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Database unavailable."})
	}

	var info struct {
		Username      string `db:"username"`
		NewspaperName string `db:"newspaper_name"`
		OwnerName     string `db:"publisher_name"`
		City          string `db:"city"`
		State         string `db:"state"`
		Mobile        string `db:"mobile"`
		Email         string `db:"email"`
	}
	err := database.DB.Get(&info, `
		SELECT p.username,
		       COALESCE(pp.newspaper_name, '') AS newspaper_name,
		       COALESCE(pp.publisher_name, '') AS publisher_name,
		       COALESCE(pp.city, '') AS city,
		       COALESCE(pp.state, '') AS state,
		       COALESCE(pp.mobile, '') AS mobile,
		       COALESCE(pp.email, '') AS email
		FROM publishers p
		LEFT JOIN publisher_profiles pp ON pp.publisher_id = p.id
		WHERE p.id = $1 AND p.role = 'PUBLISHER'`, publisherID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Publisher not found."})
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(body.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Could not secure the password."})
	}
	encryptedPassword, err := secure.Encrypt(body.NewPassword)
	if err != nil {
		log.Printf("password encryption failed during reset: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "Could not secure the password."})
	}

	adminUsername, _ := c.Locals("username").(string)
	pdfBytes, err := creds.GeneratePublisherCredentialsPDF(creds.Info{
		NewspaperName: info.NewspaperName,
		OwnerName:     info.OwnerName,
		City:          info.City,
		State:         info.State,
		Mobile:        info.Mobile,
		Email:         info.Email,
		Username:      info.Username,
		Password:      body.NewPassword,
		LoginURL:      config.FrontendURL() + "/login",
		IssuedBy:      adminUsername,
	}, body.PDFPassword)
	if err != nil {
		log.Printf("credentials pdf generation failed for %s: %v", info.Username, err)
		return c.Status(500).JSON(fiber.Map{"error": "Could not generate the updated credentials PDF: " + err.Error()})
	}

	tx, err := database.DB.Beginx()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed starting transaction."})
	}
	defer tx.Rollback()

	if _, err := tx.Exec("UPDATE publishers SET password_hash = $1, password_encrypted = $2 WHERE id = $3", string(hash), encryptedPassword, publisherID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed updating the password."})
	}
	if _, err := tx.Exec("INSERT INTO publisher_credential_documents (publisher_id, pdf_data, issued_by) VALUES ($1, $2, $3)", publisherID, pdfBytes, adminUsername); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed storing the updated credentials document."})
	}
	if err := tx.Commit(); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed finalizing the password reset."})
	}

	return c.JSON(fiber.Map{
		"success":                true,
		"credentials_pdf_base64": base64.StdEncoding.EncodeToString(pdfBytes),
		"message":                "Password reset and a new credentials PDF was generated.",
	})
}
