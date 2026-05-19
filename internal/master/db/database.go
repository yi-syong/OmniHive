package db

import (
	"fmt"
	"log"

	"github.com/yi-syong/OmniHive/internal/master/config"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

// Init establishes the connection to PostgreSQL and auto-migrates models.
func Init(cfg config.DatabaseConfig) error {
	dsn := cfg.DSN()
	log.Printf("Connecting to database: %s@%s:%d/%s", cfg.User, cfg.Host, cfg.Port, cfg.DBName)

	var err error
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		return fmt.Errorf("failed to connect database: %w", err)
	}

	// Auto Migrate the schema
	log.Println("Auto-migrating database models...")
	if err := DB.AutoMigrate(&Map{}, &Node{}, &Edge{}); err != nil {
		return fmt.Errorf("failed to auto-migrate database: %w", err)
	}

	log.Println("Database initialization complete.")
	return nil
}
