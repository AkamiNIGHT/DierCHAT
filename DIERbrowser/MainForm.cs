using System.Drawing;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace DIERbrowser;

/// <summary>Оболочка DIERbrowser (ТЗ §47): вкладки, настройки, загрузки, инкогнито, автозаполнение с запросом, DevTools.</summary>
public class MainForm : Form
{
    private static readonly string PasswordCaptureScript =
        "(function(){if(!window.chrome||!window.chrome.webview)return;" +
        "function g(f){var u='',p='',i,q=f.querySelectorAll('input');" +
        "for(i=0;i<q.length;i++){var e=q[i],t=(e.type||'').toLowerCase();" +
        "if(t==='password'&&e.value)p=e.value;" +
        "if((t==='text'||t==='email'||t==='tel'||!t)&&e.value){var n=(e.name+' '+e.id).toLowerCase();" +
        "if(/user|login|email|mail|phone/.test(n))u=e.value;}}return p?{u:u,p:p}:null;}" +
        "document.addEventListener('submit',function(ev){" +
        "var f=ev.target;if(!f||f.tagName!=='FORM')return;var c=g(f);if(!c)return;" +
        "window.chrome.webview.postMessage(JSON.stringify({type:'dier_pw_submit',origin:location.origin,username:c.u||'',password:c.p||'',formAction:f.action||''}));" +
        "},true);})();";

    private CoreWebView2Environment? _env;
    private BrowserAppSettings _settings;
    private readonly bool _incognito;
    private readonly string? _incognitoProfileDir;
    private readonly string _firstUrl;

    /// <summary>Узкое окно или сенсор — «мобильный» режим полосы вкладок и панели.</summary>
    private const int MobileLayoutBreakpoint = 720;

    private readonly Panel _contentHost = new() { Dock = DockStyle.Fill, Padding = Padding.Empty };
    private readonly Panel _tabStripOuter = new() { Dock = DockStyle.Top, Padding = Padding.Empty };
    private readonly FlowLayoutPanel _tabFlow = new()
    {
        AutoSize = true,
        AutoSizeMode = AutoSizeMode.GrowAndShrink,
        WrapContents = false,
        FlowDirection = FlowDirection.LeftToRight,
        Padding = new Padding(4, 2, 4, 2),
        Margin = Padding.Empty,
        BackColor = Color.Transparent,
    };
    private readonly Button _newTabPlus = new()
    {
        Text = "+",
        Width = 38,
        Height = 32,
        FlatStyle = FlatStyle.Flat,
        Font = new Font("Segoe UI", 13f),
        Cursor = Cursors.Hand,
        TabStop = false,
        Margin = new Padding(4, 4, 8, 4),
    };
    private readonly List<BrowserTabSession> _sessions = new();
    private BrowserTabSession? _selectedSession;
    private BrowserTabSession? _draggingSession;
    private Point _dragStartScreen;
    private bool _tabReorderActive;
    private readonly System.Windows.Forms.Timer _longPressTimer;
    private EdgeTabHeader? _longPressHeader;
    private readonly ContextMenuStrip _tabContextMenu = new();
    private BrowserTabSession? _contextSession;

    private readonly ToolStripTextBox _urlBox = new() { AutoSize = false, Width = 420 };
    private readonly ToolStripButton _btnBack = new("←") { ToolTipText = "Назад", Enabled = false };
    private readonly ToolStripButton _btnFwd = new("→") { ToolTipText = "Вперёд", Enabled = false };
    private readonly ToolStripButton _btnRefresh = new("↻") { ToolTipText = "Обновить" };
    private readonly ToolStripButton _btnHome = new("⌂") { ToolTipText = "Домой" };
    private readonly ToolStripButton _btnGo = new("Перейти") { ToolTipText = "Открыть адрес (Enter)" };
    private readonly ToolStripButton _btnNewTab = new("+") { ToolTipText = "Новая вкладка (Ctrl+T)" };
    private readonly ToolStripButton _btnCloseTab = new("×") { ToolTipText = "Закрыть вкладку (Ctrl+W)" };
    private readonly ToolStripButton _btnBookmark = new("☆") { ToolTipText = "В закладки" };
    private readonly ToolStripButton _btnSettings = new("⚙") { ToolTipText = "Настройки (dierbrowser://settings)" };
    private readonly ToolStripDropDownButton _menuMain = new("Меню");
    private readonly ToolStripDropDownButton _menuBookmarks = new("Закладки");
    private readonly ToolStripDropDownButton _menuHistory = new("История");

    private readonly ToolStrip _tool;

    private DownloadsForm? _downloadsForm;

