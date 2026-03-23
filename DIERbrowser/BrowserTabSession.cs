using Microsoft.Web.WebView2.WinForms;

namespace DIERbrowser;

/// <summary>Одна вкладка: хост WebView2 + заголовок в полосе Edge.</summary>
internal sealed class BrowserTabSession
{
    public Panel HostPanel { get; }
    public WebView2 WebView { get; }
    public EdgeTabHeader Header { get; }

    public BrowserTabSession(Panel hostPanel, WebView2 webView, EdgeTabHeader header)
    {
        HostPanel = hostPanel;
        WebView = webView;
        Header = header;
    }
}
