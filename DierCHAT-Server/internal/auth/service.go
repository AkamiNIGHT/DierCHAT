package auth

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/dierchat/server/internal/storage"
	"github.com/dierchat/server/pkg/config"
	"github.com/dierchat/server/pkg/email"
	"github.com/dierchat/server/pkg/jwt"
	"github.com/dierchat/server/pkg/models"
)

var (
	ErrInvalidCode      = errors.New("invalid verification code")
	ErrCodeExpired      = errors.New("verification code expired")
	ErrUserNotFound     = errors.New("user not found")
	ErrUserExists       = errors.New("user already exists")
	ErrInvalidSession   = errors.New("invalid session")
	ErrTooManyAttempts  = errors.New("too many verification attempts")
	ErrDBUnavailable    = errors.New("database unavailable")
	ErrInvalidPassword  = errors.New("invalid password")
	ErrInvalid2FAToken  = errors.New("invalid or expired 2FA token")
)

// MaxVerifyAttempts — ТЗ §1: не более 3 неверных попыток ввода кода (далее блокировка 10 мин в Redis).
const MaxVerifyAttempts = 3

type VerifyResult struct {
	User      *models.User
	Token     string
	Needs2FA  bool
	Temp2FA   string
}

type Service struct {
	db        *storage.PostgresStore
	redis     *storage.RedisStore
	jwt       *jwt.Manager
	smtpCfg   *config.SMTPConfig
}

type SessionInfo struct {
	ID        uuid.UUID `json:"id"`
	Device    string    `json:"device"`
	IP        string    `json:"ip"`
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
}

func NewService(db *storage.PostgresStore, redis *storage.RedisStore, jwtMgr *jwt.Manager, smtpCfg *config.SMTPConfig) *Service {
	return &Service{db: db, redis: redis, jwt: jwtMgr, smtpCfg: smtpCfg}
}

func (s *Service) SendCode(ctx context.Context, emailAddr string) error {
	code, err := generateCode(6)
	if err != nil {
		return fmt.Errorf("generate code: %w", err)
	}

	if s.redis != nil {
		if err := s.redis.StoreAuthCode(ctx, emailAddr, code); err != nil {
			return fmt.Errorf("store code: %w", err)
		}
	}

	if s.smtpCfg != nil && s.smtpCfg.Host != "" && s.smtpCfg.From != "" {
		if err := email.Send(*s.smtpCfg, emailAddr, "Код входа в Dier Chat", fmt.Sprintf("Ваш код: %s. Никому не сообщайте его.", code)); err != nil {
			return fmt.Errorf("send email: %w", err)
		}
	} else {
		fmt.Printf("[AUTH] Verification code for %s: %s\n", emailAddr, code)
	}
	return nil
}

