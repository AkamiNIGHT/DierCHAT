using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace DIERbrowser;

/// <summary>ТЗ §47.6: сохранённые логины; локально защищено DPAPI (Windows), без обязательного сервера DierCHAT.</summary>
internal static class PasswordVault
{
    public class Credential
    {
        public string Host { get; set; } = "";
        public string Username { get; set; } = "";
        public string Password { get; set; } = "";
        public long Updated { get; set; }
    }

    private static string VaultPath =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DIERbrowser", "passwords.vault");

    private static List<Credential> LoadAll()
    {
        try
        {
            if (!File.Exists(VaultPath)) return new List<Credential>();
            var enc = File.ReadAllBytes(VaultPath);
            var dec = ProtectedData.Unprotect(enc, null, DataProtectionScope.CurrentUser);
            var json = Encoding.UTF8.GetString(dec);
            return JsonSerializer.Deserialize<List<Credential>>(json) ?? new List<Credential>();
        }
        catch
        {
            return new List<Credential>();
        }
    }

    private static void SaveAll(List<Credential> list)
    {
        BrowserDataStore.EnsureDir();
        var json = JsonSerializer.Serialize(list);
        var plain = Encoding.UTF8.GetBytes(json);
        var enc = ProtectedData.Protect(plain, null, DataProtectionScope.CurrentUser);
        File.WriteAllBytes(VaultPath, enc);
    }

    public static Credential? FindByHost(string host)
    {
        host = host.Trim().ToLowerInvariant();
        if (host.Length == 0) return null;
        return LoadAll().FirstOrDefault(c => string.Equals(c.Host, host, StringComparison.OrdinalIgnoreCase));
    }

    public static List<Credential> ListAll() => LoadAll().OrderByDescending(c => c.Updated).ToList();

    public static void Save(string origin, string username, string password)
    {
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var u)) return;
        var host = u.Host.ToLowerInvariant();
        if (host.Length == 0) return;
        var list = LoadAll();
        list.RemoveAll(c => string.Equals(c.Host, host, StringComparison.OrdinalIgnoreCase));
        list.Add(new Credential
        {
            Host = host,
            Username = username,
            Password = password,
            Updated = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
        });
        SaveAll(list);
    }

    public static void RemoveHost(string host)
    {
        var list = LoadAll();
        list.RemoveAll(c => string.Equals(c.Host, host, StringComparison.OrdinalIgnoreCase));
        SaveAll(list);
    }
}
