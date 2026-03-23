/**
 * electron-builder afterPack: кладёт DIERbrowser.exe рядом с DierCHAT.exe (как ожидает main.ts).
 */
const fs = require('fs');
const path = require('path');

/** @param {{ electronPlatformName: string; appOutDir: string }} context */
async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const src = path.join(__dirname, '..', 'browser-bundle', 'DIERbrowser.exe');
  if (!fs.existsSync(src)) {
    console.warn(
      '[afterPack] Нет browser-bundle/DIERbrowser.exe — кнопка «DIERbrowser» откроет системный браузер. Сборка браузера: npm run browser:pack-win'
    );
    return;
  }

  const dest = path.join(context.appOutDir, 'DIERbrowser.exe');
  fs.copyFileSync(src, dest);
  console.log('[afterPack] DIERbrowser.exe →', dest);
}

module.exports = afterPack;
module.exports.default = afterPack;
