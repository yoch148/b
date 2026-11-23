const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const dbFile = () => path.join(app.getPath('userData'), 'data.json');
const jsonFilter = [{ name: 'JSON', extensions: ['json'] }];

function createWindow() {
  const win = new BrowserWindow({
    width: 1100, height: 760, minWidth: 700, minHeight: 560,
    autoHideMenuBar: true, title: 'שעון נוכחות',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

ipcMain.handle('load', () => {
  try { return JSON.parse(fs.readFileSync(dbFile(), 'utf8')); } catch { return null; }
});
ipcMain.handle('save', (e, data) => {
  fs.mkdirSync(path.dirname(dbFile()), { recursive: true });
  fs.writeFileSync(dbFile(), JSON.stringify(data));
  return true;
});
ipcMain.handle('backup', async (e, data) => {
  const r = await dialog.showSaveDialog({ defaultPath: 'attendance-backup.json', filters: jsonFilter });
  if (r.canceled) return false;
  fs.writeFileSync(r.filePath, JSON.stringify(data, null, 1));
  return true;
});
ipcMain.handle('restore', async () => {
  const r = await dialog.showOpenDialog({ filters: jsonFilter, properties: ['openFile'] });
  if (r.canceled) return null;
  try { return JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')); } catch { return null; }
});
ipcMain.handle('xlsx', async (e, rows, name) => {
  const r = await dialog.showSaveDialog({ defaultPath: name + '.xlsx', filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
  if (r.canceled) return false;
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'דוח');
  XLSX.writeFile(wb, r.filePath);
  return true;
});