    public MainForm(string firstUrl, bool incognito = false)
    {
        _firstUrl = firstUrl;
        _incognito = incognito;
        _settings = BrowserSettingsStore.Load();
        Text = _incognito ? "DIERbrowser — Инкогнито" : "DIERbrowser";
        Width = 1280;
        Height = 800;
        StartPosition = FormStartPosition.CenterScreen;
        KeyPreview = true;

        if (_incognito)
        {
            _incognitoProfileDir = Path.Combine(Path.GetTempPath(), "DIERbrowser-incognito-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(_incognitoProfileDir);
        }

        _longPressTimer = new System.Windows.Forms.Timer { Interval = 480 };
        _longPressTimer.Tick += LongPressTimer_Tick;

        _newTabPlus.FlatAppearance.BorderSize = 0;
        _newTabPlus.Click += (_, _) => _ = AddNewTabAsync(HomePageUrl());

        var tabScrollInner = new Panel { Dock = DockStyle.Fill, AutoScroll = true, AutoScrollMinSize = new Size(40, 40) };
        _tabFlow.Location = new Point(0, 0);
        tabScrollInner.Controls.Add(_tabFlow);
        _tabStripOuter.Controls.Add(tabScrollInner);
        _tabFlow.Controls.Add(_newTabPlus);
        _tabStripOuter.Height = 48;

        BuildTabContextMenu();

        _tool = new ToolStrip
        {
            Dock = DockStyle.Top,
            GripStyle = ToolStripGripStyle.Hidden,
            Padding = new Padding(6, 4, 6, 4),
        };
        _tool.Items.Add(_btnBack);
        _tool.Items.Add(_btnFwd);
        _tool.Items.Add(_btnRefresh);
        _tool.Items.Add(_btnHome);
        _tool.Items.Add(new ToolStripSeparator());
        _tool.Items.Add(_urlBox);
        _tool.Items.Add(_btnGo);
        _tool.Items.Add(new ToolStripSeparator());
        _tool.Items.Add(_btnNewTab);
        _tool.Items.Add(_btnCloseTab);
        _tool.Items.Add(_btnBookmark);
        _tool.Items.Add(_btnSettings);
        _tool.Items.Add(_menuMain);
        _tool.Items.Add(_menuBookmarks);
        _tool.Items.Add(_menuHistory);

        BuildMainMenu();
        Controls.Add(_contentHost);
        Controls.Add(_tabStripOuter);
        Controls.Add(_tool);

        _btnBack.Click += (_, _) => GetActiveWebView()?.CoreWebView2?.GoBack();
        _btnFwd.Click += (_, _) => GetActiveWebView()?.CoreWebView2?.GoForward();
        _btnRefresh.Click += (_, _) => GetActiveWebView()?.Reload();
        _btnHome.Click += (_, _) => NavigateActive(HomePageUrl());
        _btnGo.Click += (_, _) => NavigateFromAddressBar();
        _btnNewTab.Click += (_, _) => _ = AddNewTabAsync(HomePageUrl());
        _btnCloseTab.Click += (_, _) => CloseCurrentTab();
        _btnBookmark.Click += OnBookmarkClick;
        _btnSettings.Click += (_, _) => ShowSettingsDialog();
        _urlBox.KeyDown += (_, e) =>
        {
            if (e.KeyCode == Keys.Enter)
            {
                e.SuppressKeyPress = true;
                NavigateFromAddressBar();
            }
        };

        _menuBookmarks.DropDownOpening += (_, _) => RebuildBookmarksMenu();
        _menuHistory.DropDownOpening += (_, _) => RebuildHistoryMenu();
        Resize += (_, _) => ApplyResponsiveChrome();
        Load += (_, e) =>
        {
            ApplyResponsiveChrome();
            OnFormLoad(this, e);
        };

        ApplyChromeTheme();
        ApplyToolbarSettings();
        ApplyTabStripDock();
    }

    private void BuildMainMenu()
    {
        _menuMain.DropDownItems.Add("Настройки…", null, (_, _) => ShowSettingsDialog());
        _menuMain.DropDownItems.Add("Загрузки…", null, (_, _) => ShowDownloadsWindow());
        _menuMain.DropDownItems.Add(new ToolStripSeparator());
        _menuMain.DropDownItems.Add("Новое окно инкогнито (Ctrl+Shift+N)", null, (_, _) => OpenIncognitoWindow());
        _menuMain.DropDownItems.Add("Инструменты разработчика (Ctrl+Shift+I)", null, (_, _) => OpenDevTools());
        _menuMain.DropDownItems.Add(new ToolStripSeparator());
        _menuMain.DropDownItems.Add("О DIERbrowser", null, (_, _) =>
            MessageBox.Show(
                "DIERbrowser на WebView2 (Chromium).\r\n" +
                "Вкладки: крестик — закрыть; перетащите вкладку для порядка; ПКМ или долгое нажатие — меню.\r\n" +
                "Узкое окно (< 720 px) — компактный режим.\r\n" +
                "dierbrowser://settings, dierbrowser://downloads (или chrome://…)",
                "DIERbrowser",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information));
    }

    private string HomePageUrl() =>
        _settings.StartupPage.ToLowerInvariant() == "blank" ? "about:blank" : UrlNormalizer.DefaultHome;

    private void ApplyToolbarSettings()
    {
        _btnBack.Visible = _settings.ShowNavButtons;
        _btnFwd.Visible = _settings.ShowNavButtons;
        _btnRefresh.Visible = _settings.ShowNavButtons;
        _btnHome.Visible = _settings.ShowHomeButton;
    }

    private void ApplyTabStripDock()
    {
        var bottom = _settings.TabBarPosition.ToLowerInvariant() == "bottom";
        _tabStripOuter.Dock = bottom ? DockStyle.Bottom : DockStyle.Top;
    }

    private bool IsDarkChrome()
    {
        var dark = _incognito || _settings.AppearanceTheme.ToLowerInvariant() is "dark" or "glass";
        if (_settings.AppearanceTheme.ToLowerInvariant() == "light")
            dark = false;
        if (_settings.AppearanceTheme.ToLowerInvariant() == "system")
        {
            try
            {
                dark = SystemInformation.HighContrast ? false : IsSystemDarkPreferDark();
            }
            catch
            {
                dark = false;
            }
        }

        return dark;
    }

    private void ApplyChromeTheme()
    {
        var dark = IsDarkChrome();

        if (!dark)
        {
            BackColor = Color.FromArgb(243, 243, 243);
            ForeColor = SystemColors.WindowText;
            _contentHost.BackColor = Color.White;
            _tabStripOuter.BackColor = Color.FromArgb(236, 236, 236);
            _tool.BackColor = Color.FromArgb(248, 248, 248);
            _tool.ForeColor = Color.FromArgb(30, 30, 30);
            _newTabPlus.BackColor = Color.FromArgb(230, 230, 230);
            _newTabPlus.ForeColor = Color.FromArgb(40, 40, 40);
        }
        else
        {
            BackColor = Color.FromArgb(32, 33, 36);
            ForeColor = Color.FromArgb(232, 234, 237);
            _contentHost.BackColor = Color.FromArgb(28, 28, 31);
            _tabStripOuter.BackColor = Color.FromArgb(36, 37, 40);
            _tool.BackColor = Color.FromArgb(42, 43, 46);
            _tool.ForeColor = Color.FromArgb(232, 234, 237);
            _newTabPlus.BackColor = Color.FromArgb(55, 55, 58);
            _newTabPlus.ForeColor = Color.FromArgb(220, 220, 225);
        }

        foreach (var s in _sessions)
        {
            s.Header.DarkChrome = dark;
            s.Header.Invalidate();
        }
    }

    private bool IsCompactLayout() =>
        ClientSize.Width > 0 && ClientSize.Width < MobileLayoutBreakpoint;

    private void ApplyResponsiveChrome()
    {
        var compact = IsCompactLayout();
        _tabStripOuter.Height = compact ? 56 : 46;
        _newTabPlus.Height = compact ? 40 : 32;
        _newTabPlus.Width = compact ? 44 : 38;
        foreach (var s in _sessions)
            s.Header.SetCompact(compact);

        if (compact)
        {
            _menuBookmarks.Visible = false;
            _menuHistory.Visible = false;
            _btnGo.Visible = false;
            _urlBox.Width = Math.Max(120, ClientSize.Width - 220);
        }
        else
        {
            _menuBookmarks.Visible = true;
            _menuHistory.Visible = true;
            _btnGo.Visible = true;
            _urlBox.Width = Math.Max(200, Math.Min(520, ClientSize.Width - 380));
        }

        ApplyToolbarSettings();
    }

    private static bool IsSystemDarkPreferDark()
    {
        try
        {
            using var k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
            var v = k?.GetValue("AppsUseLightTheme");
            return v is int i && i == 0;
        }
        catch
        {
            return false;
        }
    }

    private void ShowSettingsDialog()
    {
        using var f = new SettingsForm(_settings, () =>
        {
            _settings = BrowserSettingsStore.Load();
            ApplyChromeTheme();
            ApplyToolbarSettings();
            ApplyTabStripDock();
        });
        f.ShowDialog(this);
    }

    private void ShowDownloadsWindow()
    {
        if (_downloadsForm == null || _downloadsForm.IsDisposed)
            _downloadsForm = new DownloadsForm(_settings);
        _downloadsForm.Reload();
        _downloadsForm.Show();
        _downloadsForm.BringToFront();
    }

    private void OpenIncognitoWindow()
    {
        var u = GetActiveWebView()?.CoreWebView2?.Source ?? UrlNormalizer.DefaultHome;
        new MainForm(u, incognito: true).Show();
    }

    private void OpenDevTools() => GetActiveWebView()?.CoreWebView2?.OpenDevToolsWindow();

    private WebView2? GetActiveWebView() => _selectedSession?.WebView;

    private async void OnFormLoad(object? sender, EventArgs e)
    {
        try
        {
            if (!_incognito && _settings.StartupPage.ToLowerInvariant() == "continue")
            {
                var tabs = BrowserSettingsStore.LoadLastSessionTabs();
                if (tabs.Count > 0)
                {
                    foreach (var u in tabs)
                        await AddNewTabAsync(UrlNormalizer.ResolveAddressBarInput(u, _settings));
                    return;
                }
            }

            await AddNewTabAsync(UrlNormalizer.ResolveAddressBarInput(_firstUrl, _settings));
            RebuildBookmarksMenu();
            RebuildHistoryMenu();
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "Не удалось инициализировать WebView2. Установите «Microsoft Edge WebView2 Runtime».\n\n" + ex.Message,
                "DIERbrowser",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning
            );
        }
    }

