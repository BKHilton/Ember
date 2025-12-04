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
  // Preload script path - use absolute path
  // In dev mode, electron-vite outputs to dist/, in production use the same
  const preloadPath = join(__dirname, '../preload/index.js');
  
  if (isDev) {
    console.log('Dev mode - Preload path:', preloadPath);
    console.log('__dirname:', __dirname);
  }

  mainWindow = new BrowserWindow({
    width: 1340,
    height: 820,
    minWidth: 1100,
    minHeight: 720,
    title: 'Church Follow-up Console',
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    console.log('Loading renderer from URL:', process.env.ELECTRON_RENDERER_URL);
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    if (isDev) {
      // Open DevTools immediately to see any errors
      mainWindow.webContents.openDevTools();
    }
  } else {
    const rendererPath = join(__dirname, '../renderer/index.html');
    console.log('Loading renderer from file:', rendererPath);
    await mainWindow.loadFile(rendererPath);
  }

  // Log errors for debugging
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', validatedURL, errorCode, errorDescription);
  });

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

