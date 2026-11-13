'use strict';
const { app, BrowserWindow, ipcMain, dialog, session, desktopCapturer, shell, clipboard, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { autoUpdater } = require('electron-updater');

/* ---------- Pfade ---------- */
const USER = app.getPath('userData');
const LOG_DIR = path.join(USER, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'melonenclips.log');
const CONTENT_DIR = path.join(USER, 'content');      // heruntergeladene Editor-Updates
const PUB_FILE = path.join(USER, 'publisher.json');   // nur auf dem PC des Entwicklers
const BUNDLED_DIR = path.join(__dirname, '..', 'app'); // Editor, der mit der .exe installiert wurde

/* ---------- Fehlerprotokoll ---------- */
function log(...parts) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 2 * 1024 * 1024) fs.renameSync(LOG_FILE, LOG_FILE + '.alt');
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${parts.map(String).join(' ')}\n`);
  } catch (e) { /* ignorieren */ }
}
process.on('uncaughtException', (e) => log('HAUPTPROZESS-FEHLER', e && e.stack || e));
process.on('unhandledRejection', (e) => log('HAUPTPROZESS-FEHLER (async)', e && e.stack || e));

if (!app.requestSingleInstanceLock()) { app.quit(); }

/* ---------- Versionen ---------- */
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
function cmpVer(a, b) {
  const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x > y ? 1 : -1; }
  return 0;
}
const bundledVer = () => readJSON(path.join(BUNDLED_DIR, 'version.json'), { version: app.getVersion() }).version;
const cachedVer = () => fs.existsSync(path.join(CONTENT_DIR, 'index.html')) ? readJSON(path.join(CONTENT_DIR, 'version.json'), { version: '0.0.0' }).version : '0.0.0';
const localVer = () => (cmpVer(cachedVer(), bundledVer()) > 0 ? cachedVer() : bundledVer());
const editorFile = () => (cmpVer(cachedVer(), bundledVer()) > 0 ? path.join(CONTENT_DIR, 'index.html') : path.join(BUNDLED_DIR, 'index.html'));

/* ---------- GitHub ---------- */
function repoInfo() {
  const p = readJSON(PUB_FILE, {});
  if (p.repo && p.repo.includes('/')) { const [owner, repo] = p.repo.trim().split('/'); return { owner, repo, branch: p.branch || 'main' }; }
  try {
    const y = fs.readFileSync(path.join(process.resourcesPath, 'app-update.yml'), 'utf8');
    const o = /owner:\s*['"]?([^'"\s]+)/.exec(y), r = /repo:\s*['"]?([^'"\s]+)/.exec(y);
    if (o && r) return { owner: o[1], repo: r[1], branch: 'main' };
  } catch (e) { /* nicht installiert */ }
  return null;
}
const GH_HEADERS = { 'User-Agent': 'Melonenclips', 'X-GitHub-Api-Version': '2022-11-28' };
async function ghRaw(ri, p) {
  const r = await fetch(`https://api.github.com/repos/${ri.owner}/${ri.repo}/contents/${p}?ref=${ri.branch}`, { headers: { ...GH_HEADERS, Accept: 'application/vnd.github.raw' }, cache: 'no-store' });
  if (!r.ok) throw new Error(r.status === 404 ? 'Noch keine Version online' : `GitHub antwortet mit ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
function loadToken() {
  const p = readJSON(PUB_FILE, {});
  if (!p.token) return '';
  try { return p.enc && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(p.token, 'base64')) : p.token; } catch (e) { return ''; }
}
function saveConfig({ repo, token }) {
  const p = readJSON(PUB_FILE, {});
  if (repo != null) p.repo = repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/+$/, '').replace(/\.git$/, '');
  if (token) {
    if (safeStorage.isEncryptionAvailable()) { p.token = safeStorage.encryptString(token.trim()).toString('base64'); p.enc = true; }
    else { p.token = token.trim(); p.enc = false; }
  }
  fs.mkdirSync(USER, { recursive: true });
  fs.writeFileSync(PUB_FILE, JSON.stringify(p, null, 2));
}
async function ghApi(ri, token, method, p, body) {
  const r = await fetch(`https://api.github.com/repos/${ri.owner}/${ri.repo}/contents/${p}${method === 'GET' ? `?ref=${ri.branch}` : ''}`, {
    method, headers: { ...GH_HEADERS, Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (method === 'GET' && r.status === 404) return null;
  if (!r.ok) {
    let msg = ''; try { msg = (await r.json()).message || ''; } catch (e) { /* */ }
    if (r.status === 401) throw new Error('Der GitHub-Token ist ungültig oder abgelaufen.');
    if (r.status === 403 || r.status === 404) throw new Error('Kein Zugriff aufs Repository – prüfe Name und Token-Rechte („Contents: Read and write“).');
    throw new Error(`GitHub-Fehler ${r.status}: ${msg}`);
  }
  return r.json();
}
async function ghPut(ri, token, p, buf, message) {
  const cur = await ghApi(ri, token, 'GET', p);
  await ghApi(ri, token, 'PUT', p, { message, branch: ri.branch, content: buf.toString('base64'), sha: cur ? cur.sha : undefined });
}

/* ---------- Fenster ---------- */
let launcher = null;
let editor = null;
function createLauncher() {
  launcher = new BrowserWindow({
    width: 960, height: 580, frame: false, resizable: false, show: false,
    backgroundColor: '#0d0e12', title: 'Melonenclips Launcher',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  launcher.loadFile(path.join(__dirname, '..', 'launcher', 'launcher.html'));
  launcher.once('ready-to-show', () => launcher.show());
  launcher.on('closed', () => { launcher = null; if (!editor) app.quit(); });
}
function createEditor() {
  if (editor) { editor.show(); editor.focus(); return; }
  editor = new BrowserWindow({
    width: 1600, height: 960, minWidth: 1100, minHeight: 700, show: false,
    backgroundColor: '#0d0e12', title: `Melonenclips ${localVer()}`, autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  const file = editorFile();
  log('Editor startet', localVer(), file === path.join(BUNDLED_DIR, 'index.html') ? '(mitgeliefert)' : '(Update)');
  editor.loadFile(file).catch((e) => { log('Editor-Datei defekt, nehme mitgelieferte Version', e); editor.loadFile(path.join(BUNDLED_DIR, 'index.html')); });
  editor.once('ready-to-show', () => { editor.maximize(); editor.show(); });
  editor.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) log(level === 3 ? 'FEHLER' : 'WARNUNG', message, sourceId ? `(${path.basename(sourceId)}:${line})` : '');
  });
  editor.webContents.on('render-process-gone', (_e, d) => log('ABSTURZ des Editors:', d.reason, d.exitCode));
  editor.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  editor.on('closed', () => { editor = null; if (!launcher) app.quit(); });
  if (launcher) launcher.close();
}
function setupPermissions() {
  const allowed = ['media', 'display-capture', 'fullscreen', 'clipboard-sanitized-write', 'clipboard-read'];
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.includes(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.includes(permission));
  if (session.defaultSession.setDisplayMediaRequestHandler) {
    session.defaultSession.setDisplayMediaRequestHandler((_req, callback) => {
      desktopCapturer.getSources({ types: ['screen', 'window'] })
        .then((sources) => callback(sources.length ? { video: sources[0], audio: 'loopback' } : {}))
        .catch((e) => { log('Bildschirmaufnahme', e); callback({}); });
    });
  }
}

/* ---------- Programm-Updates (.exe, selten) ---------- */
function sendUpd(data) { if (launcher && !launcher.isDestroyed()) launcher.webContents.send('upd', data); }
function sendPub(msg) { if (launcher && !launcher.isDestroyed()) launcher.webContents.send('pub', msg); }
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.logger = { info: (m) => log('UPDATE', m), warn: (m) => log('UPDATE-WARNUNG', m), error: (m) => log('UPDATE-FEHLER', m), debug: () => {} };
autoUpdater.on('update-available', (i) => sendUpd({ state: 'available', version: i.version }));
autoUpdater.on('update-not-available', () => sendUpd({ state: 'none' }));
autoUpdater.on('download-progress', (p) => sendUpd({ state: 'downloading', percent: p.percent, speed: p.bytesPerSecond, transferred: p.transferred, total: p.total }));
autoUpdater.on('update-downloaded', (i) => sendUpd({ state: 'downloaded', version: i.version }));
autoUpdater.on('error', (e) => sendUpd({ state: 'error', message: String(e && e.message || e) }));
ipcMain.handle('upd:check', async () => {
  if (!app.isPackaged) { sendUpd({ state: 'none' }); return; }
  try { await autoUpdater.checkForUpdates(); } catch (e) { sendUpd({ state: 'error', message: e.message }); }
});
ipcMain.handle('upd:download', async () => { try { await autoUpdater.downloadUpdate(); } catch (e) { sendUpd({ state: 'error', message: e.message }); } });
ipcMain.handle('upd:install', () => { setImmediate(() => autoUpdater.quitAndInstall(false, true)); });

/* ---------- Editor-Updates (schnell, ohne Neuinstallation) ---------- */
ipcMain.handle('content:check', async () => {
  const ri = repoInfo(); const local = localVer();
  if (!ri) return { state: 'norepo', local };
  try {
    const remote = JSON.parse((await ghRaw(ri, 'content/version.json')).toString('utf8'));
    return { state: cmpVer(remote.version, local) > 0 ? 'available' : 'none', remote: remote.version, local, notes: remote.notes || '', date: remote.date || '' };
  } catch (e) { log('Update-Prüfung', e.message); return { state: 'error', local, message: e.message }; }
});
ipcMain.handle('content:download', async () => {
  const ri = repoInfo(); if (!ri) throw new Error('Kein Update-Server eingestellt');
  const ver = JSON.parse((await ghRaw(ri, 'content/version.json')).toString('utf8'));
  const html = await ghRaw(ri, 'content/index.html');
  if (!/<!DOCTYPE html/i.test(html.slice(0, 200).toString('utf8'))) throw new Error('Die heruntergeladene Datei ist beschädigt.');
  fs.mkdirSync(CONTENT_DIR, { recursive: true });
  fs.writeFileSync(path.join(CONTENT_DIR, 'index.html.tmp'), html);
  fs.renameSync(path.join(CONTENT_DIR, 'index.html.tmp'), path.join(CONTENT_DIR, 'index.html'));
  fs.writeFileSync(path.join(CONTENT_DIR, 'version.json'), JSON.stringify(ver, null, 2));
  log('Update installiert', ver.version);
  return { version: ver.version };
});

/* ---------- Veröffentlichen (nur Entwickler) ---------- */
// Sichtbar nur im Entwicklermodus: Start mit --entwickler oder wenn auf diesem PC schon ein Token gespeichert ist.
const isDev = () => !app.isPackaged || process.argv.includes('--entwickler') || !!loadToken();
const devOnly = () => { if (!isDev()) throw new Error('Nicht verfügbar'); };
ipcMain.handle('pub:config', async () => {
  devOnly();
  const ri = repoInfo(); let online = null;
  if (ri) { try { online = JSON.parse((await ghRaw(ri, 'content/version.json')).toString('utf8')).version; } catch (e) { /* */ } }
  return { repo: ri ? `${ri.owner}/${ri.repo}` : '', hasToken: !!loadToken(), online, local: localVer() };
});
ipcMain.handle('pub:save', (_e, cfg) => { devOnly(); saveConfig(cfg); return true; });
ipcMain.handle('pub:pick', async (e) => {
  devOnly();
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: 'Neue Editor-Datei wählen', filters: [{ name: 'Melonenclips-Editor', extensions: ['html'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const f = r.filePaths[0]; return { path: f, name: path.basename(f), size: fs.statSync(f).size };
});
ipcMain.handle('pub:publish', async (_e, { file, version, notes, rebuild }) => {
  devOnly();
  const ri = repoInfo(); const token = loadToken();
  if (!ri) throw new Error('Bitte zuerst dein Repository eintragen.');
  if (!token) throw new Error('Bitte zuerst deinen GitHub-Token eintragen.');
  if (!/^\d+\.\d+\.\d+$/.test(version || '')) throw new Error('Die Version muss so aussehen: 1.0.3');
  const html = fs.readFileSync(file);
  if (!/<!DOCTYPE html/i.test(html.slice(0, 200).toString('utf8')) || !html.includes('Melonenclips')) throw new Error('Das ist keine Melonenclips-Editor-Datei.');
  sendPub('Prüfe Online-Version …');
  const cur = await ghApi(ri, token, 'GET', 'content/version.json');
  if (cur) {
    const online = JSON.parse(Buffer.from(cur.content || '', 'base64').toString('utf8') || '{}').version;
    if (online && cmpVer(version, online) <= 0) throw new Error(`Die neue Version muss höher sein als ${online}.`);
  }
  const verJson = Buffer.from(JSON.stringify({ version, notes: notes || '', date: new Date().toISOString().slice(0, 10) }, null, 2));
  sendPub('Lade Editor hoch …');
  await ghPut(ri, token, 'content/index.html', html, `Version ${version}`);
  sendPub('Veröffentliche Versionsnummer …');
  await ghPut(ri, token, 'content/version.json', verJson, `Version ${version}`);
  if (rebuild) {
    sendPub('Aktualisiere Programm-Dateien …');
    await ghPut(ri, token, 'app/index.html', html, `Programm ${version}`);
    await ghPut(ri, token, 'app/version.json', verJson, `Programm ${version}`);
    const pk = await ghApi(ri, token, 'GET', 'package.json');
    const pj = JSON.parse(Buffer.from(pk.content, 'base64').toString('utf8'));
    pj.version = version;
    await ghPut(ri, token, 'package.json', Buffer.from(JSON.stringify(pj, null, 2) + '\n'), `Programm ${version} bauen`);
    sendPub('Fertig! GitHub baut jetzt die neue .exe (ca. 5–10 Minuten).');
  } else {
    sendPub('Fertig! Deine Freunde sehen das Update beim nächsten Öffnen des Launchers.');
  }
  log('Veröffentlicht', version, rebuild ? '(mit Programm)' : '');
  return true;
});

/* ---------- Sonstiges ---------- */
ipcMain.handle('app:info', () => ({ version: localVer(), appVersion: app.getVersion(), packaged: app.isPackaged, dev: isDev() }));
ipcMain.handle('app:start', () => createEditor());
ipcMain.handle('app:quit', () => app.quit());
ipcMain.handle('app:open', (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });
ipcMain.handle('win:min', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.minimize(); });
ipcMain.handle('launcher:open', () => { if (!launcher) createLauncher(); else launcher.focus(); });
ipcMain.handle('log:copy', () => {
  let text = '';
  try { text = fs.readFileSync(LOG_FILE, 'utf8'); } catch (e) { /* noch kein Protokoll */ }
  const lines = text.trim().split('\n').filter(Boolean).slice(-150).join('\n');
  clipboard.writeText(`Melonenclips v${localVer()} (Programm ${app.getVersion()}) – Windows ${os.release()} – ${new Date().toLocaleString('de-DE')}\n` + '```\n' + (lines || '(keine Fehler protokolliert)') + '\n```');
  return lines.length;
});
ipcMain.handle('log:open', () => {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '');
  shell.showItemInFolder(LOG_FILE);
});
ipcMain.handle('file:save', async (e, { name, data }) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showSaveDialog(w, { defaultPath: path.join(app.getPath('videos'), name) });
  if (r.canceled || !r.filePath) return { status: 'declined' };
  fs.writeFileSync(r.filePath, Buffer.from(data));
  return { status: 'saved', path: r.filePath };
});

app.on('second-instance', () => { const w = editor || launcher; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
app.whenReady().then(() => { log('Start', `Programm ${app.getVersion()}, Editor ${localVer()}`); setupPermissions(); createLauncher(); });
app.on('window-all-closed', () => app.quit());
