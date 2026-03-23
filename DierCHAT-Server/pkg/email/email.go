package email

import (
	"crypto/tls"
	"fmt"
	"log"
	"net/smtp"
	"strings"

	"github.com/dierchat/server/pkg/config"
)

// Send sends an email via SMTP with TLS (STARTTLS on port 587).
// Uses smtp.gmail.com:587 by default for Gmail.
// Gmail requires an "application password" (app-specific password), not the regular account password.
func Send(cfg config.SMTPConfig, to, subject, body string) error {
	if cfg.Host == "" || cfg.Port == 0 {
		log.Printf("[Email] (dev) would send to %s subject=%q: %s", to, subject, body[:min(80, len(body))])
		return nil
	}
	if cfg.Login == "" || cfg.Password == "" {
		return fmt.Errorf("email: login and password required")
	}

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	client, err := smtp.Dial(addr)
	if err != nil {
		return fmt.Errorf("email dial: %w", err)
	}
	defer client.Close()

	tlsConfig := &tls.Config{
		ServerName: cfg.Host,
		MinVersion: tls.VersionTLS12,
	}
	if err := client.StartTLS(tlsConfig); err != nil {
		return fmt.Errorf("email starttls: %w", err)
	}

	auth := smtp.PlainAuth("", cfg.Login, cfg.Password, cfg.Host)
	if err := client.Auth(auth); err != nil {
		return fmt.Errorf("email auth: %w", err)
	}

	if err := client.Mail(cfg.From); err != nil {
		return fmt.Errorf("email mail: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("email rcpt: %w", err)
	}

	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("email data: %w", err)
	}

	msg := buildMessage(cfg.From, to, subject, body)
	if _, err := w.Write([]byte(msg)); err != nil {
		return fmt.Errorf("email write: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("email close: %w", err)
	}

	if err := client.Quit(); err != nil {
		return fmt.Errorf("email quit: %w", err)
	}

	log.Printf("[Email] sent to %s subject=%q ok", to, subject)
	return nil
}

func buildMessage(from, to, subject, body string) string {
	headers := []string{
		"From: " + from,
		"To: " + to,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		body,
	}
	return strings.Join(headers, "\r\n")
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
