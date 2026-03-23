using System.Drawing.Drawing2D;

namespace DIERbrowser;

/// <summary>Вкладка в стиле Edge: заголовок, крестик, подсветка активной.</summary>
internal sealed class EdgeTabHeader : Panel
{
    private readonly Label _title;
    private readonly Button _close;
    private bool _selected;
    private bool _hover;
    private bool _dark;

    public EdgeTabHeader(bool compactTouch)
    {
        DoubleBuffered = true;
        Height = compactTouch ? 44 : 34;
        MinimumSize = new Size(compactTouch ? 120 : 96, Height);
        MaximumSize = new Size(compactTouch ? 220 : 200, Height);
        Margin = new Padding(compactTouch ? 4 : 2, compactTouch ? 6 : 4, 0, compactTouch ? 6 : 4);
        Cursor = Cursors.Hand;
        Padding = new Padding(compactTouch ? 10 : 8, 0, 4, 0);

        _close = new Button
        {
            Text = "×",
            Dock = DockStyle.Right,
            Width = compactTouch ? 36 : 28,
            FlatStyle = FlatStyle.Flat,
            TabStop = false,
            Font = new Font("Segoe UI Symbol", compactTouch ? 14f : 11f, FontStyle.Regular),
            Cursor = Cursors.Hand,
        };
        _close.FlatAppearance.BorderSize = 0;
        _close.Click += (_, _) => CloseRequested?.Invoke(this, EventArgs.Empty);

        _title = new Label
        {
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            AutoEllipsis = true,
            Font = new Font("Segoe UI", compactTouch ? 12f : 10.25f),
            BackColor = Color.Transparent,
        };
        _title.MouseDown += Title_MouseDown;

        Controls.Add(_title);
        Controls.Add(_close);

        MouseEnter += (_, _) => { _hover = true; Invalidate(); };
        MouseLeave += (_, _) => { _hover = false; Invalidate(); };
        _title.MouseEnter += (_, _) => { _hover = true; Invalidate(); };
        _title.MouseLeave += (_, _) => { _hover = false; Invalidate(); };
    }

    public event EventHandler? CloseRequested;
    public event EventHandler? TabSelectRequested;
    public event EventHandler? TabContextRequested;
    /// <summary>ЛКМ по вкладке (не по крестику) — перетаскивание и long-press.</summary>
    public event MouseEventHandler? LeftMouseDownOnTab;

    public bool Selected
    {
        get => _selected;
        set
        {
            if (_selected == value) return;
            _selected = value;
            PaintChrome();
        }
    }

    public bool DarkChrome
    {
        get => _dark;
        set
        {
            _dark = value;
            PaintChrome();
        }
    }

    public string TabTitle
    {
        get => _title.Text;
        set => _title.Text = value;
    }

    public void SetCompact(bool compactTouch)
    {
        Height = compactTouch ? 44 : 34;
        MinimumSize = new Size(compactTouch ? 120 : 96, Height);
        MaximumSize = new Size(compactTouch ? 220 : 200, Height);
        Margin = new Padding(compactTouch ? 4 : 2, compactTouch ? 6 : 4, 0, compactTouch ? 6 : 4);
        Padding = new Padding(compactTouch ? 10 : 8, 0, 4, 0);
        _close.Width = compactTouch ? 36 : 28;
        _close.Font = new Font("Segoe UI Symbol", compactTouch ? 14f : 11f);
        _title.Font = new Font("Segoe UI", compactTouch ? 12f : 10.25f);
        Invalidate();
    }

    private void Title_MouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Left)
        {
            TabSelectRequested?.Invoke(this, EventArgs.Empty);
            LeftMouseDownOnTab?.Invoke(this, e);
        }

        if (e.Button == MouseButtons.Right)
            TabContextRequested?.Invoke(this, EventArgs.Empty);
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        var child = GetChildAtPoint(e.Location);
        if (child == _close || child == _title) return;
        if (e.Button == MouseButtons.Left)
        {
            TabSelectRequested?.Invoke(this, EventArgs.Empty);
            LeftMouseDownOnTab?.Invoke(this, e);
        }

        if (e.Button == MouseButtons.Right)
            TabContextRequested?.Invoke(this, EventArgs.Empty);
    }

    private void PaintChrome()
    {
        _title.ForeColor = _dark ? Color.FromArgb(230, 230, 235) : Color.FromArgb(30, 30, 30);
        _close.ForeColor = _dark ? Color.FromArgb(200, 200, 210) : Color.FromArgb(80, 80, 80);
        _close.BackColor = Color.Transparent;
        Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;

        Color bg;
        Color border;
        if (_dark)
        {
            if (_selected)
            {
                bg = Color.FromArgb(45, 45, 48);
                border = Color.FromArgb(0, 120, 212);
            }
            else if (_hover)
            {
                bg = Color.FromArgb(55, 55, 58);
                border = Color.FromArgb(70, 70, 75);
            }
            else
            {
                bg = Color.FromArgb(40, 40, 43);
                border = Color.FromArgb(60, 60, 65);
            }
        }
        else
        {
            if (_selected)
            {
                bg = Color.White;
                border = Color.FromArgb(0, 120, 212);
            }
            else if (_hover)
            {
                bg = Color.FromArgb(243, 243, 243);
                border = Color.FromArgb(200, 200, 200);
            }
            else
            {
                bg = Color.FromArgb(236, 236, 236);
                border = Color.FromArgb(210, 210, 210);
            }
        }

        var r = ClientRectangle;
        r.Inflate(-1, -1);
        using var b = new SolidBrush(bg);
        using var pen = new Pen(border, _selected ? 2f : 1f);
        using var path = RoundedRect(r, 6);
        g.FillPath(b, path);
        if (_selected)
        {
            using var accent = new Pen(Color.FromArgb(0, 120, 212), 3f);
            g.DrawLine(accent, r.Left + 4, r.Bottom - 1, r.Right - 4, r.Bottom - 1);
        }
        else
            g.DrawPath(pen, path);
    }

    private static GraphicsPath RoundedRect(Rectangle b, int r)
    {
        var d = r * 2;
        var path = new GraphicsPath();
        path.AddArc(b.Left, b.Top, d, d, 180, 90);
        path.AddArc(b.Right - d, b.Top, d, d, 270, 90);
        path.AddArc(b.Right - d, b.Bottom - d, d, d, 0, 90);
        path.AddArc(b.Left, b.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        Invalidate();
    }
}
