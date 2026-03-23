namespace DIERbrowser;

/// <summary>ТЗ §47.6.2: «Сохранить» / «Никогда» / «Не сейчас».</summary>
internal sealed class SavePasswordDialog : Form
{
    public bool SaveChosen { get; private set; }
    public bool NeverForSite { get; private set; }

    public SavePasswordDialog(string origin, string usernameHint)
    {
        Text = "Сохранить пароль?";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterParent;
        Width = 420;
        Height = 200;
        Padding = new Padding(16);

        var lbl = new Label
        {
            AutoSize = false,
            Width = 380,
            Height = 64,
            Location = new Point(16, 16),
            Text = $"Сохранить пароль для этого сайта?\r\n\r\n{origin}\r\nПользователь: {(string.IsNullOrEmpty(usernameHint) ? "—" : usernameHint)}",
        };

        var btnSave = new Button { Text = "Сохранить", Location = new Point(16, 100), Width = 110, DialogResult = DialogResult.None };
        var btnNever = new Button { Text = "Никогда", Location = new Point(136, 100), Width = 110 };
        var btnLater = new Button { Text = "Не сейчас", Location = new Point(256, 100), Width = 110, DialogResult = DialogResult.Cancel };

        btnSave.Click += (_, _) =>
        {
            SaveChosen = true;
            NeverForSite = false;
            DialogResult = DialogResult.OK;
            Close();
        };
        btnNever.Click += (_, _) =>
        {
            SaveChosen = false;
            NeverForSite = true;
            DialogResult = DialogResult.OK;
            Close();
        };
        btnLater.Click += (_, _) =>
        {
            SaveChosen = false;
            NeverForSite = false;
            DialogResult = DialogResult.Cancel;
            Close();
        };

        Controls.Add(lbl);
        Controls.Add(btnSave);
        Controls.Add(btnNever);
        Controls.Add(btnLater);
        CancelButton = btnLater;
    }
}
