package storage

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/dierchat/server/pkg/config"
)

type RedisStore struct {
	Client *redis.Client
}

func NewRedisStore(cfg config.RedisConfig) (*RedisStore, error) {
	client := redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%d", cfg.Host, cfg.Port),
		Password: cfg.Password,
		DB:       cfg.DB,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("ping redis: %w", err)
	}

	return &RedisStore{Client: client}, nil
}

func (r *RedisStore) Close() error {
	return r.Client.Close()
}

func (r *RedisStore) SetUserOnline(ctx context.Context, userID string) error {
	return r.Client.Set(ctx, "online:"+userID, "1", 5*time.Minute).Err()
}

func (r *RedisStore) SetUserOffline(ctx context.Context, userID string) error {
	return r.Client.Del(ctx, "online:"+userID).Err()
}

func (r *RedisStore) IsUserOnline(ctx context.Context, userID string) (bool, error) {
	val, err := r.Client.Exists(ctx, "online:"+userID).Result()
	if err != nil {
		return false, err
	}
	return val > 0, nil
}

func (r *RedisStore) SetTyping(ctx context.Context, chatID, userID string) error {
	key := fmt.Sprintf("typing:%s:%s", chatID, userID)
	return r.Client.Set(ctx, key, "1", 6*time.Second).Err()
}

func (r *RedisStore) StoreAuthCode(ctx context.Context, email, code string) error {
	return r.Client.Set(ctx, "authcode:"+email, code, 5*time.Minute).Err()
}

func (r *RedisStore) GetAuthCode(ctx context.Context, email string) (string, error) {
	return r.Client.Get(ctx, "authcode:"+email).Result()
}

func (r *RedisStore) DeleteAuthCode(ctx context.Context, email string) error {
	return r.Client.Del(ctx, "authcode:"+email).Err()
}

func (r *RedisStore) StoreAuthAttempts(ctx context.Context, email string, count int) error {
	return r.Client.Set(ctx, "authattempts:"+email, count, 10*time.Minute).Err()
}

func (r *RedisStore) GetAuthAttempts(ctx context.Context, email string) (int, error) {
	val, err := r.Client.Get(ctx, "authattempts:"+email).Result()
	if err == redis.Nil {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	var n int
	_, err = fmt.Sscanf(val, "%d", &n)
	return n, err
}

func (r *RedisStore) IncrementAuthAttempts(ctx context.Context, email string) (int, error) {
	key := "authattempts:" + email
	pipe := r.Client.Pipeline()
	incr := pipe.Incr(ctx, key)
	pipe.Expire(ctx, key, 10*time.Minute)
	if _, err := pipe.Exec(ctx); err != nil {
		return 0, err
	}
	return int(incr.Val()), nil
}

func (r *RedisStore) DeleteAuthAttempts(ctx context.Context, email string) error {
	return r.Client.Del(ctx, "authattempts:"+email).Err()
}

func (r *RedisStore) Store2FATempToken(ctx context.Context, token, userID string) error {
	return r.Client.Set(ctx, "2fa:"+token, userID, 5*time.Minute).Err()
}

func (r *RedisStore) Get2FATempToken(ctx context.Context, token string) (string, error) {
	return r.Client.Get(ctx, "2fa:"+token).Result()
}

func (r *RedisStore) Delete2FATempToken(ctx context.Context, token string) error {
	return r.Client.Del(ctx, "2fa:"+token).Err()
}

func (r *RedisStore) StorePasswordResetCode(ctx context.Context, email, code string) error {
	return r.Client.Set(ctx, "pwdreset:"+email, code, 10*time.Minute).Err()
}

func (r *RedisStore) GetPasswordResetCode(ctx context.Context, email string) (string, error) {
	return r.Client.Get(ctx, "pwdreset:"+email).Result()
}

func (r *RedisStore) DeletePasswordResetCode(ctx context.Context, email string) error {
	return r.Client.Del(ctx, "pwdreset:"+email).Err()
}
