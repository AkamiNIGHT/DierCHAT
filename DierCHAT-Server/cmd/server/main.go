package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/dierchat/server/internal/auth"
	"github.com/dierchat/server/internal/bots"
	"github.com/dierchat/server/internal/friends"
	"github.com/dierchat/server/internal/media"
	"github.com/dierchat/server/internal/messaging"
	"github.com/dierchat/server/internal/news"
	"github.com/dierchat/server/internal/push"
	"github.com/dierchat/server/internal/stories"
	"github.com/dierchat/server/internal/storage"
	"github.com/dierchat/server/internal/userstickers"
	"github.com/dierchat/server/internal/ws"
	"github.com/dierchat/server/pkg/config"
	"github.com/dierchat/server/pkg/jwt"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("DierCHAT Server запускается...")

	configPath := "config.json"
	if p := os.Getenv("DIERCHAT_CONFIG"); p != "" {
		configPath = p
	} else if _, err := os.Stat("config.local.json"); err == nil {
		// Local dev: docker-compose.local.yml matches config.local.json (no env var needed).
		configPath = "config.local.json"
		log.Println("Конфиг: config.local.json (локальная разработка). Для другого файла задайте DIERCHAT_CONFIG.")
	}
	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatalf("Ошибка загрузки конфигурации: %v", err)
	}
	if cfg.SMTP.Host == "" || cfg.SMTP.From == "" {
		log.Println("Внимание: SMTP не задан (host/from). Код входа будет только в логах сервера, письма не уходят.")
	} else if cfg.SMTP.Login == "" || cfg.SMTP.Password == "" {
		log.Println("Внимание: SMTP не заданы login/password — отправка писем не будет работать.")
	}

	db := waitPostgres(cfg.Database)
	if db == nil {
		log.Println("Сервер запускается без базы данных (только для разработки)")
	} else {
		defer db.Close()
		log.Println("PostgreSQL подключен")

		for _, name := range []string{"001_init.sql", "002_chat_features.sql", "003_chat_tabs.sql", "004_polls.sql", "005_news_reports.sql", "006_reactions_pinned_blocked.sql", "007_push_subscriptions.sql", "008_email_auth.sql", "009_slow_mode.sql", "010_admin_perms.sql", "011_self_destruct.sql", "012_stories.sql", "013_channel_discussion.sql", "014_user_stickers.sql", "015_sticker_packs.sql", "016_friendships.sql", "017_message_forward_from_name.sql"} {
			migrationSQL, err := os.ReadFile("migrations/" + name)
			if err == nil {
				if err := db.RunMigrations(context.Background(), string(migrationSQL)); err != nil {
					// Docker initdb уже применил 001_init.sql — дубликат не критичен
					if strings.Contains(err.Error(), "already exists") {
						log.Printf("Миграция %s: пропуск (уже применена)", name)
					} else {
						log.Printf("Предупреждение: миграция %s: %v", name, err)
					}
				} else {
					log.Printf("Миграция %s применена", name)
				}
			}
		}
	}

	rdb := waitRedis(cfg.Redis)
	if rdb == nil {
		log.Println("Сервер запускается без Redis (только для разработки)")
	} else {
		defer rdb.Close()
		log.Println("Redis подключен")
	}

	jwtMgr := jwt.NewManager(cfg.JWT.Secret, cfg.JWT.Expiration)

	hub := ws.NewHub()
	go hub.Run()
	log.Println("WebSocket Hub запущен")

	authSvc := auth.NewService(db, rdb, jwtMgr, &cfg.SMTP)
	msgSvc := messaging.NewService(db, rdb)
	mediaSvc := media.NewService(db, cfg.Media)
	botSvc := bots.NewService(db)
	newsSvc := news.NewService(db)
	pushSvc := push.NewService(db, cfg.Push.VAPIDPublicKey, cfg.Push.VAPIDPrivateKey)
	storiesSvc := stories.NewService(db)
	stickerSvc := userstickers.NewService(db)
	friendsSvc := friends.NewService(db)

	api := NewAPI(authSvc, msgSvc, mediaSvc, botSvc, newsSvc, hub, pushSvc, storiesSvc, stickerSvc, friendsSvc)

	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	server := &http.Server{
		Addr:         addr,
		Handler:      api.Routes(),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Printf("HTTP сервер запущен на %s", addr)
		var err error
		if cfg.Server.TLSCert != "" && cfg.Server.TLSKey != "" {
			err = server.ListenAndServeTLS(cfg.Server.TLSCert, cfg.Server.TLSKey)
		} else {
			err = server.ListenAndServe()
		}
		if err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP ошибка: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Завершение работы сервера...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Ошибка завершения: %v", err)
	}
	log.Println("DierCHAT Server остановлен")
}

// waitPostgres — пока Docker поднимает Postgres, до ~2 минут повторяем подключение.
func waitPostgres(cfg config.DatabaseConfig) *storage.PostgresStore {
	maxWait := 120 * time.Second
	if v := os.Getenv("DIERCHAT_PG_MAX_WAIT_SEC"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			maxWait = time.Duration(n) * time.Second
		}
	}
	if maxWait == 0 {
		db, err := storage.NewPostgresStore(cfg)
		if err != nil {
			log.Printf("Предупреждение: PostgreSQL недоступен: %v", err)
			return nil
		}
		return db
	}
	interval := 2 * time.Second
	deadline := time.Now().Add(maxWait)
	var lastErr error
	for {
		db, err := storage.NewPostgresStore(cfg)
		if err == nil {
			return db
		}
		lastErr = err
		if time.Now().After(deadline) {
			log.Printf("Предупреждение: PostgreSQL недоступен после ожидания %v: %v", maxWait, lastErr)
			return nil
		}
		left := time.Until(deadline).Round(time.Second)
		log.Printf("Ожидание PostgreSQL (осталось ~%v): %v", left, err)
		time.Sleep(interval)
	}
}

func waitRedis(cfg config.RedisConfig) *storage.RedisStore {
	maxWait := 60 * time.Second
	if v := os.Getenv("DIERCHAT_REDIS_MAX_WAIT_SEC"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			maxWait = time.Duration(n) * time.Second
		}
	}
	if maxWait == 0 {
		rdb, err := storage.NewRedisStore(cfg)
		if err != nil {
			log.Printf("Предупреждение: Redis недоступен: %v", err)
			return nil
		}
		return rdb
	}
	interval := time.Second
	deadline := time.Now().Add(maxWait)
	var lastErr error
	for {
		rdb, err := storage.NewRedisStore(cfg)
		if err == nil {
			return rdb
		}
		lastErr = err
		if time.Now().After(deadline) {
			log.Printf("Предупреждение: Redis недоступен после ожидания %v: %v", maxWait, lastErr)
			return nil
		}
		log.Printf("Ожидание Redis (осталось ~%v): %v", time.Until(deadline).Round(time.Second), err)
		time.Sleep(interval)
	}
}
