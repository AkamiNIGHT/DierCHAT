using System.Diagnostics;

namespace DIERbrowser;

/// <summary>ТЗ §47.2 — история загрузок.</summary>
internal sealed class DownloadsForm : Form
{
    private readonly ListView _list = new()
    {
        Dock = DockStyle.Fill,
        View = View.Details,
        FullRowSelect = true,
        GridLines = true,
    };

    private readonly BrowserAppSettings _settings;

    public DownloadsForm(BrowserAppSettings settings)
    {
        _settings = settings;
        Text = "Загрузки — DIERbrowser";
        Width = 900;
        Height = 520;
        StartPosition = FormStartPosition.CenterScreen;

        _list.Columns.Add("Файл", 220);
        _list.Columns.Add("Размер", 90);
        _list.Columns.Add("Статус", 100);
        _list.Columns.Add("Источник", 380);
        _list.Columns.Add("Дата", 140);

        var bar = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            Height = 44,
            Padding = new Padding(8),
            FlowDirection = FlowDirection.LeftToRight,
        };
        var btnOpen = new Button { Text = "Открыть файл", AutoSize = true };
        var btnFolder = new Button { Text = "Папка загрузок", AutoSize = true };
        var btnRemove = new Button { Text = "Удалить запись", AutoSize = true };
        var btnClear = new Button { Text = "Очистить историю", AutoSize = true };
        btnOpen.Click += (_, _) => OpenSelectedFile();
        btnFolder.Click += (_, _) => OpenDownloadsFolder();
        btnRemove.Click += (_, _) => RemoveSelected();
        btnClear.Click += (_, _) =>
        {
            if (MessageBox.Show("Удалить все записи из списка загрузок?", "DIERbrowser", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            DownloadHistoryStore.Clear(_settings.DownloadsMaxEntries);
            Reload();
        };
        bar.Controls.AddRange(new Control[] { btnOpen, btnFolder, btnRemove, btnClear });

        Controls.Add(_list);
        Controls.Add(bar);
        Reload();
    }

    public void Reload()
    {
        _list.Items.Clear();
        foreach (var e in DownloadHistoryStore.Load().OrderByDescending(x => x.StartedAt))
        {
            var size = e.TotalBytes > 0 ? FormatSize(e.TotalBytes) : (e.ReceivedBytes > 0 ? FormatSize(e.ReceivedBytes) : "—");
            var date = DateTimeOffset.FromUnixTimeSeconds(e.StartedAt).ToLocalTime().ToString("g");
            var item = new ListViewItem(e.FileName) { Tag = e.Id };
            item.SubItems.Add(size);
            item.SubItems.Add(StateRu(e.State));
            item.SubItems.Add(e.SourceUrl.Length > 80 ? e.SourceUrl[..77] + "…" : e.SourceUrl);
            item.SubItems.Add(date);
            _list.Items.Add(item);
        }
    }

    private static string StateRu(string s) =>
        s switch
        {
            "completed" => "Завершено",
            "in_progress" => "В процессе",
            "failed" => "Ошибка",
            "cancelled" => "Отменено",
            _ => s,
        };

    private static string FormatSize(long b)
    {
        if (b < 1024) return $"{b} B";
        double kb = b / 1024.0;
        if (kb < 1024) return $"{kb:0.#} KB";
        double mb = kb / 1024;
        if (mb < 1024) return $"{mb:0.#} MB";
        return $"{mb / 1024:0.#} GB";
    }

    private void OpenSelectedFile()
    {
        if (_list.SelectedItems.Count == 0) return;
        var id = _list.SelectedItems[0].Tag as string;
        var ent = DownloadHistoryStore.Load().FirstOrDefault(x => x.Id == id);
        if (ent == null || !File.Exists(ent.FullPath))
        {
            MessageBox.Show("Файл не найден на диске.", "DIERbrowser", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        try
        {
            Process.Start(new ProcessStartInfo(ent.FullPath) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "DIERbrowser", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void OpenDownloadsFolder()
    {
        var dir = string.IsNullOrWhiteSpace(_settings.DownloadFolder)
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads")
            : _settings.DownloadFolder;
        try
        {
            Directory.CreateDirectory(dir);
            Process.Start(new ProcessStartInfo { FileName = "explorer.exe", Arguments = dir, UseShellExecute = true });
        }
        catch { /* ignore */ }
    }

    private void RemoveSelected()
    {
        if (_list.SelectedItems.Count == 0) return;
        var id = _list.SelectedItems[0].Tag as string;
        if (id != null)
            DownloadHistoryStore.Remove(id, _settings.DownloadsMaxEntries);
        Reload();
    }
}
