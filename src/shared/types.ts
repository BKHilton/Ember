export type UserRole = 'director' | 'administrator' | 'connector' | 'teacher' | 'member';

export type ContactTemperature = 'cool' | 'warm' | 'hot' | 'convert' | 'new';

export type PreferredContactMethod = 'phone' | 'text' | 'email' | 'visit';

export type TaskCategory =
  | 'call'
  | 'visit'
  | 'text'
  | 'email'
  | 'gift'
  | 'meal'
  | 'coffee'
  | 'bible-study'
  | 'prayer'
  | 'other';

export type TaskRecurrence = 'one-time' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly';

export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'past-due' | 'rescheduled';

export type TaskOutcome = 'completed' | 'rescheduled';

export interface Address {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

export interface FamilyMember {
  name: string;
  relation: 'spouse' | 'child' | 'other';
  age?: number;
}

export interface AssignmentTemplate {
  id: string;
  churchId: string;
  label: string;
  description?: string;
  category: TaskCategory;
  defaultRecurrence: TaskRecurrence;
}

export interface FollowUpTask {
  id: string;
  churchId: string;
  contactId: string;
  assigneeId: string;
  category: TaskCategory;
  status: TaskStatus;
  dueDate: string;
  windowStart?: string;
  windowEnd?: string;
  notes?: string;
  recurrence: TaskRecurrence;
  templateId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  rescheduledFor?: string;
  outcomeNote?: string;
}

export interface ActivityLog {
  id: string;
  churchId: string;
  contactId: string;
  userId: string;
  type: 'note' | 'call' | 'visit' | 'task' | 'assignment-result';
  note: string;
  taskId?: string;
  createdAt: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  pricePerMonth: number;
  maxUsers: number;
  maxContacts: number;
  features: string[];
}

export interface DigestPreference {
  dayOfWeek: number; // 0-6 (Sunday-Saturday)
  time: string; // HH:mm
}

export interface Campus {
  id: string;
  churchId: string;
  name: string;
  address?: string;
  timezone: string;
  primary?: boolean;
}

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  fromName: string;
  fromEmail: string;
}

export interface Church {
  id: string;
  name: string;
  brandTagline?: string;
  planId: string;
  digestPreference: DigestPreference;
  emailAlerts: boolean;
  audibleAlerts: boolean;
  campuses: Campus[];
  primaryCampusId: string;
  smtp?: SmtpSettings;
}

export interface UserAccount {
  id: string;
  churchId: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  avatarColor: string;
  active: boolean;
}

export interface UserCredential {
  userId: string;
  passwordHash: string;
}

export interface Contact {
  id: string;
  churchId: string;
  campusId: string;
  displayName: string;
  temperature: ContactTemperature;
  email?: string;
  phone?: string;
  address?: Address;
  ageRange?: string;
  birthday?: string;
  anniversary?: string;
  spouseName?: string;
  maritalStatus?: 'single' | 'married' | 'divorced' | 'widowed';
  children?: FamilyMember[];
  tags: string[];
  preferredContactMethod: PreferredContactMethod;
  ownerId?: string;
  backgroundNotes?: string;
  photoPath?: string;
  firstVisitDate?: string;
  lastVisitDate?: string;
  createdAt: string;
  updatedAt: string;
  lastActivityAt?: string;
}

export interface AppDatabase {
  version: number;
  lastUpdated: string;
  churches: Church[];
  campuses: Campus[];
  users: UserAccount[];
  credentials: UserCredential[];
  contacts: Contact[];
  tasks: FollowUpTask[];
  activities: ActivityLog[];
  plans: SubscriptionPlan[];
  templates: AssignmentTemplate[];
}

export type AppSnapshot = Omit<AppDatabase, 'credentials'>;

export interface ContactInput {
  churchId: string;
  campusId: string;
  displayName: string;
  temperature?: ContactTemperature;
  email?: string;
  phone?: string;
  address?: Address;
  ageRange?: string;
  birthday?: string;
  anniversary?: string;
  spouseName?: string;
  maritalStatus?: Contact['maritalStatus'];
  children?: FamilyMember[];
  ownerId?: string;
  preferredContactMethod?: PreferredContactMethod;
  tags?: string[];
  backgroundNotes?: string;
}

export interface ContactStatusUpdate {
  contactId: string;
  churchId: string;
  temperature: ContactTemperature;
  ownerId?: string;
  note?: string;
  userId: string;
}

export interface ContactTemperatureUpdate {
  contactId: string;
  churchId: string;
  temperature: ContactTemperature;
  userId: string;
}

export interface TaskInput {
  churchId: string;
  contactId: string;
  assigneeId: string;
  category: TaskCategory;
  dueDate: string;
  windowStart?: string;
  windowEnd?: string;
  notes?: string;
  recurrence?: TaskRecurrence;
  templateId?: string;
}

export interface TaskStatusUpdateInput {
  taskId: string;
  status: TaskStatus;
  userId: string;
  note?: string;
  rescheduledFor?: string;
  outcome?: TaskOutcome;
}

export interface ActivityInput {
  churchId: string;
  contactId: string;
  userId: string;
  type: ActivityLog['type'];
  note: string;
  taskId?: string;
}

export interface NotificationPayload {
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'success';
  kind?: 'assignment' | 'digest' | 'system';
  taskId?: string;
  contactId?: string;
  timestamp: string;
}

export interface DashboardSummary {
  totalContacts: number;
  newContacts: number;
  openTasks: number;
  pastDueTasks: number;
  volunteers: number;
  coveragePercent: number;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface SessionInfo {
  token: string;
  user: UserAccount;
  church: Church;
}

export interface ReportDigest {
  periodStart: string;
  periodEnd: string;
  label: string;
  totalActivities: number;
  completedAssignments: number;
  rescheduledAssignments: number;
  newContacts: number;
  converts: number;
  pastDueTasks: number;
}

export interface PlanUpdateInput {
  churchId: string;
  planId: string;
}

export interface SmtpSettingsInput extends Partial<SmtpSettings> {
  churchId: string;
}

export interface SyncExportResult {
  path: string;
}

export interface SyncImportResult {
  importedContacts: number;
  importedTasks: number;
  path: string;
}