    private async Task EnsureEnvAsync()
    {
        if (_env != null) return;
        string folder;
        if (_incognito && _incognitoProfileDir != null)
            folder = _incognitoProfileDir;
        else
        {
            BrowserDataStore.EnsureDir();
            folder = BrowserDataStore.UserDataFolder;
        }

        var opts = new CoreWebView2EnvironmentOptions();
        var args = new List<string>();
        if (!_settings.HardwareAcceleration)
            args.Add("--disable-gpu");
        if (!string.IsNullOrWhiteSpace(_settings.ProxyServer))
            args.Add("--proxy-server=" + _settings.ProxyServer.Trim());
        if (args.Count > 0)
            opts.AdditionalBrowserArguments = string.Join(" ", args);

        _env = await CoreWebView2Environment.CreateAsync(null, folder, opts);
    }

    private async Task AddNewTabAsync(string url)
    {
        await EnsureEnvAsync();

        var host = new Panel
        {
            Dock = DockStyle.Fill,
            Visible = false,
            Padding = Padding.Empty,
            Margin = Padding.Empty,
        };
        var wv = new WebView2 { Dock = DockStyle.Fill };
        host.Controls.Add(wv);

        var header = new EdgeTabHeader(IsCompactLayout())
        {
            TabTitle = "Загрузка…",
        };
        var session = new BrowserTabSession(host, wv, header);
        header.Tag = session;

        header.TabSelectRequested += (_, _) => SelectTab(session);
        header.CloseRequested += (_, _) => CloseTab(session, openReplacementIfLast: true);
        header.TabContextRequested += (_, _) =>
        {
            _contextSession = session;
            _tabContextMenu.Show(Control.MousePosition);
        };
        header.LeftMouseDownOnTab += (_, e) => OnTabLeftDown(session, e);

        _sessions.Add(session);
        _contentHost.Controls.Add(host);
        RebuildTabFlowFromSessions();
        SelectTab(session);

        try
        {
            await wv.EnsureCoreWebView2Async(_env!);
            wv.ZoomFactor = Math.Clamp(_settings.PageZoomPercent, 50, 200) / 100.0;
            wv.CoreWebView2.Settings.AreDevToolsEnabled = true;
            wv.CoreWebView2.Settings.IsStatusBarEnabled = false;
            wv.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;

            wv.CoreWebView2.NavigationStarting += (_, e) =>
            {
                if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out var nav)) return;
                if (nav.Scheme.Equals("dierbrowser", StringComparison.OrdinalIgnoreCase))
                {
                    e.Cancel = true;
                    var h = nav.Host.ToLowerInvariant();
                    BeginInvoke(() =>
                    {
                        if (h is "settings" or "")
                            ShowSettingsDialog();
                        else if (h == "downloads")
                            ShowDownloadsWindow();
                    });
                }
            };

