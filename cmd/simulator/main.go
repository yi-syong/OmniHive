package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/yi-syong/OmniHive/internal/simulator/config"
	"github.com/yi-syong/OmniHive/internal/simulator/engine"
)

func main() {
	configPath := flag.String("config", "configs/simulator.yaml", "path to simulator config file")
	flag.Parse()

	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("🐝 OmniHive Vehicle Simulator starting...")

	// Load configuration
	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	log.Printf("Config loaded: %d vehicles, factory %.0fx%.0f, MQTT: %s",
		cfg.Vehicle.Count, cfg.Factory.Width, cfg.Factory.Height, cfg.MQTT.Broker)

	// Create engine
	eng := engine.New(cfg)

	// Setup graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		sig := <-sigCh
		log.Printf("Received signal %v, shutting down...", sig)
		cancel()
	}()

	// Run engine
	if err := eng.Run(ctx); err != nil {
		log.Fatalf("Engine error: %v", err)
	}

	log.Println("🐝 Simulator stopped.")
}
