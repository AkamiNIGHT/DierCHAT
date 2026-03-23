namespace DIERbrowser;

internal static class UrlNormalizer
{
    public const string DefaultHome = "https://www.google.com/";

    public static string ToNavigate(string raw)
    {
        raw = raw.Trim();
        if (raw.Length == 0) return DefaultHome;
        if (raw.StartsWith("about:", StringComparison.OrdinalIgnoreCase)) return raw;
        if (raw.StartsWith("dierbrowser:", StringComparison.OrdinalIgnoreCase)) return raw;
        if (!raw.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
            !raw.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            return "https://" + raw;
        return raw;
    }

    /// <summary>Строка адресной строки: URL или запрос в поисковую систему (ТЗ §47.7).</summary>
    public static string ResolveAddressBarInput(string raw, BrowserAppSettings settings)
    {
        raw = raw.Trim();
        if (raw.Length == 0) return settings.StartupNavigateUrl();
        if (raw.StartsWith("dierbrowser:", StringComparison.OrdinalIgnoreCase))
            return raw;
        if (raw.StartsWith("chrome:", StringComparison.OrdinalIgnoreCase))
            return MapChromeSettingsUri(raw);
        if (raw.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
            raw.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            return raw;
        if (raw.StartsWith("about:", StringComparison.OrdinalIgnoreCase))
            return raw;

        // похоже на домен: одна «точка», без пробелов
        if (!raw.Contains(' ', StringComparison.Ordinal) && raw.Contains('.', StringComparison.Ordinal) &&
            !raw.StartsWith('.') && raw.Length > 1)
            return ToNavigate(raw);

        var template = BrowserAppSettings.SearchQueryUrl(settings.DefaultSearchEngine);
        return string.Format(template, Uri.EscapeDataString(raw));
    }

    /// <summary>chrome://settings → dierbrowser://settings</summary>
    private static string MapChromeSettingsUri(string raw)
    {
        if (!Uri.TryCreate(raw, UriKind.Absolute, out var u)) return raw;
        if (!u.Scheme.Equals("chrome", StringComparison.OrdinalIgnoreCase)) return raw;
        if (u.Host.Equals("settings", StringComparison.OrdinalIgnoreCase)) return "dierbrowser://settings";
        if (u.Host.Equals("downloads", StringComparison.OrdinalIgnoreCase)) return "dierbrowser://downloads";
        return raw;
    }
}