            wv.CoreWebView2.SourceChanged += (_, __) =>
            {
                if (_selectedSession == session && wv.CoreWebView2 != null)
                    BeginInvoke(() => _urlBox.Text = wv.CoreWebView2.Source);
                UpdateNavButtons();
            };
            wv.CoreWebView2.NavigationCompleted += async (_, e) =>
            {
                UpdateNavButtons();
                if (!e.IsSuccess || wv.CoreWebView2 == null) return;
                var u = wv.CoreWebView2.Source;
                var title = wv.CoreWebView2.DocumentTitle ?? "";
                if (!_incognito)
                    BrowserDataStore.AppendHistory(u, title);
                if (_selectedSession == session)
                    RebuildHistoryMenu();
                UpdateTabTitle(session, wv);
                UpdateBookmarkStar();
                if (!_incognito && _settings.AutofillPasswordsEnabled)
                    await TryAutofillAsync(wv);
            };
            wv.CoreWebView2.DocumentTitleChanged += (_, _) =>
            {
                UpdateTabTitle(session, wv);
                if (_selectedSession == session)
                    UpdateBookmarkStar();
            };

            wv.CoreWebView2.NewWindowRequested += (_, e) =>
            {
                e.Handled = true;
                BeginInvoke(() => _ = AddNewTabAsync(e.Uri));
            };

            wv.CoreWebView2.DownloadStarting += (_, e) => OnDownloadStarting(e);

            if (!_incognito && _settings.AutofillPasswordsEnabled)
            {
                wv.CoreWebView2.WebMessageReceived += OnWebMessagePassword;
                await wv.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(PasswordCaptureScript);
            }

