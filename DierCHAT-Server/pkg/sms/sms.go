package sms

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"

	"github.com/dierchat/server/pkg/config"
)

// normalizePhone приводит номер к формату 79XXXXXXXXX для России.
func normalizePhone(phone string) string {
	phone = strings.TrimSpace(phone)
	phone = strings.TrimPrefix(phone, "+")
	phone = strings.ReplaceAll(phone, " ", "")
	phone = strings.ReplaceAll(phone, "-", "")
	phone = strings.ReplaceAll(phone, "(", "")
	phone = strings.ReplaceAll(phone, ")", "")
	// 89XXXXXXXXX -> 79XXXXXXXXX
	if strings.HasPrefix(phone, "8") && len(phone) == 11 {
		phone = "7" + phone[1:]
	}
	// +7 уже убран, 7XXXXXXXXXX — ок
	return phone
}

// Send sends SMS via SMSC.ru. If config is empty, logs only.
func Send(ctx context.Context, cfg config.SMSConfig, phone string, text string) error {
	phone = normalizePhone(phone)
	if phone == "" {
		return fmt.Errorf("empty phone")
	}
	if cfg.Login == "" || cfg.APIKey == "" {
		log.Printf("[SMS] (dev) would send to %s: %s", phone, text[:min(50, len(text))])
		return nil
	}
	params := url.Values{
		"login":   {cfg.Login},
		"psw":     {cfg.APIKey},
		"phones":  {phone},
		"mes":     {text},
		"charset": {"utf-8"},
		"fmt":     {"3"},
		"translit": {"1"}, // транслит кириллицы — лучше доставка
	}
	// sender только если указан и зарегистрирован в SMSC (Настройки → Имена отправителей)
	if cfg.Sender != "" {
		params.Set("sender", cfg.Sender)
	}
	u := "https://smsc.ru/sys/send.php?" + params.Encode()
	req, err := http.NewRequestWithContext(ctx, "GET", u, nil)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("[SMS] send error: %v", err)
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	bodyStr := strings.TrimSpace(string(body))
	if resp.StatusCode != http.StatusOK {
		log.Printf("[SMS] SMSC HTTP %d: %s", resp.StatusCode, bodyStr)
		return fmt.Errorf("smsc returned %d: %s", resp.StatusCode, bodyStr)
	}
	// SMSC возвращает 200 даже при ошибках — ошибка в теле (ERROR = ...)
	if strings.HasPrefix(bodyStr, "ERROR") {
		log.Printf("[SMS] SMSC error to %s: %s (sender=%q, check: balance, sender registration)", phone, bodyStr, cfg.Sender)
		return fmt.Errorf("smsc: %s", bodyStr)
	}
	log.Printf("[SMS] sent to %s ok (id=%s)", phone, bodyStr)
	return nil
}
