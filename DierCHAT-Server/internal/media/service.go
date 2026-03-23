package media

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/dierchat/server/internal/storage"
	"github.com/dierchat/server/pkg/config"
)

type Service struct {
	db          *storage.PostgresStore
	storagePath string
	cdnBaseURL  string
	maxFileSize int64
}

func NewService(db *storage.PostgresStore, cfg config.MediaConfig) *Service {
	os.MkdirAll(cfg.StoragePath, 0755)
	return &Service{
		db:          db,
		storagePath: cfg.StoragePath,
		cdnBaseURL:  cfg.CDNBaseURL,
		maxFileSize: cfg.MaxFileSize,
	}
}

type UploadResult struct {
	ID        uuid.UUID `json:"id"`
	URL       string    `json:"url"`
	FileName  string    `json:"file_name"`
	FileSize  int64     `json:"file_size"`
	MimeType  string    `json:"mime_type"`
	Thumbnail string    `json:"thumbnail,omitempty"`
}

func (s *Service) Upload(ctx context.Context, userID uuid.UUID, fileName, mimeType string, reader io.Reader) (*UploadResult, error) {
	fileID := uuid.New()
	ext := filepath.Ext(fileName)
	if ext == "" {
		ext = mimeTypeToExt(mimeType)
	}

	dateDir := time.Now().Format("2006/01/02")
	dir := filepath.Join(s.storagePath, dateDir)
	os.MkdirAll(dir, 0755)

	storedName := fileID.String() + ext
	fullPath := filepath.Join(dir, storedName)

	file, err := os.Create(fullPath)
	if err != nil {
		return nil, fmt.Errorf("create file: %w", err)
	}
	defer file.Close()

	size, err := io.Copy(file, io.LimitReader(reader, s.maxFileSize))
	if err != nil {
		os.Remove(fullPath)
		return nil, fmt.Errorf("write file: %w", err)
	}

	url := fmt.Sprintf("%s/%s/%s", s.cdnBaseURL, dateDir, storedName)

	return &UploadResult{
		ID:       fileID,
		URL:      url,
		FileName: fileName,
		FileSize: size,
		MimeType: mimeType,
	}, nil
}

func (s *Service) GetFilePath(url string) string {
	relative := strings.TrimPrefix(url, s.cdnBaseURL+"/")
	return filepath.Join(s.storagePath, filepath.FromSlash(relative))
}

func (s *Service) Delete(ctx context.Context, url string) error {
	path := s.GetFilePath(url)
	return os.Remove(path)
}

func (s *Service) SaveAttachment(ctx context.Context, messageID uuid.UUID, result *UploadResult, mediaType string, width, height int, duration float64) error {
	_, err := s.db.Pool.Exec(ctx,
		`INSERT INTO attachments (id, message_id, type, url, file_name, file_size, mime_type, width, height, duration)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		result.ID, messageID, mediaType, result.URL, result.FileName, result.FileSize, result.MimeType, width, height, duration,
	)
	return err
}

func (s *Service) GetAttachments(ctx context.Context, messageID uuid.UUID) ([]map[string]interface{}, error) {
	rows, err := s.db.Pool.Query(ctx,
		`SELECT id, type, url, file_name, file_size, mime_type, width, height, duration, thumbnail
		 FROM attachments WHERE message_id = $1`,
		messageID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var attachments []map[string]interface{}
	for rows.Next() {
		var (
			id, aType, url, fileName, mimeType, thumbnail string
			fileSize                                       int64
			width, height                                  int
			duration                                       float64
		)
		if err := rows.Scan(&id, &aType, &url, &fileName, &fileSize, &mimeType, &width, &height, &duration, &thumbnail); err != nil {
			return nil, err
		}
		attachments = append(attachments, map[string]interface{}{
			"id": id, "type": aType, "url": url, "file_name": fileName,
			"file_size": fileSize, "mime_type": mimeType, "width": width,
			"height": height, "duration": duration, "thumbnail": thumbnail,
		})
	}
	return attachments, nil
}

func mimeTypeToExt(mime string) string {
	switch mime {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "video/mp4":
		return ".mp4"
	case "video/webm":
		return ".webm"
	case "audio/ogg":
		return ".ogg"
	case "audio/mpeg":
		return ".mp3"
	case "application/pdf":
		return ".pdf"
	default:
		return ".bin"
	}
}
