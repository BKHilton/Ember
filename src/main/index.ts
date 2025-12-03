import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { IPC_CHANNELS } from '@shared/ipc';
import { DataStore } from './dataStore';
import { registerIpcHandlers } from './ipc';
import { EmailService } from './services/emailService';
import { ReportScheduler } from './services/reportScheduler';

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;
let store: DataStore;
let emailService: EmailService;
let scheduler: ReportScheduler;

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1340,
    height: 820,
    minWidth: 1100,
    minHeight: 720,
    title: 'Church Follow-up Console',
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

const init = async () => {
  const userDataDir = app.getPath('userData');
  store = new DataStore(userDataDir);
  emailService = new EmailService(userDataDir);
  registerIpcHandlers(store, () => mainWindow, emailService);
  scheduler = new ReportScheduler(store, emailService, (payload) => {
    const target = mainWindow;
    if (!target) return;
    target.webContents.send(IPC_CHANNELS.NOTIFICATIONS, payload);
  });
  scheduler.start();
  await createWindow();
};

app.whenReady().then(init);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

