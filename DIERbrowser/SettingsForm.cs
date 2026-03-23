using System.Diagnostics;

namespace DIERbrowser;

/// <summary>ТЗ §47.1 — страница настроек (аналог chrome://settings).</summary>
internal sealed class SettingsForm : Form
{
    private readonly BrowserAppSettings _s;
    private readonly Action _onSaved;

    private readonly ComboBox _lang = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 200 };
    private readonly ComboBox _search = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 200 };
    private readonly TextBox _downloadDir = new() { Width = 360 };
    private readonly NumericUpDown _maxDl = new() { Minimum = 50, Maximum = 2000, Value = 500 };
    private readonly CheckBox _dlCleanup90 = new() { Text = "Автоочистка записей старше 90 дней", AutoSize = true };
    private readonly CheckBox _hwAccel = new() { Text = "Аппаратное ускорение", AutoSize = true };
    private readonly TextBox _proxy = new() { Width = 360 };
    private readonly CheckBox _clearExit = new() { Text = "Очищать локальную историю и журнал загрузок при выходе", AutoSize = true };

    private readonly ComboBox _theme = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 200 };
    private readonly NumericUpDown _zoom = new() { Minimum = 50, Maximum = 200, Value = 100, Increment = 5 };
    private readonly ComboBox _tabPos = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 200 };
    private readonly CheckBox _showNav = new() { Text = "Кнопки «Назад» / «Вперёд» и обновление", AutoSize = true };
    private readonly CheckBox _showHome = new() { Text = "Кнопка «Домой»", AutoSize = true };
    private readonly ComboBox _startup = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 280 };

    private readonly CheckBox _autoPw = new() { Text = "Предлагать сохранение паролей (с подтверждением)", AutoSize = true };
    private readonly CheckBox _autoAddr = new() { Text = "Автозаполнение адресов (настройка; полная поддержка — в следующих версиях)", AutoSize = true };
    private readonly ListBox _pwList = new() { Height = 180, Width = 520 };

    public SettingsForm(BrowserAppSettings settings, Action onSaved)
    {
        _s = settings;
        _onSaved = onSaved;
        Text = "Настройки — DIERbrowser";
        Width = 640;
        Height = 560;
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;

        var tabs = new TabControl { Dock = DockStyle.Fill };

        tabs.TabPages.Add(BuildGeneral());
        tabs.TabPages.Add(BuildPrivacy());
        tabs.TabPages.Add(BuildAppearance());
        tabs.TabPages.Add(BuildDownloads());
        tabs.TabPages.Add(BuildExtensions());
        tabs.TabPages.Add(BuildAutofill());
        tabs.TabPages.Add(BuildSystem());

        var bottom = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            Height = 48,
            FlowDirection = FlowDirection.RightToLeft,
            Padding = new Padding(8),
        };
        var cancel = new Button { Text = "Закрыть", DialogResult = DialogResult.Cancel };
        var save = new Button { Text = "Сохранить" };
        save.Click += (_, _) => SaveAndClose();
        bottom.Controls.Add(cancel);
        bottom.Controls.Add(save);

        Controls.Add(tabs);
        Controls.Add(bottom);

        LoadFields();
    }

    private TabPage BuildGeneral()
    {
        var p = new TabPage("Основные");
        var t = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, Padding = new Padding(12), AutoSize = true };
        t.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 35));
        t.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 65));

        t.Controls.Add(new Label { Text = "Стартовая страница", AutoSize = true, Anchor = AnchorStyles.Left }, 0, 0);
        _startup.Items.AddRange(new object[] { "Google", "Пустая", "Последняя сессия (вкладки)" });
        t.Controls.Add(_startup, 1, 0);

        t.Controls.Add(new Label { Text = "Поиск по умолчанию", AutoSize = true }, 0, 1);
        _search.Items.AddRange(new object[] { "Google", "Yandex", "DuckDuckGo" });
        t.Controls.Add(_search, 1, 1);

        p.Controls.Add(t);
        return p;
    }

    private TabPage BuildPrivacy()
    {
        var p = new TabPage("Конфиденциальность");
        var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, Padding = new Padding(16), AutoScroll = true };
        flow.Controls.Add(_clearExit);
        flow.Controls.Add(new Label
        {
            AutoSize = true,
            MaximumSize = new Size(520, 0),
            Text = "Режим инкогнито: отдельное окно без записи истории и паролей (Ctrl+Shift+N в главном окне).",
        });
        p.Controls.Add(flow);
        return p;
    }

    private TabPage BuildAppearance()
    {
        var p = new TabPage("Внешний вид");
        var t = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, Padding = new Padding(12) };
        t.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 40));
        t.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 60));

        t.Controls.Add(new Label { Text = "Тема", AutoSize = true }, 0, 0);
        _theme.Items.AddRange(new object[] { "Системная", "Светлая", "Тёмная", "Liquid Glass (тёмная оболочка)" });
        t.Controls.Add(_theme, 1, 0);

        t.Controls.Add(new Label { Text = "Масштаб страницы, %", AutoSize = true }, 0, 1);
        t.Controls.Add(_zoom, 1, 1);

        t.Controls.Add(new Label { Text = "Панель вкладок", AutoSize = true }, 0, 2);
        _tabPos.Items.AddRange(new object[] { "Сверху", "Снизу" });
        t.Controls.Add(_tabPos, 1, 2);

        t.Controls.Add(_showNav, 1, 3);
        t.Controls.Add(_showHome, 1, 4);
        p.Controls.Add(t);
        return p;
    }

    private TabPage BuildDownloads()
    {
        var p = new TabPage("Загрузки");
        var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, Padding = new Padding(12), AutoScroll = true };
        flow.Controls.Add(new Label { Text = "Папка по умолчанию (пусто = «Загрузки» пользователя)", AutoSize = true });
        var row = new FlowLayoutPanel { FlowDirection = FlowDirection.LeftToRight, AutoSize = true, WrapContents = false };
        row.Controls.Add(_downloadDir);
        var browse = new Button { Text = "Обзор…" };
        browse.Click += (_, _) =>
        {
            using var d = new FolderBrowserDialog();
            if (d.ShowDialog() == DialogResult.OK)
                _downloadDir.Text = d.SelectedPath;
        };
        row.Controls.Add(browse);
        flow.Controls.Add(row);
        flow.Controls.Add(new Label { Text = "Макс. записей в журнале", AutoSize = true });
        flow.Controls.Add(_maxDl);
        flow.Controls.Add(_dlCleanup90);
        p.Controls.Add(flow);
        return p;
    }

    private TabPage BuildExtensions()
    {
        var p = new TabPage("Расширения");
        var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, Padding = new Padding(16), AutoScroll = true };
        flow.Controls.Add(new Label
        {
            AutoSize = true,
            MaximumSize = new Size(540, 0),
            Text = "WebView2 не встраивает полный Chrome Extension API и магазин .crx как в Google Chrome. " +
                   "Расширения из Chrome Web Store работают в браузере Chrome/Edge.\r\n\r\n" +
                   "Откройте магазин в системном браузере для установки расширений там. " +
                   "Полная поддержка MV3 в отдельной оболочке — возможна через CEF/кастомный Chromium (см. docs/DIERbrowser_ENGINES.md).",
        });
        var b = new Button { Text = "Открыть Chrome Web Store", AutoSize = true };
        b.Click += (_, _) =>
        {
            try
            {
                Process.Start(new ProcessStartInfo("https://chromewebstore.google.com/") { UseShellExecute = true });
            }
            catch { /* ignore */ }
        };
        flow.Controls.Add(b);
        p.Controls.Add(flow);
        return p;
    }

    private TabPage BuildAutofill()
    {
        var p = new TabPage("Автозаполнение");
        var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, Padding = new Padding(12), AutoScroll = true };
        flow.Controls.Add(_autoPw);
        flow.Controls.Add(_autoAddr);
        flow.Controls.Add(new Label { Text = "Сохранённые пароли (хост):", AutoSize = true, Margin = new Padding(0, 12, 0, 4) });
        flow.Controls.Add(_pwList);
        var del = new Button { Text = "Удалить выбранный" };
        del.Click += (_, _) =>
        {
            if (_pwList.SelectedItem is not string sel) return;
            var host = sel.Split('—')[0].Trim();
            PasswordVault.RemoveHost(host);
            RefreshPwList();
        };
        flow.Controls.Add(del);
        p.Controls.Add(flow);
        return p;
    }

    private TabPage BuildSystem()
    {
        var p = new TabPage("Система");
        var t = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, Padding = new Padding(12) };
        t.Controls.Add(new Label { Text = "Язык интерфейса", AutoSize = true }, 0, 0);
        _lang.Items.AddRange(new object[] { "Авто (система)", "Русский", "English" });
        t.Controls.Add(_lang, 1, 0);

        t.Controls.Add(_hwAccel, 1, 1);

        t.Controls.Add(new Label { Text = "Прокси (--proxy-server)", AutoSize = true }, 0, 2);
        t.Controls.Add(_proxy, 1, 2);

        t.Controls.Add(new Label
        {
            Text = "Синхронизация с аккаунтом DierCHAT в облаке — по желанию, отдельная задача (ТЗ §47.1.2).",
            AutoSize = true,
            MaximumSize = new Size(400, 0),
        }, 1, 3);

        p.Controls.Add(t);
        return p;
    }

    private void LoadFields()
    {
        _search.SelectedIndex = _s.DefaultSearchEngine.ToLowerInvariant() switch
        {
            "yandex" => 1,
            "duckduckgo" => 2,
            _ => 0,
        };

        _downloadDir.Text = _s.DownloadFolder;
        _maxDl.Value = Math.Clamp(_s.DownloadsMaxEntries, 50, 2000);
        _dlCleanup90.Checked = _s.DownloadsAutoCleanup90Days;
        _hwAccel.Checked = _s.HardwareAcceleration;
        _proxy.Text = _s.ProxyServer;
        _clearExit.Checked = _s.ClearBrowsingDataOnExit;

        _theme.SelectedIndex = _s.AppearanceTheme.ToLowerInvariant() switch
        {
            "light" => 1,
            "dark" => 2,
            "glass" => 3,
            _ => 0,
        };

        _zoom.Value = Math.Clamp(_s.PageZoomPercent, 50, 200);
        _tabPos.SelectedIndex = _s.TabBarPosition.ToLowerInvariant() == "bottom" ? 1 : 0;
        _showNav.Checked = _s.ShowNavButtons;
        _showHome.Checked = _s.ShowHomeButton;

        _startup.SelectedIndex = _s.StartupPage.ToLowerInvariant() switch
        {
            "blank" => 1,
            "continue" => 2,
            _ => 0,
        };

        _autoPw.Checked = _s.AutofillPasswordsEnabled;
        _autoAddr.Checked = _s.AutofillAddressesEnabled;

        _lang.SelectedIndex = _s.UiLanguage.ToLowerInvariant() switch
        {
            "ru" => 1,
            "en" => 2,
            _ => 0,
        };

        RefreshPwList();
    }

    private void RefreshPwList()
    {
        _pwList.Items.Clear();
        foreach (var c in PasswordVault.ListAll())
            _pwList.Items.Add($"{c.Host} — {c.Username}");
    }

    private void SaveAndClose()
    {
        _s.DefaultSearchEngine = _search.SelectedIndex switch
        {
            1 => "yandex",
            2 => "duckduckgo",
            _ => "google",
        };

        _s.DownloadFolder = _downloadDir.Text.Trim();
        _s.DownloadsMaxEntries = (int)_maxDl.Value;
        _s.DownloadsAutoCleanup90Days = _dlCleanup90.Checked;
        _s.HardwareAcceleration = _hwAccel.Checked;
        _s.ProxyServer = _proxy.Text.Trim();
        _s.ClearBrowsingDataOnExit = _clearExit.Checked;

        _s.AppearanceTheme = _theme.SelectedIndex switch
        {
            1 => "light",
            2 => "dark",
            3 => "glass",
            _ => "system",
        };

        _s.PageZoomPercent = (int)_zoom.Value;
        _s.TabBarPosition = _tabPos.SelectedIndex == 1 ? "bottom" : "top";
        _s.ShowNavButtons = _showNav.Checked;
        _s.ShowHomeButton = _showHome.Checked;

        _s.StartupPage = _startup.SelectedIndex switch
        {
            1 => "blank",
            2 => "continue",
            _ => "google",
        };

        _s.AutofillPasswordsEnabled = _autoPw.Checked;
        _s.AutofillAddressesEnabled = _autoAddr.Checked;

        _s.UiLanguage = _lang.SelectedIndex switch
        {
            1 => "ru",
            2 => "en",
            _ => "auto",
        };

        BrowserSettingsStore.Save(_s);
        _onSaved();
        MessageBox.Show("Настройки сохранены. Часть параметров (ускорение, прокси) вступит в силу после перезапуска браузера.", "DIERbrowser", MessageBoxButtons.OK, MessageBoxIcon.Information);
        Close();
    }
}
