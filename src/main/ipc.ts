import { ipcMain, BrowserWindow, dialog } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import type {
  ActivityInput,
  AppSnapshot,
  AssignmentTemplate,
  ContactInput,
  ContactStatusUpdate,
  ContactTemperatureUpdate,
  FollowUpTask,
  LoginPayload,
  NotificationPayload,
  PlanUpdateInput,
  SmtpSettingsInput,
  SessionInfo,
  SyncImportResult,
  TaskInput,
  TaskStatusUpdateInput
} from '@shared/types';
import { IPC_CHANNELS } from '@shared/ipc';
import { DataStore } from './dataStore';
import { EmailService } from './services/emailService';

const notifyRenderer = (getWindow: () => BrowserWindow | null, payload: NotificationPayload) => {
  const target = getWindow();
  if (!target) return;
  target.webContents.send(IPC_CHANNELS.NOTIFICATIONS, payload);
};

export const registerIpcHandlers = (
  store: DataStore,
  getWindow: () => BrowserWindow | null,
  emailService: EmailService
) => {
  ipcMain.handle(IPC_CHANNELS.SNAPSHOT, (): AppSnapshot => store.getSnapshot());

  ipcMain.handle(IPC_CHANNELS.SESSION, (_event, token?: string): SessionInfo | null =>
    store.getSession(token)
  );

  ipcMain.handle(IPC_CHANNELS.LOGIN, (_event, payload: LoginPayload): SessionInfo | null =>
    store.authenticate(payload)
  );

  ipcMain.handle(IPC_CHANNELS.LOGOUT, (_event, token: string) => store.logout(token));

  ipcMain.handle(
    IPC_CHANNELS.CONTACT_CREATE,
    (_event, payload: ContactInput) => store.createContact(payload)
  );

  ipcMain.handle(
    IPC_CHANNELS.CONTACT_STATUS,
    (_event, payload: ContactStatusUpdate) => store.updateContactStatus(payload)
  );

  ipcMain.handle(
    IPC_CHANNELS.CONTACT_REORDER,
    (_event, payload: ContactTemperatureUpdate) => store.reorderContactTemperature(
      payload.contactId,
      payload.churchId,
      payload.temperature,
      payload.userId
    )
  );

  ipcMain.handle(
    IPC_CHANNELS.CONTACT_PHOTO,
    async (_event, contactId: string, churchId: string) => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }]
      });
      if (result.canceled || !result.filePaths[0]) return null;
      return store.updateContactPhoto(contactId, churchId, result.filePaths[0]);
    }
  );

  ipcMain.handle(IPC_CHANNELS.TASK_CREATE, (_event, payload: TaskInput): FollowUpTask =>
    store.createTask(payload)
  );

  ipcMain.handle(
    IPC_CHANNELS.TASK_STATUS,
    async (_event, payload: TaskStatusUpdateInput) => {
      const task = store.updateTaskStatus(payload);
      if (task) {
        const snapshot = store.getSnapshot();
        const contact = snapshot.contacts.find((entry) => entry.id === task.contactId);
        const church = snapshot.churches.find((entry) => entry.id === task.churchId);
        const director = snapshot.users.find(
          (user) => user.churchId === task.churchId && user.role === 'director'
        );
        if (church?.audibleAlerts) {
          notifyRenderer(getWindow, {
            title: task.status === 'completed' ? 'Assignment completed' : 'Assignment updated',
            message: contact
              ? `${contact.displayName} assignment ${task.status}`
              : 'Assignment updated',
            severity: task.status === 'completed' ? 'success' : 'warning',
            kind: 'assignment',
            contactId: contact?.id,
            taskId: task.id,
            timestamp: new Date().toISOString()
          });
        }
        if (director && church?.emailAlerts) {
          const summary =
            task.status === 'completed'
              ? `Assignment for ${contact?.displayName ?? 'contact'} was completed.`
              : `Assignment for ${contact?.displayName ?? 'contact'} was rescheduled.`;
          await emailService.sendAssignmentNotification(
            director.email,
            `${church?.name} assignment update`,
            summary,
            church?.smtp
          );
        }
      }
      return task;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ACTIVITY_CREATE,
    (_event, payload: ActivityInput) => store.recordActivity(payload)
  );

  ipcMain.handle(
    IPC_CHANNELS.TEMPLATE_CREATE,
    (_event, template: Omit<AssignmentTemplate, 'id'>) => store.createTemplate(template)
  );

  ipcMain.handle(IPC_CHANNELS.TEMPLATE_LIST, (_event, churchId: string) =>
    store.getTemplates(churchId)
  );

  ipcMain.handle(IPC_CHANNELS.REPORT_WEEKLY, (_event, churchId: string) => {
    const digest = store.generateWeeklyDigest(churchId);
    const path = store.writeReportToDisk(churchId, digest);
    return { digest, path };
  });
  ipcMain.handle(IPC_CHANNELS.REPORT_MONTHLY, (_event, churchId: string) => {
    const digest = store.generateMonthlyDigest(churchId);
    const path = store.writeReportToDisk(churchId, digest);
    return { digest, path };
  });

  ipcMain.handle(IPC_CHANNELS.PLAN_UPDATE, (_event, payload: PlanUpdateInput) =>
    store.updatePlan(payload)
  );

  ipcMain.handle(IPC_CHANNELS.SMTP_UPDATE, (_event, payload: SmtpSettingsInput) =>
    store.updateSmtpSettings(payload)
  );

  ipcMain.handle(IPC_CHANNELS.SYNC_EXPORT, async (_event, churchId: string) => {
    const bundle = store.createSyncBundle(churchId);
    if (!bundle) return null;
    const saveDialog = await dialog.showSaveDialog({
      title: 'Export Ember data',
      defaultPath: `ember-sync-${churchId}-${Date.now()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (saveDialog.canceled || !saveDialog.filePath) return null;
    writeFileSync(saveDialog.filePath, JSON.stringify(bundle, null, 2), 'utf-8');
    return { path: saveDialog.filePath };
  });

  ipcMain.handle(IPC_CHANNELS.SYNC_IMPORT, async (_event, churchId: string): Promise<SyncImportResult | null> => {
    const openDialog = await dialog.showOpenDialog({
      title: 'Import Ember data',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (openDialog.canceled || !openDialog.filePaths[0]) return null;
    const raw = readFileSync(openDialog.filePaths[0], 'utf-8');
    const bundle = JSON.parse(raw);
    return store.importSyncBundle(churchId, bundle, openDialog.filePaths[0]);
  });

  setInterval(async () => {
    const pastDueTasks = store.setPastDueStatuses();
    if (pastDueTasks.length > 0) {
      const snapshot = store.getSnapshot();
      const grouped = pastDueTasks.reduce<Record<string, FollowUpTask[]>>((acc, task) => {
        acc[task.churchId] = acc[task.churchId] ?? [];
        acc[task.churchId].push(task);
        return acc;
      }, {});
      for (const [churchId, tasks] of Object.entries(grouped)) {
        const church = snapshot.churches.find((entry) => entry.id === churchId);
        const director = snapshot.users.find(
          (user) => user.churchId === churchId && user.role === 'director'
        );
        const contactNames = tasks
          .map((task) => {
            const contact = snapshot.contacts.find((entry) => entry.id === task.contactId);
            return contact?.displayName ?? 'Unknown contact';
          })
          .join(', ');
        notifyRenderer(getWindow, {
          title: 'Past Due Alert',
          message: `${tasks.length} follow-up task(s) past due: ${contactNames}`,
          severity: 'warning',
          kind: 'assignment',
          timestamp: new Date().toISOString()
        });
        if (director && church?.emailAlerts) {
          await emailService.sendAssignmentNotification(
            director.email,
            `${church?.name} past due assignments`,
            `${tasks.length} assignments are past due: ${contactNames}`,
            church?.smtp
          );
        }
      }
    }
  }, 1000 * 60 * 5);
};