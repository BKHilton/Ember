import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc';
import type {
  ActivityInput,
  AppSnapshot,
  AssignmentTemplate,
  Contact,
  ContactInput,
  ContactStatusUpdate,
  ContactTemperatureUpdate,
  FollowUpTask,
  LoginPayload,
  NotificationPayload,
  PlanUpdateInput,
  ReportDigest,
  SessionInfo,
  SignupPayload,
  SmtpSettingsInput,
  SyncImportResult,
  TaskInput,
  TaskStatusUpdateInput
} from '@shared/types';

const api = {
  getSnapshot: (): Promise<AppSnapshot> => ipcRenderer.invoke(IPC_CHANNELS.SNAPSHOT),
  getSession: (token?: string): Promise<SessionInfo | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION, token),
  login: (payload: LoginPayload): Promise<SessionInfo | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.LOGIN, payload),
  signup: (payload: SignupPayload): Promise<SessionInfo | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.SIGNUP, payload),
  logout: (token: string) => ipcRenderer.invoke(IPC_CHANNELS.LOGOUT, token),
  createContact: (payload: ContactInput): Promise<Contact> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONTACT_CREATE, payload),
  updateContactStatus: (payload: ContactStatusUpdate): Promise<Contact | undefined> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONTACT_STATUS, payload),
  reorderContactTemperature: (payload: ContactTemperatureUpdate) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONTACT_REORDER, payload),
  uploadContactPhoto: (contactId: string, churchId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONTACT_PHOTO, contactId, churchId),
  createTask: (payload: TaskInput): Promise<FollowUpTask> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_CREATE, payload),
  updateTaskStatus: (payload: TaskStatusUpdateInput): Promise<FollowUpTask | undefined> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_STATUS, payload),
  logActivity: (payload: ActivityInput) => ipcRenderer.invoke(IPC_CHANNELS.ACTIVITY_CREATE, payload),
  listTemplates: (churchId: string): Promise<AssignmentTemplate[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.TEMPLATE_LIST, churchId),
  createTemplate: (template: Omit<AssignmentTemplate, 'id'>) =>
    ipcRenderer.invoke(IPC_CHANNELS.TEMPLATE_CREATE, template),
  generateWeeklyReport: (churchId: string): Promise<{ digest: ReportDigest; path: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.REPORT_WEEKLY, churchId),
  generateMonthlyReport: (churchId: string): Promise<{ digest: ReportDigest; path: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.REPORT_MONTHLY, churchId),
  updatePlan: (payload: PlanUpdateInput) => ipcRenderer.invoke(IPC_CHANNELS.PLAN_UPDATE, payload),
  updateSmtpSettings: (payload: SmtpSettingsInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.SMTP_UPDATE, payload),
  exportData: (churchId: string): Promise<{ path: string } | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.SYNC_EXPORT, churchId),
  importData: (churchId: string): Promise<SyncImportResult | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.SYNC_IMPORT, churchId),
  onNotification: (callback: (payload: NotificationPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: NotificationPayload) => {
      callback(message);
    };
    ipcRenderer.on(IPC_CHANNELS.NOTIFICATIONS, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.NOTIFICATIONS, listener);
    };
  }
};

contextBridge.exposeInMainWorld('api', api);

console.log('Preload script loaded, window.api exposed');

declare global {
  interface Window {
    api: typeof api;
  }
}

