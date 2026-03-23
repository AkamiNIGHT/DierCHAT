namespace DIERbrowser;

/// <summary>ТЗ §47 — настройки браузера (локальный JSON; облако — опционально позже).</summary>
public class BrowserAppSettings
{
    public string UiLanguage { get; set; } = "auto"; // auto / ru / en

    /// <summary>google | yandex | duckduckgo</summary>
    public string DefaultSearchEngine { get; set; } = "google";

    /// <summary>Пусто = папка «Загрузки» пользователя.</summary>
    public string DownloadFolder { get; set; } = "";

    public int DownloadsMaxEntries { get; set; } = 500;

    public bool DownloadsAutoCleanup90Days { get; set; }

    public bool HardwareAcceleration { get; set; } = true;

    /// <summary>Передаётся в Chromium как --proxy-server=… (если задано).</summary>
    public string ProxyServer { get; set; } = "";

    public bool ClearBrowsingDataOnExit { get; set; }

    /// <summary>light | dark | system | glass (glass ≈ тёмная оболочка, ТЗ §47.8)</summary>
    public string AppearanceTheme { get; set; } = "system";

    /// <summary>Масштаб страницы по умолчанию, 50–200.</summary>
    public int PageZoomPercent { get; set; } = 100;

    public string TabBarPosition { get; set; } = "top"; // top | bottom

    public bool ShowNavButtons { get; set; } = true;

    public bool ShowHomeButton { get; set; } = true;

    /// <summary>google | blank | continue</summary>
    public string StartupPage { get; set; } = "google";

    public bool AutofillPasswordsEnabled { get; set; } = true;

    public bool AutofillAddressesEnabled { get; set; } = true;

    public List<string> PasswordNeverSaveHosts { get; set; } = new();

    public static string SearchQueryUrl(string engine) =>
        engine.ToLowerInvariant() switch
        {
            "yandex" => "https://yandex.ru/search/?text={0}",
            "duckduckgo" => "https://duckduckgo.com/?q={0}",
            _ => "https://www.google.com/search?q={0}",
        };

    public string StartupNavigateUrl() =>
        StartupPage.ToLowerInvariant() switch
        {
            "blank" => "about:blank",
            "continue" => UrlNormalizer.DefaultHome,
            _ => UrlNormalizer.DefaultHome,
        };
}
