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
  SmtpSettingsInput,
  SyncImportResult,
  TaskInput,
  TaskStatusUpdateInput
} from '@shared/types';

declare global {
  interface Window {
    api: {
      getSnapshot(): Promise<AppSnapshot>;
      getSession(token?: string): Promise<SessionInfo | null>;
      login(payload: LoginPayload): Promise<SessionInfo | null>;
      logout(token: string): Promise<void>;
      createContact(payload: ContactInput): Promise<Contact>;
      updateContactStatus(payload: ContactStatusUpdate): Promise<Contact | undefined>;
      reorderContactTemperature(payload: ContactTemperatureUpdate): Promise<Contact | undefined>;
      uploadContactPhoto(contactId: string, churchId: string): Promise<Contact | null>;
      createTask(payload: TaskInput): Promise<FollowUpTask>;
      updateTaskStatus(payload: TaskStatusUpdateInput): Promise<FollowUpTask | undefined>;
      logActivity(payload: ActivityInput): Promise<void>;
      listTemplates(churchId: string): Promise<AssignmentTemplate[]>;
      createTemplate(template: Omit<AssignmentTemplate, 'id'>): Promise<AssignmentTemplate>;
      generateWeeklyReport(churchId: string): Promise<{ digest: ReportDigest; path: string }>;
      generateMonthlyReport(churchId: string): Promise<{ digest: ReportDigest; path: string }>;
      updatePlan(payload: PlanUpdateInput): Promise<void>;
      updateSmtpSettings(payload: SmtpSettingsInput): Promise<void>;
      exportData(churchId: string): Promise<{ path: string } | null>;
      importData(churchId: string): Promise<SyncImportResult | null>;
      onNotification(callback: (payload: NotificationPayload) => void): () => void;
    };
  }
}

export {};

