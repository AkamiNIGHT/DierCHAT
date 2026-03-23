namespace DIERbrowser;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        var settings = BrowserSettingsStore.Load();
        var start = args.Length > 0
            ? UrlNormalizer.ResolveAddressBarInput(args[0], settings)
            : settings.StartupNavigateUrl();
        Application.Run(new MainForm(start));
    }
}
