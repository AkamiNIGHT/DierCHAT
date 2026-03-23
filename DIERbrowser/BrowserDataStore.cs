using System.Text.Json;
using System.Text.Json.Serialization;

namespace DIERbrowser;

/// <summary>Закладки и история в %LocalAppData%\DIERbrowser\</summary>
internal static class BrowserDataStore
{
    private static string AppDir =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DIERbrowser");

    private static string BookmarksPath => Path.Combine(AppDir, "bookmarks.json");
    private static string HistoryPath => Path.Combine(AppDir, "history.json");

    private static readonly JsonSerializerOptions JsonOpt = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static void EnsureDir()
    {
        Directory.CreateDirectory(AppDir);
    }

    public static string UserDataFolder => Path.Combine(AppDir, "WebView2");

    // —— Закладки ——

    public class BookmarkEntry
    {
        public string Title { get; set; } = "";
        public string Url { get; set; } = "";
        public long Added { get; set; }
    }

    public static List<BookmarkEntry> LoadBookmarks()
    {
        try
        {
            if (!File.Exists(BookmarksPath)) return new List<BookmarkEntry>();
            var json = File.ReadAllText(BookmarksPath);
            var list = JsonSerializer.Deserialize<List<BookmarkEntry>>(json, JsonOpt);
            return list ?? new List<BookmarkEntry>();
        }
        catch
        {
            return new List<BookmarkEntry>();
        }
    }

    public static void SaveBookmarks(List<BookmarkEntry> list)
    {
        EnsureDir();
        File.WriteAllText(BookmarksPath, JsonSerializer.Serialize(list, JsonOpt));
    }

    public static void AddBookmark(string title, string url)
    {
        var list = LoadBookmarks();
        url = url.Trim();
        if (url.Length == 0) return;
        if (list.Any(b => string.Equals(b.Url, url, StringComparison.OrdinalIgnoreCase))) return;
        list.Insert(0, new BookmarkEntry { Title = title.Trim().Length > 0 ? title.Trim() : url, Url = url, Added = DateTimeOffset.UtcNow.ToUnixTimeSeconds() });
        SaveBookmarks(list);
    }

    public static void RemoveBookmark(string url)
    {
        var list = LoadBookmarks();
        list.RemoveAll(b => string.Equals(b.Url, url, StringComparison.OrdinalIgnoreCase));
        SaveBookmarks(list);
    }

    public static bool IsBookmarked(string url) =>
        LoadBookmarks().Any(b => string.Equals(b.Url, url, StringComparison.OrdinalIgnoreCase));

    // —— История ——

    public class HistoryEntry
    {
        public string Url { get; set; } = "";
        public string Title { get; set; } = "";
        public long At { get; set; }
    }

    private const int MaxHistory = 800;

    public static void AppendHistory(string url, string title)
    {
        url = url.Trim();
        if (url.Length == 0 || !url.StartsWith("http", StringComparison.OrdinalIgnoreCase)) return;
        EnsureDir();
        List<HistoryEntry> list;
        try
        {
            if (File.Exists(HistoryPath))
                list = JsonSerializer.Deserialize<List<HistoryEntry>>(File.ReadAllText(HistoryPath), JsonOpt) ?? new();
            else
                list = new List<HistoryEntry>();
        }
        catch
        {
            list = new List<HistoryEntry>();
        }

        if (list.Count > 0 && string.Equals(list[0].Url, url, StringComparison.OrdinalIgnoreCase))
        {
            list[0] = new HistoryEntry { Url = url, Title = title, At = DateTimeOffset.UtcNow.ToUnixTimeSeconds() };
        }
        else
        {
            list.Insert(0, new HistoryEntry { Url = url, Title = title, At = DateTimeOffset.UtcNow.ToUnixTimeSeconds() });
        }

        if (list.Count > MaxHistory)
            list = list.Take(MaxHistory).ToList();
        File.WriteAllText(HistoryPath, JsonSerializer.Serialize(list, JsonOpt));
    }

    public static List<HistoryEntry> LoadHistory()
    {
        try
        {
            if (!File.Exists(HistoryPath)) return new List<HistoryEntry>();
            return JsonSerializer.Deserialize<List<HistoryEntry>>(File.ReadAllText(HistoryPath), JsonOpt) ?? new();
        }
        catch
        {
            return new List<HistoryEntry>();
        }
    }

    public static void ClearHistoryFile()
    {
        try
        {
            if (File.Exists(HistoryPath))
                File.Delete(HistoryPath);
        }
        catch
        {
            /* ignore */
        }
    }
}
