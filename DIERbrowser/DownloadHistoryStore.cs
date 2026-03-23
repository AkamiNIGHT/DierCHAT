using System.Text.Json;
using System.Text.Json.Serialization;

namespace DIERbrowser;

internal static class DownloadHistoryStore
{
    public class Entry
    {
        public string Id { get; set; } = "";
        public string FileName { get; set; } = "";
        public string FullPath { get; set; } = "";
        public string SourceUrl { get; set; } = "";
        public long TotalBytes { get; set; }
        public long ReceivedBytes { get; set; }
        public long StartedAt { get; set; }
        public long CompletedAt { get; set; }
        /// <summary>pending | in_progress | completed | failed | cancelled</summary>
        public string State { get; set; } = "pending";
    }

    private static string PathFile =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DIERbrowser", "downloads.json");

    private static readonly JsonSerializerOptions JsonOpt = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static List<Entry> Load()
    {
        try
        {
            if (!File.Exists(PathFile)) return new List<Entry>();
            return JsonSerializer.Deserialize<List<Entry>>(File.ReadAllText(PathFile), JsonOpt) ?? new List<Entry>();
        }
        catch
        {
            return new List<Entry>();
        }
    }

    public static void Save(List<Entry> list, int maxEntries)
    {
        BrowserDataStore.EnsureDir();
        var cut = list.OrderByDescending(e => e.StartedAt).Take(Math.Max(50, maxEntries)).ToList();
        File.WriteAllText(PathFile, JsonSerializer.Serialize(cut, JsonOpt));
    }

    public static void Upsert(Entry e, int maxEntries)
    {
        var list = Load();
        list.RemoveAll(x => x.Id == e.Id);
        list.Insert(0, e);
        Save(list, maxEntries);
    }

    public static void Remove(string id, int maxEntries)
    {
        var list = Load();
        list.RemoveAll(x => x.Id == id);
        Save(list, maxEntries);
    }

    public static void Clear(int maxEntries) => Save(new List<Entry>(), maxEntries);

    public static void CleanupOlderThan90Days(int maxEntries)
    {
        var cutoff = DateTimeOffset.UtcNow.AddDays(-90).ToUnixTimeSeconds();
        var list = Load().Where(e => e.StartedAt >= cutoff).ToList();
        Save(list, maxEntries);
    }
}
