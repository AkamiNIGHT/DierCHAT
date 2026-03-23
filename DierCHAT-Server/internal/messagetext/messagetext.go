// Package messagetext — ТЗ §46: не трогаем пробелы/переносы; только «мусорные» невидимые символы (как на клиенте).
package messagetext

import "regexp"

// Соответствует клиенту src/lib/messageText.ts (ZWSP, BOM, word joiner, soft hyphen).
// В Go regexp (RE2) нет \uXXXX — только \x{HEX}.
var invisibleGarbage = regexp.MustCompile(`[\x{FEFF}\x{200B}-\x{200D}\x{2060}\x{AD}]`)

// StripInvisibleGarbage удаляет только перечисленные символы; \n \t обычные пробелы сохраняются.
func StripInvisibleGarbage(s string) string {
	return invisibleGarbage.ReplaceAllString(s, "")
}
