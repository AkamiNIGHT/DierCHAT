/**
 * После assembleDebug / assembleRelease копирует собранный APK в release/dier-chat.apk
 */
const fs = require('fs');
const path = require('path');

const mode = (process.argv[2] || 'debug').toLowerCase();
const root = path.join(__dirname, '..');
const releaseDir = path.join(root, 'release');
const sub = mode === 'release' ? 'release' : 'debug';
const dir = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', sub);

function pickApk() {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.apk'));
  if (files.length === 0) return null;
  const noUnaligned = files.filter((f) => !f.includes('unaligned'));
  const pool = noUnaligned.length ? noUnaligned : files;
  const preferSigned = pool.filter((f) => !/unsigned/i.test(f));
  const pick = (preferSigned.length ? preferSigned : pool).sort();
  return path.join(dir, pick[pick.length - 1]);
}

const src = pickApk();
if (!src) {
  console.error(`[copy-android-apk] Нет APK в ${dir}. Сначала: npm run android:build:${mode === 'release' ? 'release' : 'debug'}`);
  process.exit(1);
}

if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir, { recursive: true });
}

const dest = path.join(releaseDir, 'dier-chat.apk');
fs.copyFileSync(src, dest);
console.log(`[copy-android-apk] ${path.relative(root, src)} → ${path.relative(root, dest)}`);
