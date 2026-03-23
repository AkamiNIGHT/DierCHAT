/**
 * Runs android/gradlew with JAVA_HOME pointing to JDK 11+.
 * Fixes: "This build uses a Java 8 JVM" when java on PATH is old.
 */
const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function javaMajorAtHome(home) {
  const javaExe = path.join(home, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  if (!fs.existsSync(javaExe)) return 0;
  try {
    const out = execSync(`"${javaExe}" -version 2>&1`, { encoding: 'utf8' });
    // "java version \"1.8.0_321\"" -> 8 ; "openjdk version \"21.0.4\"" -> 21
    const m = out.match(/version "(1\.)?(\d+)/);
    if (m) {
      return m[1] ? parseInt(m[2], 10) : parseInt(m[2], 10);
    }
    const m2 = out.match(/(\d+)(?:\.\d+)+/);
    if (m2) return parseInt(m2[1], 10);
    return 0;
  } catch {
    return 0;
  }
}

function norm(p) {
  try {
    return path.normalize(path.resolve(p));
  } catch {
    return '';
  }
}

function pushUnique(arr, p) {
  const n = norm(p);
  if (!n || !fs.existsSync(path.join(n, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'))) return;
  if (!arr.includes(n)) arr.push(n);
}

function javaHomesFromWhere() {
  const homes = [];
  if (process.platform !== 'win32') return homes;
  try {
    const out = execSync('where.exe java', { encoding: 'utf8', windowsHide: true });
    for (const line of out.split(/\r?\n/)) {
      const javaExe = line.trim();
      if (!javaExe || !fs.existsSync(javaExe)) continue;
      const home = path.dirname(path.dirname(javaExe));
      pushUnique(homes, home);
    }
  } catch {
    /* no java on PATH */
  }
  return homes;
}

function discoverWindowsJdkFolders() {
  const homes = [];
  if (process.platform !== 'win32') return homes;

  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const pw = process.env.ProgramW6432 || pf;
  const local = process.env.LOCALAPPDATA || '';
  const userProfile = process.env.USERPROFILE || os.homedir();

  const roots = [
    path.join(pf, 'Android', 'Android Studio', 'jbr'),
    path.join(pw, 'Android', 'Android Studio', 'jbr'),
    path.join(local, 'Programs', 'Android', 'Android Studio', 'jbr'),
    path.join(local, 'Android', 'Android Studio', 'jbr'),
    path.join(userProfile, 'AppData', 'Local', 'Programs', 'Android', 'Android Studio', 'jbr'),
    path.join(pf, 'JetBrains', 'Android Studio', 'jbr'),
    path.join(pw, 'JetBrains', 'Android Studio', 'jbr'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Android', 'Android Studio', 'jbr'),
  ];

  roots.forEach((r) => pushUnique(homes, r));

  const scanParent = (parent, re) => {
    if (!fs.existsSync(parent)) return;
    try {
      for (const name of fs.readdirSync(parent)) {
        if (!re.test(name)) continue;
        pushUnique(homes, path.join(parent, name));
      }
    } catch {
      /* ignore */
    }
  };

  scanParent(path.join(pf, 'Java'), /^(jdk|jre|jdk-|ms-|openjdk)/i);
  scanParent(path.join(pf, 'Microsoft'), /^jdk/i);
  scanParent(path.join(pw, 'Eclipse Adoptium'), /^jdk/i);
  scanParent(path.join(pf, 'Eclipse Adoptium'), /^jdk/i);

  // Any "Android Studio" folder under Program Files\Android (custom install name)
  const androidRoot = path.join(pf, 'Android');
  if (fs.existsSync(androidRoot)) {
    try {
      for (const name of fs.readdirSync(androidRoot)) {
        pushUnique(homes, path.join(androidRoot, name, 'jbr'));
      }
    } catch {
      /* ignore */
    }
  }

  return homes;
}

function collectCandidates() {
  const order = [];

  for (const key of ['JAVA_HOME', 'JDK_HOME', 'STUDIO_JDK']) {
    const v = process.env[key];
    if (v) order.push(norm(v));
  }
  if (process.platform === 'win32') {
    javaHomesFromWhere().forEach((h) => order.push(h));
    discoverWindowsJdkFolders().forEach((h) => order.push(h));
  } else if (process.platform === 'darwin') {
    order.push(
      '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
      '/Applications/Android Studio.app/Contents/jbr'
    );
  } else {
    order.push(
      path.join(os.homedir(), 'android-studio', 'jbr'),
      '/opt/android-studio/jbr',
      '/usr/lib/jvm/java-17-openjdk-amd64',
      '/usr/lib/jvm/java-21-openjdk-amd64'
    );
  }

  const seen = new Set();
  const list = [];
  for (const home of order) {
    const n = norm(home);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    list.push(n);
  }
  return list;
}

function findJava11PlusHome() {
  for (const home of collectCandidates()) {
    const major = javaMajorAtHome(home);
    if (major >= 11) return home;
  }
  return null;
}

const args = process.argv.slice(2);
const task = args.length ? args : ['assembleDebug'];
/** Без демона меньше сбоев на Windows (BindException: Address already in use у Gradle). */
const gradleArgs = ['--no-daemon', ...task];
const androidDir = path.join(__dirname, '..', 'android');
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : 'gradlew';

const jhome = findJava11PlusHome();
if (!jhome) {
  console.error(
    '\n[x] JDK 11+ not found. Install a JDK 17+ or Android Studio (bundled JBR), then:\n' +
      '    PowerShell: $env:JAVA_HOME = "C:\\Program Files\\Android\\Android Studio\\jbr"\n' +
      '    (adjust path if Studio is in another folder)\n'
  );
  process.exit(1);
}

if (norm(process.env.JAVA_HOME || '') !== jhome) {
  console.log(`[android-gradle] Using JAVA_HOME=${jhome} (Java ${javaMajorAtHome(jhome)})`);
}

const env = { ...process.env, JAVA_HOME: jhome };
const r = spawnSync(gradlew, gradleArgs, {
  cwd: androidDir,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(typeof r.status === 'number' ? r.status : 1);
