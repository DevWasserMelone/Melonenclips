'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('melonenNative', {
  isNative: true,
  info: () => ipcRenderer.invoke('app:info'),
  // Programm-Updates (.exe)
  check: () => ipcRenderer.invoke('upd:check'),
  download: () => ipcRenderer.invoke('upd:download'),
  install: () => ipcRenderer.invoke('upd:install'),
  onUpdate: (cb) => ipcRenderer.on('upd', (_e, d) => cb(d)),
  // Editor-Updates
  contentCheck: () => ipcRenderer.invoke('content:check'),
  contentDownload: () => ipcRenderer.invoke('content:download'),
  // Veröffentlichen
  pubConfig: () => ipcRenderer.invoke('pub:config'),
  pubSave: (cfg) => ipcRenderer.invoke('pub:save', cfg),
  pubPick: () => ipcRenderer.invoke('pub:pick'),
  publish: (opts) => ipcRenderer.invoke('pub:publish', opts),
  onPub: (cb) => ipcRenderer.on('pub', (_e, m) => cb(m)),
  // Sonstiges
  start: () => ipcRenderer.invoke('app:start'),
  quit: () => ipcRenderer.invoke('app:quit'),
  openUrl: (u) => ipcRenderer.invoke('app:open', u),
  minimize: () => ipcRenderer.invoke('win:min'),
  openLauncher: () => ipcRenderer.invoke('launcher:open'),
  copyLog: () => ipcRenderer.invoke('log:copy'),
  openLog: () => ipcRenderer.invoke('log:open'),
  saveFile: (name, data) => ipcRenderer.invoke('file:save', { name, data }),
  // Dateipfad einer importierten Datei (für FFmpeg)
  pathOf: (file) => { try { return webUtils.getPathForFile(file) || ''; } catch (e) { return ''; } },
  // FFmpeg
  ff: {
    available: () => ipcRenderer.invoke('ff:available'),
    run: (args, job) => ipcRenderer.invoke('ff:run', { args, job }),
    cancel: (job) => ipcRenderer.invoke('ff:cancel', job),
    onOut: (cb) => ipcRenderer.on('ff', (_e, d) => cb(d)),
    tmpPath: (name) => ipcRenderer.invoke('ff:tmpPath', name),
    tmpOpen: (name) => ipcRenderer.invoke('ff:tmpOpen', name),
    tmpWrite: (id, chunk) => ipcRenderer.invoke('ff:tmpWrite', id, chunk),
    tmpClose: (id) => ipcRenderer.invoke('ff:tmpClose', id),
    read: (p) => ipcRenderer.invoke('ff:read', p),
    remove: (p) => ipcRenderer.invoke('ff:remove', p),
    saveCopy: (from, name) => ipcRenderer.invoke('ff:copy', { from, name })
  }
});
