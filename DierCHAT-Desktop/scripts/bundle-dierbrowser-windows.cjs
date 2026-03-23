/**
 * Собирает DIERbrowser (.NET 8, self-contained single-file) и кладёт exe в browser-bundle/
 * для последующего копирования в папку с DierCHAT.exe (см. scripts/electron-after-pack.cjs).
 *
 * Требования: .NET SDK 8, проект ../../DIERbrowser/DIERbrowser.csproj относительно DierCHAT-Desktop.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const desktopRoot = path.join(__dirname, '..');
const repoRoot = path.join(desktopRoot, '..');
const csproj = path.join(repoRoot, 'DIERbrowser', 'DIERbrowser.csproj');
const outDir = path.join(desktopRoot, 'browser-bundle');
const finalExe = path.join(outDir, 'DIERbrowser.exe');

function run(cmd, args, opts) {
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: false,
    ...opts,
  });
  if (r.error) {
    console.error(r.error);
    return 1;
  }
  return r.status ?? 1;
}

if (!fs.existsSync(csproj)) {
  console.error('[browser:pack-win] Нет проекта:', csproj);
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'dierbrowser-pack-'));
try {
  const code = run(
    'dotnet',
    [
      'publish',
      csproj,
      '-c',
      'Release',
      '-r',
      'win-x64',
      '--self-contained',
      'true',
      '-p:PublishSingleFile=true',
      '-p:IncludeNativeLibrariesForSelfExtract=true',
      '-o',
      tmp,
    ],
    { cwd: repoRoot }
  );
  if (code !== 0) {
    console.error('[browser:pack-win] dotnet publish завершился с кодом', code);
    process.exit(code);
  }

  const built = path.join(tmp, 'DIERbrowser.exe');
  if (!fs.existsSync(built)) {
    console.error('[browser:pack-win] Не найден', built);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.copyFileSync(built, finalExe);
  console.log('[browser:pack-win] Готово:', finalExe);
} finally {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (_) {
    /* ignore */
  }
}
