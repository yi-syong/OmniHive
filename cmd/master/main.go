package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/yi-syong/OmniHive/internal/master/api"
	"github.com/yi-syong/OmniHive/internal/master/config"
	"github.com/yi-syong/OmniHive/internal/master/db"
	mqtthandler "github.com/yi-syong/OmniHive/internal/master/mqtt"
	"github.com/yi-syong/OmniHive/internal/master/order"
	"github.com/yi-syong/OmniHive/internal/master/store"
	"github.com/yi-syong/OmniHive/internal/master/websocket"
)

func main() {
	configPath := flag.String("config", "configs/master.yaml", "path to master config file")
	flag.Parse()

	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("🐝 OmniHive Master Control starting...")

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	log.Printf("Config loaded: server %s, MQTT: %s", cfg.Server.Addr(), cfg.MQTT.Broker)

	if err := db.Init(cfg.Database); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	vehicleStore := store.New(30 * time.Second)
	wsHub := websocket.NewHub()
	go wsHub.Run()

	mqttHandler, err := mqtthandler.New(
		cfg.MQTT.Broker, cfg.MQTT.ClientID,
		cfg.MQTT.Username, cfg.MQTT.Password,
		vehicleStore, wsHub,
	)
	if err != nil {
		log.Fatalf("Failed to connect to MQTT: %v", err)
	}
	defer mqttHandler.Close()
	mqttHandler.StartTimeoutChecker(10 * time.Second)

	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(gin.LoggerWithConfig(gin.LoggerConfig{SkipPaths: []string{"/health"}}))

	orderManager := order.NewManager(mqttHandler.GetClient(), vehicleStore)

	apiHandler := api.NewHandler(vehicleStore, wsHub, orderManager)
	apiHandler.SetupRoutes(router)

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("Shutting down...")
		os.Exit(0)
	}()

	log.Printf("🐝 Master Control listening on %s", cfg.Server.Addr())
	if err := router.Run(cfg.Server.Addr()); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
