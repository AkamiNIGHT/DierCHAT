using System.Text.Json;
using System.Text.Json.Serialization;

namespace DIERbrowser;

internal static class BrowserSettingsStore
{
    private static string PathFile =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DIERbrowser", "browser_settings.json");

    private static string SessionFile =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DIERbrowser", "last_session_tabs.json");

    private static readonly JsonSerializerOptions JsonOpt = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static BrowserAppSettings Load()
    {
        try
        {
            BrowserDataStore.EnsureDir();
            if (!File.Exists(PathFile)) return new BrowserAppSettings();
            var json = File.ReadAllText(PathFile);
            var s = JsonSerializer.Deserialize<BrowserAppSettings>(json, JsonOpt);
            return s ?? new BrowserAppSettings();
        }
        catch
        {
            return new BrowserAppSettings();
        }
    }

    public static void Save(BrowserAppSettings s)
    {
        BrowserDataStore.EnsureDir();
        File.WriteAllText(PathFile, JsonSerializer.Serialize(s, JsonOpt));
    }

    public static List<string> LoadLastSessionTabs()
    {
        try
        {
            if (!File.Exists(SessionFile)) return new List<string>();
            var list = JsonSerializer.Deserialize<List<string>>(File.ReadAllText(SessionFile), JsonOpt);
            return list?.Where(u => !string.IsNullOrWhiteSpace(u)).ToList() ?? new List<string>();
        }
        catch
        {
            return new List<string>();
        }
    }

    public static void SaveLastSessionTabs(IEnumerable<string> urls)
    {
        BrowserDataStore.EnsureDir();
        var arr = urls.Where(u => !string.IsNullOrWhiteSpace(u)).Take(32).ToList();
        File.WriteAllText(SessionFile, JsonSerializer.Serialize(arr, JsonOpt));
    }
}
