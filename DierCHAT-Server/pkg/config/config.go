package config

import (
	"encoding/json"
	"os"
	"strconv"
	"time"
)

type Config struct {
	Server   ServerConfig   `json:"server"`
	Database DatabaseConfig `json:"database"`
	Redis    RedisConfig    `json:"redis"`
	JWT      JWTConfig      `json:"jwt"`
	Media    MediaConfig    `json:"media"`
	SMS      SMSConfig      `json:"sms"`
	SMTP     SMTPConfig     `json:"smtp"`
	Push     PushConfig     `json:"push"`
}

type PushConfig struct {
	VAPIDPublicKey  string `json:"vapid_public_key"`
	VAPIDPrivateKey string `json:"vapid_private_key"`
}

type ServerConfig struct {
	Host        string `json:"host"`
	Port        int    `json:"port"`
	WSPort      int    `json:"ws_port"`
	TLSCert     string `json:"tls_cert"`
	TLSKey      string `json:"tls_key"`
	MaxFileSize int64  `json:"max_file_size"`
}

type DatabaseConfig struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	User     string `json:"user"`
	Password string `json:"password"`
	DBName   string `json:"dbname"`
	SSLMode  string `json:"sslmode"`
}

func (d DatabaseConfig) DSN() string {
	return "host=" + d.Host +
		" port=" + itoa(d.Port) +
		" user=" + d.User +
		" password=" + d.Password +
		" dbname=" + d.DBName +
		" sslmode=" + d.SSLMode
}

type RedisConfig struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Password string `json:"password"`
	DB       int    `json:"db"`
}

type JWTConfig struct {
	Secret         string `json:"secret"`
	ExpirationStr  string `json:"expiration"`
	Expiration     time.Duration
}

func (j *JWTConfig) Parse() {
	if j.ExpirationStr != "" {
		if d, err := time.ParseDuration(j.ExpirationStr); err == nil {
			j.Expiration = d
		}
	}
	if j.Expiration == 0 {
		j.Expiration = 720 * time.Hour
	}
}

type MediaConfig struct {
	StoragePath string `json:"storage_path"`
	MaxFileSize int64  `json:"max_file_size"`
	CDNBaseURL  string `json:"cdn_base_url"`
}

type SMSConfig struct {
	Provider string `json:"provider"`
	Login    string `json:"login"`    // SMSC: логин
	APIKey   string `json:"api_key"` // SMSC: пароль
	Sender   string `json:"sender"`
}

type SMTPConfig struct {
	Host     string `json:"host"`     // smtp.gmail.com
	Port     int    `json:"port"`     // 587
	Login    string `json:"login"`
	Password string `json:"password"` // Gmail: application password
	From     string `json:"from"`     // dier.groups@gmail.com
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return DefaultConfig(), nil
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	cfg.JWT.Parse()
	ApplyEnvOverrides(&cfg)
	return &cfg, nil
}

// ApplyEnvOverrides — переопределение из переменных окружения (для хостинга)
func ApplyEnvOverrides(cfg *Config) {
	if v := os.Getenv("DB_HOST"); v != "" {
		cfg.Database.Host = v
	}
	if v := os.Getenv("DB_PORT"); v != "" {
		if p, err := strconv.Atoi(v); err == nil {
			cfg.Database.Port = p
		}
	}
	if v := os.Getenv("DB_USER"); v != "" {
		cfg.Database.User = v
	}
	if v := os.Getenv("DB_PASSWORD"); v != "" {
		cfg.Database.Password = v
	}
	if v := os.Getenv("DB_NAME"); v != "" {
		cfg.Database.DBName = v
	}
	if v := os.Getenv("REDIS_HOST"); v != "" {
		cfg.Redis.Host = v
	}
	if v := os.Getenv("REDIS_PORT"); v != "" {
		if p, err := strconv.Atoi(v); err == nil {
			cfg.Redis.Port = p
		}
	}
	if v := os.Getenv("REDIS_PASSWORD"); v != "" {
		cfg.Redis.Password = v
	}
	if v := os.Getenv("JWT_SECRET"); v != "" {
		cfg.JWT.Secret = v
	}
	if v := os.Getenv("SMTP_LOGIN"); v != "" {
		cfg.SMTP.Login = v
	}
	if v := os.Getenv("SMTP_PASSWORD"); v != "" {
		cfg.SMTP.Password = v
	}
	if v := os.Getenv("SMTP_FROM"); v != "" {
		cfg.SMTP.From = v
	}
	if v := os.Getenv("CDN_BASE_URL"); v != "" {
		cfg.Media.CDNBaseURL = v
	}
	// Локальный запуск: если :9000 занят, можно DIERCHAT_HTTP_PORT=9001
	if v := os.Getenv("DIERCHAT_HTTP_PORT"); v != "" {
		if p, err := strconv.Atoi(v); err == nil && p > 0 {
			cfg.Server.Port = p
		}
	}
}

func DefaultConfig() *Config {
	return &Config{
		Server: ServerConfig{
			Host:        "0.0.0.0",
			Port:        8080,
			WSPort:      8081,
			MaxFileSize: 2 << 30, // 2GB
		},
		Database: DatabaseConfig{
			Host:     "localhost",
			Port:     5432,
			User:     "dierchat",
			Password: "dierchat",
			DBName:   "dierchat",
			SSLMode:  "disable",
		},
		Redis: RedisConfig{
			Host: "localhost",
			Port: 6379,
			DB:   0,
		},
		JWT: JWTConfig{
			Secret:     "dierchat-secret-change-in-production",
			Expiration: 720 * time.Hour, // 30 days
		},
		Media: MediaConfig{
			StoragePath: "./media",
			MaxFileSize: 2 << 30,
			CDNBaseURL:  "http://localhost:8080/media",
		},
		SMS: SMSConfig{
			Provider: "smsc",
			APIKey:   "",
			Sender:   "DierCHAT",
		},
		SMTP: SMTPConfig{
			Host: "smtp.gmail.com",
			Port: 587,
			From: "dier.groups@gmail.com",
		},
		Push: PushConfig{},
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	buf := make([]byte, 0, 8)
	for n > 0 {
		buf = append([]byte{byte('0' + n%10)}, buf...)
		n /= 10
	}
	return string(buf)
}