            var target = UrlNormalizer.ResolveAddressBarInput(url, _settings);
            wv.CoreWebView2.Navigate(target);
        }
        catch (Exception ex)
        {
            session.Header.TabTitle = "Ошибка";
            MessageBox.Show(ex.Message, "DIERbrowser", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void BuildTabContextMenu()
    {
        _tabContextMenu.Items.Add("Новая вкладка", null, (_, _) => _ = AddNewTabAsync(HomePageUrl()));
        _tabContextMenu.Items.Add("Закрыть вкладку", null, (_, _) =>
        {
            if (_contextSession != null)
                CloseTab(_contextSession, openReplacementIfLast: true);
        });
        _tabContextMenu.Items.Add("Закрыть другие", null, (_, _) =>
        {
            if (_contextSession == null) return;
            foreach (var s in _sessions.ToList())
            {
                if (s != _contextSession)
                    CloseTab(s, openReplacementIfLast: false);
            }
        });
        _tabContextMenu.Items.Add("Дублировать", null, (_, _) =>
        {
            var u = _contextSession?.WebView.CoreWebView2?.Source;
            if (!string.IsNullOrEmpty(u))
                _ = AddNewTabAsync(u);
        });
        _tabContextMenu.Items.Add("Обновить", null, (_, _) => _contextSession?.WebView.Reload());
    }

    private void LongPressTimer_Tick(object? sender, EventArgs e)
    {
        _longPressTimer.Stop();
        if (_longPressHeader?.Tag is not BrowserTabSession session) return;
        var bounds = _longPressHeader.RectangleToScreen(_longPressHeader.ClientRectangle);
        if (!bounds.Contains(Control.MousePosition)) return;
        _contextSession = session;
        _tabContextMenu.Show(Control.MousePosition);
    }

    private void OnTabLeftDown(BrowserTabSession session, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left) return;
        _draggingSession = session;
        _dragStartScreen = Control.MousePosition;
        _tabReorderActive = false;
        _longPressHeader = session.Header;
        _longPressTimer.Stop();
        _longPressTimer.Start();
    }

    private void SelectTab(BrowserTabSession session)
    {
        if (!_sessions.Contains(session)) return;
        _longPressTimer.Stop();
        _draggingSession = null;
        _tabReorderActive = false;

        foreach (var s in _sessions)
        {
            s.HostPanel.Visible = ReferenceEquals(s, session);
            s.Header.Selected = ReferenceEquals(s, session);
        }

        _selectedSession = session;
        session.HostPanel.BringToFront();
        SyncChromeFromActiveTab();
    }

    private void CloseTab(BrowserTabSession session, bool openReplacementIfLast)
    {
        if (!_sessions.Contains(session)) return;

        if (_sessions.Count == 1)
        {
            _sessions.Remove(session);
            _tabFlow.Controls.Remove(session.Header);
            _contentHost.Controls.Remove(session.HostPanel);
            try
            {
                session.WebView.Dispose();
            }
            catch
            {
                /* ignore */
            }

            try
            {
                session.HostPanel.Dispose();
            }
            catch
            {
                /* ignore */
            }

            _selectedSession = null;
            if (openReplacementIfLast)
                _ = AddNewTabAsync(HomePageUrl());
            return;
        }

        var ix = _sessions.IndexOf(session);
        _sessions.RemoveAt(ix);
        _tabFlow.Controls.Remove(session.Header);
        _contentHost.Controls.Remove(session.HostPanel);
        try
        {
            session.WebView.Dispose();
        }
        catch
        {
            /* ignore */
        }

        try
        {
            session.HostPanel.Dispose();
        }
        catch
        {
            /* ignore */
        }

        if (_selectedSession == session)
        {
            _selectedSession = null;
            var nextIx = Math.Min(ix, _sessions.Count - 1);
            if (nextIx >= 0)
                SelectTab(_sessions[nextIx]);
            else
                SyncChromeFromActiveTab();
        }
        else
        {
            foreach (var s in _sessions)
                s.Header.Selected = s == _selectedSession;
            SyncChromeFromActiveTab();
        }

        RebuildTabFlowFromSessions();
    }

    private void RebuildTabFlowFromSessions()
    {
        _tabFlow.SuspendLayout();
        foreach (var s in _sessions)
            _tabFlow.Controls.Remove(s.Header);
        foreach (var s in _sessions)
            _tabFlow.Controls.Add(s.Header);
        if (_tabFlow.Controls.Contains(_newTabPlus))
            _tabFlow.Controls.Remove(_newTabPlus);
        _tabFlow.Controls.Add(_newTabPlus);
        _tabFlow.ResumeLayout();
    }

    private BrowserTabSession? HitTestSessionAtFlowPoint(Point ptInFlow)
    {
        foreach (Control c in _tabFlow.Controls)
        {
            if (c == _newTabPlus || c is not EdgeTabHeader h) continue;
            if (!c.Bounds.Contains(ptInFlow)) continue;
            if (h.Tag is BrowserTabSession s)
                return s;
        }

        return null;
    }

    private void MoveSession(int fromIndex, int toIndex)
    {
        if (fromIndex == toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= _sessions.Count || toIndex >= _sessions.Count)
            return;
        var s = _sessions[fromIndex];
        _sessions.RemoveAt(fromIndex);
        _sessions.Insert(toIndex, s);
        RebuildTabFlowFromSessions();
        _draggingSession = s;
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        if (_draggingSession == null || (Control.MouseButtons & MouseButtons.Left) != MouseButtons.Left)
            return;

        var cur = Control.MousePosition;
        var dist = Math.Abs(cur.X - _dragStartScreen.X) + Math.Abs(cur.Y - _dragStartScreen.Y);
        if (dist > 10)
        {
            _longPressTimer.Stop();
            _tabReorderActive = true;
        }

        if (!_tabReorderActive) return;

        var pt = _tabFlow.PointToClient(cur);
        var target = HitTestSessionAtFlowPoint(pt);
        if (target == null || target == _draggingSession) return;

        var from = _sessions.IndexOf(_draggingSession);
        var to = _sessions.IndexOf(target);
        if (from < 0 || to < 0) return;
        MoveSession(from, to);
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Left)
        {
            _longPressTimer.Stop();
            _draggingSession = null;
            _tabReorderActive = false;
            _longPressHeader = null;
        }

        base.OnMouseUp(e);
    }

    private static void UpdateTabTitle(BrowserTabSession session, WebView2 wv)
    {
        var t = wv.CoreWebView2?.DocumentTitle;
        if (string.IsNullOrWhiteSpace(t))
            t = wv.CoreWebView2?.Source ?? "Вкладка";
        if (t.Length > 32)
            t = t[..29] + "…";
        session.Header.TabTitle = t;
    }

    private void OnWebMessagePassword(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (_incognito || !_settings.AutofillPasswordsEnabled) return;
        try
        {
            var json = e.TryGetWebMessageAsString();
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.GetProperty("type").GetString() != "dier_pw_submit") return;
            var origin = root.GetProperty("origin").GetString() ?? "";
            var user = root.GetProperty("username").GetString() ?? "";
            var pass = root.GetProperty("password").GetString() ?? "";
            if (pass.Length == 0) return;
            if (!Uri.TryCreate(origin, UriKind.Absolute, out var ou)) return;
            var host = ou.Host.ToLowerInvariant();
            if (_settings.PasswordNeverSaveHosts.Any(h => string.Equals(h, host, StringComparison.OrdinalIgnoreCase)))
                return;

            BeginInvoke(() =>
            {
                using var dlg = new SavePasswordDialog(origin, user);
                var r = dlg.ShowDialog(this);
                if (r == DialogResult.Cancel) return;
                if (dlg.NeverForSite)
                {
                    if (!_settings.PasswordNeverSaveHosts.Contains(host, StringComparer.OrdinalIgnoreCase))
                        _settings.PasswordNeverSaveHosts.Add(host);
                    BrowserSettingsStore.Save(_settings);
                    return;
                }

                if (dlg.SaveChosen)
                    PasswordVault.Save(origin, user, pass);
            });
        }
        catch
        {
            /* ignore malformed */
        }
    }

    private async Task TryAutofillAsync(WebView2 wv)
    {
        if (wv.CoreWebView2 == null) return;
        if (!Uri.TryCreate(wv.CoreWebView2.Source, UriKind.Absolute, out var u)) return;
        var host = u.Host;
        if (host.Length == 0) return;
        var cred = PasswordVault.FindByHost(host);
        if (cred == null) return;
        var uj = System.Text.Json.JsonSerializer.Serialize(cred.Username);
        var pj = System.Text.Json.JsonSerializer.Serialize(cred.Password);
        var script =
            "(function(){var u=" + uj + ",p=" + pj + ";" +
            "document.querySelectorAll('input[type=\"password\"]').forEach(function(el){el.value=p;try{el.dispatchEvent(new Event('input',{bubbles:true}));}catch(e){}});" +
            "document.querySelectorAll('input[type=\"text\"],input[type=\"email\"],input').forEach(function(el){" +
            "var t=(el.type||'').toLowerCase();if(t!=='text'&&t!=='email'&&t!=='tel'&&t!=='')return;" +
            "var n=(el.name+' '+el.id).toLowerCase();if(/user|login|email|mail|phone/.test(n)){el.value=u;try{el.dispatchEvent(new Event('input',{bubbles:true}));}catch(e){}}});})();";
        try
        {
            await wv.CoreWebView2.ExecuteScriptAsync(script);
        }
        catch
        {
            /* ignore */
        }
    }

    private void OnDownloadStarting(CoreWebView2DownloadStartingEventArgs e)
    {
        e.Handled = true;
        var dir = string.IsNullOrWhiteSpace(_settings.DownloadFolder)
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads")
            : _settings.DownloadFolder;
        try
        {
            Directory.CreateDirectory(dir);
        }
        catch
        {
            /* ignore */
        }

        var op = e.DownloadOperation;
        var suggested = TryFileNameFromContentDisposition(op.ContentDisposition);
        if (string.IsNullOrWhiteSpace(suggested))
        {
            var uriStr = op.Uri ?? "";
            try
            {
                if (Uri.TryCreate(uriStr, UriKind.Absolute, out var abs))
                    suggested = Path.GetFileName(abs.LocalPath);
                else
                    suggested = Path.GetFileName(uriStr);
            }
            catch
            {
                suggested = "download";
            }
        }

        if (string.IsNullOrWhiteSpace(suggested))
            suggested = "download";

        suggested = SanitizeFileName(suggested);
        var path = UniquePath(Path.Combine(dir, suggested));
        e.ResultFilePath = path;

        var id = Guid.NewGuid().ToString("N");
        var ent = new DownloadHistoryStore.Entry
        {
            Id = id,
            FileName = Path.GetFileName(path),
            FullPath = path,
            SourceUrl = op.Uri ?? "",
            State = "in_progress",
            StartedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
        };
        DownloadHistoryStore.Upsert(ent, _settings.DownloadsMaxEntries);

        op.StateChanged += (_, _) =>
        {
            try
            {
                if (op.State == CoreWebView2DownloadState.Completed)
                {
                    ent.State = "completed";
                    ent.CompletedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                    var totalU = op.TotalBytesToReceive ?? 0UL;
                    if (totalU == 0 && op.BytesReceived > 0)
                        totalU = (ulong)op.BytesReceived;
                    ent.TotalBytes = UlongToLongClamped(totalU);
                    ent.ReceivedBytes = op.BytesReceived > 0 ? op.BytesReceived : ent.TotalBytes;
                }
                else if (op.State == CoreWebView2DownloadState.Interrupted)
                {
                    ent.State = "failed";
                    ent.CompletedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                }

                DownloadHistoryStore.Upsert(ent, _settings.DownloadsMaxEntries);
            }
            catch
            {
                /* ignore */
            }
        };
    }

    private static string TryFileNameFromContentDisposition(string? header)
    {
        if (string.IsNullOrWhiteSpace(header)) return "";
        // attachment; filename="file.zip"  или filename*=UTF-8''...
        var h = header;
        var idx = h.IndexOf("filename*=", StringComparison.OrdinalIgnoreCase);
        if (idx >= 0)
        {
            var part = h[(idx + "filename*=".Length)..].Trim();
            var semi = part.IndexOf(';');
            if (semi >= 0) part = part[..semi].Trim();
            var q = part.LastIndexOf('\'');
            if (q >= 0 && q + 1 < part.Length)
                part = Uri.UnescapeDataString(part[(q + 1)..].Trim('"', ' '));
            if (part.Length > 0) return part;
        }

        idx = h.IndexOf("filename=", StringComparison.OrdinalIgnoreCase);
        if (idx < 0) return "";
        var val = h[(idx + "filename=".Length)..].Trim();
        if (val.StartsWith('"'))
        {
            var end = val.IndexOf('"', 1);
            if (end > 1) return val[1..end];
        }
        else
        {
            var semi = val.IndexOf(';');
            if (semi >= 0) val = val[..semi];
            return val.Trim();
        }

        return "";
    }

    private static long UlongToLongClamped(ulong u) =>
        u > (ulong)long.MaxValue ? long.MaxValue : (long)u;

    private static string SanitizeFileName(string name)
    {
        foreach (var c in Path.GetInvalidFileNameChars())
            name = name.Replace(c, '_');
        return string.IsNullOrWhiteSpace(name) ? "download" : name.Trim();
    }

    private static string UniquePath(string path)
    {
        if (!File.Exists(path)) return path;
        var dir = Path.GetDirectoryName(path) ?? "";
        var name = Path.GetFileNameWithoutExtension(path);
        var ext = Path.GetExtension(path);
        for (var i = 1; i < 999; i++)
        {
            var p = Path.Combine(dir, $"{name} ({i}){ext}");
            if (!File.Exists(p)) return p;
        }

        return path;
    }

    private void NavigateFromAddressBar()
    {
        var raw = _urlBox.Text ?? "";
        NavigateActive(UrlNormalizer.ResolveAddressBarInput(raw, _settings));
    }

    private void NavigateActive(string url)
    {
        var wv = GetActiveWebView();
        if (wv?.CoreWebView2 == null) return;
        try
        {
            wv.CoreWebView2.Navigate(url);
        }
        catch
        {
            /* ignore */
        }
    }

    private void SyncChromeFromActiveTab()
    {
        var wv = GetActiveWebView();
        if (wv?.CoreWebView2 != null)
            _urlBox.Text = wv.CoreWebView2.Source;
        else
            _urlBox.Text = "";
        UpdateNavButtons();
        UpdateBookmarkStar();
    }

    private void UpdateNavButtons()
    {
        var wv = GetActiveWebView();
        if (wv?.CoreWebView2 == null)
        {
            _btnBack.Enabled = false;
            _btnFwd.Enabled = false;
            return;
        }

        _btnBack.Enabled = wv.CoreWebView2.CanGoBack;
        _btnFwd.Enabled = wv.CoreWebView2.CanGoForward;
    }

    private void CloseCurrentTab()
    {
        if (_selectedSession != null)
            CloseTab(_selectedSession, openReplacementIfLast: true);
    }

    private void OnBookmarkClick(object? sender, EventArgs e)
    {
        var wv = GetActiveWebView();
        if (wv?.CoreWebView2 == null) return;
        var url = wv.CoreWebView2.Source;
        var title = wv.CoreWebView2.DocumentTitle ?? url;
        if (BrowserDataStore.IsBookmarked(url))
        {
            BrowserDataStore.RemoveBookmark(url);
            _btnBookmark.Text = "☆";
        }
        else
        {
            BrowserDataStore.AddBookmark(title, url);
            _btnBookmark.Text = "★";
        }

        RebuildBookmarksMenu();
    }

    private void UpdateBookmarkStar()
    {
        var wv = GetActiveWebView();
        if (wv?.CoreWebView2 == null)
        {
            _btnBookmark.Text = "☆";
            return;
        }

        _btnBookmark.Text = BrowserDataStore.IsBookmarked(wv.CoreWebView2.Source) ? "★" : "☆";
    }

    private void RebuildBookmarksMenu()
    {
        _menuBookmarks.DropDownItems.Clear();
        foreach (var b in BrowserDataStore.LoadBookmarks())
        {
            var title = b.Title.Length > 0 ? b.Title : b.Url;
            if (title.Length > 42)
                title = title[..39] + "…";
            var url = b.Url;
            _menuBookmarks.DropDownItems.Add(title, null, (_, _) => NavigateActive(url));
        }

        if (_menuBookmarks.DropDownItems.Count == 0)
            _menuBookmarks.DropDownItems.Add("(пусто)").Enabled = false;
    }

    private void RebuildHistoryMenu()
    {
        _menuHistory.DropDownItems.Clear();
        foreach (var h in BrowserDataStore.LoadHistory().Take(40))
        {
            var label = h.Title.Length > 0 ? h.Title : h.Url;
            if (label.Length > 44)
                label = label[..41] + "…";
            var url = h.Url;
            _menuHistory.DropDownItems.Add(label, null, (_, _) => NavigateActive(url));
        }

        if (_menuHistory.DropDownItems.Count == 0)
            _menuHistory.DropDownItems.Add("(пусто)").Enabled = false;
    }

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        if (keyData == (Keys.Control | Keys.T))
        {
            _ = AddNewTabAsync(HomePageUrl());
            return true;
        }

        if (keyData == (Keys.Control | Keys.W))
        {
            CloseCurrentTab();
            return true;
        }

        if (keyData == (Keys.Control | Keys.L))
        {
            _urlBox.Focus();
            _urlBox.SelectAll();
            return true;
        }

        if (keyData == (Keys.Control | Keys.Shift | Keys.N))
        {
            OpenIncognitoWindow();
            return true;
        }

        if (keyData == (Keys.Control | Keys.Shift | Keys.I) || keyData == Keys.F12)
        {
            OpenDevTools();
            return true;
        }

        if (keyData == (Keys.Alt | Keys.Left))
        {
            GetActiveWebView()?.CoreWebView2?.GoBack();
            return true;
        }

        if (keyData == (Keys.Alt | Keys.Right))
        {
            GetActiveWebView()?.CoreWebView2?.GoForward();
            return true;
        }

        if (keyData == Keys.F5)
        {
            GetActiveWebView()?.Reload();
            return true;
        }

        return base.ProcessCmdKey(ref msg, keyData);
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (!_incognito && _settings.StartupPage.ToLowerInvariant() == "continue")
        {
            var urls = new List<string>();
            foreach (var s in _sessions)
            {
                if (s.WebView.CoreWebView2 != null)
                {
                    var src = s.WebView.CoreWebView2.Source;
                    if (!string.IsNullOrWhiteSpace(src) && src.StartsWith("http", StringComparison.OrdinalIgnoreCase))
                        urls.Add(src);
                }
            }

            BrowserSettingsStore.SaveLastSessionTabs(urls);
        }

        if (!_incognito)
        {
            if (_settings.ClearBrowsingDataOnExit)
            {
                BrowserDataStore.ClearHistoryFile();
                DownloadHistoryStore.Clear(_settings.DownloadsMaxEntries);
            }

            if (_settings.DownloadsAutoCleanup90Days)
                DownloadHistoryStore.CleanupOlderThan90Days(_settings.DownloadsMaxEntries);
        }

        foreach (var s in _sessions.ToList())
        {
            try
            {
                s.WebView.Dispose();
            }
            catch
            {
                /* ignore */
            }

            try
            {
                s.HostPanel.Dispose();
            }
            catch
            {
                /* ignore */
            }
        }

        _sessions.Clear();

        if (_incognito && !string.IsNullOrEmpty(_incognitoProfileDir) && Directory.Exists(_incognitoProfileDir))
        {
            try
            {
                Directory.Delete(_incognitoProfileDir, true);
            }
            catch
            {
                /* ignore */
            }
        }

        base.OnFormClosing(e);
    }
}
