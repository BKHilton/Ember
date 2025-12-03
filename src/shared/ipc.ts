export const IPC_CHANNELS = {
  SNAPSHOT: 'app:get-snapshot',
  SESSION: 'auth:get-session',
  LOGIN: 'auth:login',
  LOGOUT: 'auth:logout',
  CONTACT_CREATE: 'contacts:create',
  CONTACT_STATUS: 'contacts:update-status',
  CONTACT_REORDER: 'contacts:reorder-temperature',
  CONTACT_PHOTO: 'contacts:upload-photo',
  TASK_CREATE: 'tasks:create',
  TASK_STATUS: 'tasks:update-status',
  ACTIVITY_CREATE: 'activities:create',
  TEMPLATE_CREATE: 'templates:create',
  TEMPLATE_LIST: 'templates:list',
  REPORT_WEEKLY: 'reports:weekly',
  REPORT_MONTHLY: 'reports:monthly',
  PLAN_UPDATE: 'plans:update',
  SMTP_UPDATE: 'smtp:update',
  SYNC_EXPORT: 'sync:export',
  SYNC_IMPORT: 'sync:import',
  NOTIFICATIONS: 'notifications:push'
} as const;

export type RendererInvokeChannel =
  | typeof IPC_CHANNELS.SNAPSHOT
  | typeof IPC_CHANNELS.SESSION
  | typeof IPC_CHANNELS.LOGIN
  | typeof IPC_CHANNELS.LOGOUT
  | typeof IPC_CHANNELS.CONTACT_CREATE
  | typeof IPC_CHANNELS.CONTACT_STATUS
  | typeof IPC_CHANNELS.CONTACT_REORDER
  | typeof IPC_CHANNELS.CONTACT_PHOTO
  | typeof IPC_CHANNELS.TASK_CREATE
  | typeof IPC_CHANNELS.TASK_STATUS
  | typeof IPC_CHANNELS.ACTIVITY_CREATE
  | typeof IPC_CHANNELS.TEMPLATE_CREATE
  | typeof IPC_CHANNELS.TEMPLATE_LIST
  | typeof IPC_CHANNELS.REPORT_WEEKLY
  | typeof IPC_CHANNELS.REPORT_MONTHLY
  | typeof IPC_CHANNELS.PLAN_UPDATE
  | typeof IPC_CHANNELS.SMTP_UPDATE
  | typeof IPC_CHANNELS.SYNC_EXPORT
  | typeof IPC_CHANNELS.SYNC_IMPORT;