func (s *Service) VerifyCode(ctx context.Context, email, code, device, ip string) (*VerifyResult, error) {
	if s.db == nil {
		return nil, ErrDBUnavailable
	}
	if s.redis != nil {
		attempts, _ := s.redis.GetAuthAttempts(ctx, email)
		if attempts >= MaxVerifyAttempts {
			return nil, ErrTooManyAttempts
		}
		stored, err := s.redis.GetAuthCode(ctx, email)
		if err != nil {
			count, _ := s.redis.IncrementAuthAttempts(ctx, email)
			if count >= MaxVerifyAttempts {
				return nil, ErrTooManyAttempts
			}
			return nil, ErrCodeExpired
		}
		if stored != code {
			count, _ := s.redis.IncrementAuthAttempts(ctx, email)
			if count >= MaxVerifyAttempts {
				return nil, ErrTooManyAttempts
			}
			return nil, ErrInvalidCode
		}
		_ = s.redis.DeleteAuthCode(ctx, email)
		_ = s.redis.DeleteAuthAttempts(ctx, email)
	}

	user, err := s.findOrCreateUser(ctx, email)
	if err != nil {
		return nil, fmt.Errorf("find/create user: %w", err)
	}

	// 2FA: если у пользователя включён облачный пароль — требуем его
	var hasPassword bool
	_ = s.db.Pool.QueryRow(ctx,
		`SELECT (password_hash IS NOT NULL AND password_hash != '') FROM users WHERE id = $1`,
		user.ID,
	).Scan(&hasPassword)

	if hasPassword && s.redis != nil {
		tempToken := uuid.New().String()
		if err := s.redis.Store2FATempToken(ctx, tempToken, user.ID.String()); err != nil {
			return nil, fmt.Errorf("store 2fa token: %w", err)
		}
		return &VerifyResult{User: user, Needs2FA: true, Temp2FA: tempToken}, nil
	}

	sessionID := uuid.New()
	token, err := s.jwt.Generate(user.ID, sessionID)
	if err != nil {
		return nil, fmt.Errorf("generate token: %w", err)
	}

	_, err = s.db.Pool.Exec(ctx,
		`INSERT INTO sessions (id, user_id, token, device, ip, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		sessionID, user.ID, token, device, ip,
		time.Now().Add(720*time.Hour),
	)
	if err != nil {
		return nil, fmt.Errorf("create session: %w", err)
	}

	return &VerifyResult{User: user, Token: token}, nil
}

func (s *Service) Verify2FA(ctx context.Context, tempToken, password, device, ip string) (*models.User, string, error) {
	if s.redis == nil {
		return nil, "", ErrInvalid2FAToken
	}
	userIDStr, err := s.redis.Get2FATempToken(ctx, tempToken)
	if err != nil {
		return nil, "", ErrInvalid2FAToken
	}
	_ = s.redis.Delete2FATempToken(ctx, tempToken)

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return nil, "", ErrInvalid2FAToken
	}

	var hash string
	err = s.db.Pool.QueryRow(ctx,
		`SELECT COALESCE(password_hash,'') FROM users WHERE id = $1`,
		userID,
	).Scan(&hash)
	if err != nil || hash == "" {
		return nil, "", ErrInvalid2FAToken
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)); err != nil {
		return nil, "", ErrInvalidPassword
	}

	user, err := s.GetUser(ctx, userID)
	if err != nil {
		return nil, "", err
	}

	sessionID := uuid.New()
	token, err := s.jwt.Generate(user.ID, sessionID)
	if err != nil {
		return nil, "", fmt.Errorf("generate token: %w", err)
	}

	_, err = s.db.Pool.Exec(ctx,
		`INSERT INTO sessions (id, user_id, token, device, ip, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		sessionID, user.ID, token, device, ip,
		time.Now().Add(720*time.Hour),
	)
	if err != nil {
		return nil, "", fmt.Errorf("create session: %w", err)
	}

	return user, token, nil
}

func (s *Service) SendPasswordResetCode(ctx context.Context, emailAddr string) error {
	code, err := generateCode(6)
	if err != nil {
		return fmt.Errorf("generate code: %w", err)
	}
	if s.redis != nil {
		if err := s.redis.StorePasswordResetCode(ctx, emailAddr, code); err != nil {
			return fmt.Errorf("store reset code: %w", err)
		}
	}
	if s.smtpCfg != nil && s.smtpCfg.Host != "" && s.smtpCfg.From != "" {
		if err := email.Send(*s.smtpCfg, emailAddr, "Сброс пароля DierCHAT", fmt.Sprintf("Ваш код для сброса пароля: %s", code)); err != nil {
			return fmt.Errorf("send email: %w", err)
		}
	} else {
		fmt.Printf("[AUTH] Password reset code for %s: %s\n", emailAddr, code)
	}
	return nil
}

func (s *Service) ResetPassword(ctx context.Context, emailAddr, code, newPassword string) error {
	if s.redis != nil {
		stored, err := s.redis.GetPasswordResetCode(ctx, emailAddr)
		if err != nil {
			return ErrCodeExpired
		}
		if stored != code {
			return ErrInvalidCode
		}
		_ = s.redis.DeletePasswordResetCode(ctx, emailAddr)
	}

	var userID uuid.UUID
	err := s.db.Pool.QueryRow(ctx,
		`SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`,
		emailAddr,
	).Scan(&userID)
	if err != nil {
		return ErrUserNotFound
	}

	return s.SetPassword(ctx, userID, newPassword)
}

func (s *Service) HasPassword(ctx context.Context, userID uuid.UUID) (bool, error) {
	var has bool
	err := s.db.Pool.QueryRow(ctx,
		`SELECT (password_hash IS NOT NULL AND password_hash != '') FROM users WHERE id = $1`,
		userID,
	).Scan(&has)
	return has, err
}

func (s *Service) ValidateToken(ctx context.Context, token string) (*models.User, error) {
	if s.db == nil {
		return nil, ErrDBUnavailable
	}
	claims, err := s.jwt.Validate(token)
	if err != nil {
		return nil, ErrInvalidSession
	}

	var user models.User
	err = s.db.Pool.QueryRow(ctx,
		`SELECT id, COALESCE(phone,''), COALESCE(email,''), COALESCE(username,''), display_name, COALESCE(avatar_url,''),
		        COALESCE(bio,''), last_seen, online, created_at
		 FROM users WHERE id = $1 AND deleted_at IS NULL`,
		claims.UserID,
	).Scan(&user.ID, &user.Phone, &user.Email, &user.Username, &user.DisplayName,
		&user.AvatarURL, &user.Bio, &user.LastSeen, &user.Online, &user.CreatedAt)

	if err != nil {
		return nil, ErrUserNotFound
	}

	return &user, nil
}

func (s *Service) UpdateProfile(ctx context.Context, userID uuid.UUID, name, username, bio string, avatarURL *string) error {
	if s.db == nil {
		return ErrDBUnavailable
	}
	// Пустой username сохраняем как NULL (UNIQUE допускает несколько NULL)
	var uname *string
	if username != "" {
		uname = &username
	}
	_, err := s.db.Pool.Exec(ctx,
		`UPDATE users SET display_name = $2, username = $3, bio = $4,
			avatar_url = COALESCE($5, avatar_url),
			updated_at = NOW()
		 WHERE id = $1`,
		userID, name, uname, bio, avatarURL,
	)
	return err
}

func (s *Service) SetPassword(ctx context.Context, userID uuid.UUID, password string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = s.db.Pool.Exec(ctx,
		`UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
		userID, string(hash),
	)
	return err
}

func (s *Service) GetUser(ctx context.Context, userID uuid.UUID) (*models.User, error) {
	var user models.User
	err := s.db.Pool.QueryRow(ctx,
		`SELECT id, COALESCE(phone,''), COALESCE(email,''), COALESCE(username,''), display_name, COALESCE(avatar_url,''),
		        COALESCE(bio,''), last_seen, online, created_at
		 FROM users WHERE id = $1 AND deleted_at IS NULL`,
		userID,
	).Scan(&user.ID, &user.Phone, &user.Email, &user.Username, &user.DisplayName,
		&user.AvatarURL, &user.Bio, &user.LastSeen, &user.Online, &user.CreatedAt)
	if err != nil {
		return nil, ErrUserNotFound
	}
	return &user, nil
}

func (s *Service) SearchUsers(ctx context.Context, query string, limit int) ([]models.User, error) {
	rows, err := s.db.Pool.Query(ctx,
		`SELECT id, COALESCE(phone,''), COALESCE(email,''), COALESCE(username,''), display_name, COALESCE(avatar_url,''),
		        COALESCE(bio,''), last_seen, online, created_at
		 FROM users
		 WHERE deleted_at IS NULL
		   AND (username ILIKE $1 OR display_name ILIKE $1 OR phone LIKE $1 OR email ILIKE $1)
		 LIMIT $2`,
		"%"+query+"%", limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		var u models.User
		if err := rows.Scan(&u.ID, &u.Phone, &u.Email, &u.Username, &u.DisplayName,
			&u.AvatarURL, &u.Bio, &u.LastSeen, &u.Online, &u.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, nil
}

func (s *Service) Logout(ctx context.Context, token string) error {
	_, err := s.db.Pool.Exec(ctx, `DELETE FROM sessions WHERE token = $1`, token)
	return err
}

func (s *Service) ListSessions(ctx context.Context, userID uuid.UUID) ([]SessionInfo, error) {
	rows, err := s.db.Pool.Query(ctx,
		`SELECT id, COALESCE(device,''), COALESCE(ip,''), created_at, expires_at
		 FROM sessions
		 WHERE user_id = $1 AND expires_at > NOW()
		 ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []SessionInfo
	for rows.Next() {
		var si SessionInfo
		if err := rows.Scan(&si.ID, &si.Device, &si.IP, &si.CreatedAt, &si.ExpiresAt); err != nil {
			return nil, err
		}
		out = append(out, si)
	}
	return out, nil
}

func (s *Service) TerminateAllSessions(ctx context.Context, userID uuid.UUID) error {
	_, err := s.db.Pool.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1`, userID)
	return err
}

func (s *Service) findOrCreateUser(ctx context.Context, emailAddr string) (*models.User, error) {
	if s.db == nil {
		return nil, ErrDBUnavailable
	}
	var user models.User
	err := s.db.Pool.QueryRow(ctx,
		`SELECT id, COALESCE(phone,''), COALESCE(email,''), COALESCE(username,''), display_name, COALESCE(avatar_url,''),
		        COALESCE(bio,''), last_seen, online, created_at
		 FROM users WHERE email = $1 AND deleted_at IS NULL`,
		emailAddr,
	).Scan(&user.ID, &user.Phone, &user.Email, &user.Username, &user.DisplayName,
		&user.AvatarURL, &user.Bio, &user.LastSeen, &user.Online, &user.CreatedAt)

	if err == pgx.ErrNoRows {
		user.ID = uuid.New()
		user.Email = emailAddr
		user.DisplayName = emailAddr
		user.CreatedAt = time.Now()
		user.LastSeen = time.Now()

		_, err = s.db.Pool.Exec(ctx,
			`INSERT INTO users (id, email, display_name, created_at, last_seen)
			 VALUES ($1, $2, $3, $4, $5)`,
			user.ID, user.Email, user.DisplayName, user.CreatedAt, user.LastSeen,
		)
		if err != nil {
			return nil, err
		}
		return &user, nil
	}

	if err != nil {
		return nil, err
	}
	return &user, nil
}

func generateCode(length int) (string, error) {
	code := make([]byte, length)
	for i := range code {
		n, err := rand.Int(rand.Reader, big.NewInt(10))
		if err != nil {
			return "", err
		}
		code[i] = byte('0') + byte(n.Int64())
	}
	return string(code), nil
}
