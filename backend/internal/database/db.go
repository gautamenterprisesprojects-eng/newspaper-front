package database

import (
	"database/sql"
	"fmt"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/jmoiron/sqlx"
)

var DB *sqlx.DB

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// databaseNameFromConn extracts the database name from a postgres URL.
func databaseNameFromConn(connStr string) string {
	if u, err := url.Parse(connStr); err == nil {
		if name := strings.TrimPrefix(u.Path, "/"); name != "" {
			return name
		}
	}
	return "newspaper_saas"
}

// pq quotes an identifier for use in DDL, which cannot be parameterized.
func pq(identifier string) string {
	return `"` + strings.ReplaceAll(identifier, `"`, `""`) + `"`
}

// InitDB initializes PostgreSQL connection pool and automatically runs additive database migrations
func InitDB() (*sqlx.DB, error) {
	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		// Assemble from discrete DB_* variables (as supplied by docker-compose)
		// before falling back to a local development default.
		host := envOr("DB_HOST", "localhost")
		port := envOr("DB_PORT", "5432")
		user := envOr("DB_USER", "postgres")
		pass := envOr("DB_PASS", "KingR@123")
		name := envOr("DB_NAME", "newspaper_saas")
		sslMode := envOr("DB_SSLMODE", "disable")

		connStr = fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s",
			url.QueryEscape(user), url.QueryEscape(pass), host, port, name, sslMode)
	}

	dbName := databaseNameFromConn(connStr)
	log.Printf("🐘 [Database Engine] Connecting to PostgreSQL database [%s]...", dbName)

	db, err := sqlx.Connect("pgx", connStr)
	if err != nil {
		// If the database doesn't exist, connect to the default 'postgres'
		// database and create it. Driven by the configured name rather than a
		// hardcoded one, so this also works for non-default deployments.
		if strings.Contains(err.Error(), fmt.Sprintf("database %q does not exist", dbName)) || strings.Contains(err.Error(), "3D000") {
			log.Printf("⚠️ [Database Engine] Target database does not exist. Attempting automatic creation of database [%s]...", dbName)
			defaultConnStr := strings.Replace(connStr, "/"+dbName, "/postgres", 1)
			tempDB, tempErr := sql.Open("pgx", defaultConnStr)
			if tempErr == nil {
				_, createErr := tempDB.Exec(fmt.Sprintf("CREATE DATABASE %s", pq(dbName)))
				tempDB.Close()
				if createErr == nil || strings.Contains(createErr.Error(), "already exists") {
					log.Printf("✅ [Database Engine] Successfully created database [%s]! Retrying connection...", dbName)
					db, err = sqlx.Connect("pgx", connStr)
				}
			}
		}

		if err != nil {
			log.Printf("⚠️ [Database Engine] Could not connect to PostgreSQL server: %v", err)
			log.Println("💡 [Tip] Ensure your local PostgreSQL server is running and credentials in backend/.env match your local setup.")
			return nil, err
		}
	}

	// Configure connection pool for high availability
	db.SetMaxOpenConns(50)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(30 * time.Minute)

	log.Println("✅ [Database Engine] Successfully connected to PostgreSQL (newspaper_saas)! Verifying SaaS schema...")

	// Execute migrations in sequence
	if err := runMigrations(db); err != nil {
		log.Printf("⚠️ [Database Engine] Migration script execution notice/warning: %v", err)
	}

	DB = db
	return db, nil
}

func runMigrations(db *sqlx.DB) error {
	migrationsDir := os.Getenv("MIGRATIONS_DIR")
	if migrationsDir == "" {
		migrationsDir = "./migrations_v2"
	}
	if _, err := os.Stat(migrationsDir); os.IsNotExist(err) {
		// Allow running from the repository root as well as from backend/
		if _, altErr := os.Stat("./backend/migrations_v2"); altErr == nil {
			migrationsDir = "./backend/migrations_v2"
		}
	}

	files, err := os.ReadDir(migrationsDir)
	if err != nil {
		return fmt.Errorf("cannot read migrations directory: %v", err)
	}

	var sqlFiles []string
	for _, f := range files {
		if !f.IsDir() && strings.HasSuffix(f.Name(), ".sql") {
			sqlFiles = append(sqlFiles, filepath.Join(migrationsDir, f.Name()))
		}
	}
	sort.Strings(sqlFiles)

	for _, file := range sqlFiles {
		log.Printf("📂 [Migration Engine] Executing migration script: %s", filepath.Base(file))
		content, err := os.ReadFile(file)
		if err != nil {
			return fmt.Errorf("failed reading file %s: %v", file, err)
		}

		// Execute SQL script
		_, err = db.Exec(string(content))
		if err != nil {
			log.Printf("ℹ️ [Migration Engine] Note on %s: %v (likely already applied or extension already enabled)", filepath.Base(file), err)
		} else {
			log.Printf("✅ [Migration Engine] Applied %s successfully!", filepath.Base(file))
		}
	}

	return nil
}
