import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { compareSync, hashSync } from 'bcryptjs';
import dayjs from 'dayjs';
import type {
  ActivityInput,
  ActivityLog,
  AppDatabase,
  AppSnapshot,
  AssignmentTemplate,
  Campus,
  Church,
  Contact,
  ContactInput,
  ContactStatusUpdate,
  ContactTemperature,
  FollowUpTask,
  LoginPayload,
  PlanUpdateInput,
  ReportDigest,
  SessionInfo,
  SignupPayload,
  SmtpSettings,
  SmtpSettingsInput,
  SubscriptionPlan,
  SyncImportResult,
  TaskInput,
  TaskStatus,
  TaskStatusUpdateInput,
  UserAccount,
  UserCredential,
  UserRole
} from '@shared/types';

type SyncBundle = {
  church: Omit<ReturnType<DataStore['getSnapshot']>['churches'][number], 'smtp'>;
  campuses: Campus[];
  contacts: Contact[];
  tasks: FollowUpTask[];
  activities: ActivityLog[];
  templates: AssignmentTemplate[];
  generatedAt: string;
};

const DB_VERSION = 3;
const nowIso = () => new Date().toISOString();

export class DataStore {
  private readonly filePath: string;
  private readonly uploadsPath: string;
  private readonly reportsPath: string;
  private readonly syncPath: string;
  private data: AppDatabase;
  private readonly sessions = new Map<string, string>(); // token → userId

  constructor(userDataPath: string, filename = 'ember-db.json') {
    this.filePath = join(userDataPath, filename);
    this.uploadsPath = join(userDataPath, 'uploads');
    this.reportsPath = join(userDataPath, 'reports');
    this.syncPath = join(userDataPath, 'sync');
    this.ensureFile();
    this.data = this.read();
    this.hydrate();
  }

  public getSnapshot(): AppSnapshot {
    const { credentials, ...rest } = this.data;
    return {
      ...rest,
      churches: rest.churches.map((church) => ({
        ...church,
        campuses: this.data.campuses.filter((campus) => campus.churchId === church.id)
      }))
    };
  }

  public authenticate(payload: LoginPayload): SessionInfo | null {
    const user = this.data.users.find((account) => account.email === payload.email);
    if (!user) return null;
    const credential = this.data.credentials.find((cred) => cred.userId === user.id);
    if (!credential) return null;
    const valid = compareSync(payload.password, credential.passwordHash);
    if (!valid) return null;
    const token = randomUUID();
    this.sessions.set(token, user.id);
    const church = this.data.churches.find((c) => c.id === user.churchId)!;
    return { token, user, church };
  }

  public getSession(token: string | undefined): SessionInfo | null {
    if (!token) return null;
    const userId = this.sessions.get(token);
    if (!userId) return null;
    const user = this.data.users.find((account) => account.id === userId);
    if (!user) return null;
    const church = this.data.churches.find((c) => c.id === user.churchId)!;
    return { token, user, church };
  }

  public logout(token: string) {
    this.sessions.delete(token);
  }

  public signup(payload: SignupPayload): SessionInfo | null {
    // Check if email already exists
    const existingUser = this.data.users.find((user) => user.email === payload.email);
    if (existingUser) {
      return null; // Email already registered
    }

    // Ensure plans exist (seed if needed)
    if (this.data.plans.length === 0) {
      this.data.plans = seedPlans();
    }

    const timestamp = nowIso();
    const churchId = randomUUID();
    const userId = randomUUID();
    const campusId = randomUUID();
    const plans = this.data.plans;

    // Create default campus
    const campus: Campus = {
      id: campusId,
      churchId,
      name: 'Main Campus',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      primary: true
    };

    // Create church
    const church: Church = {
      id: churchId,
      name: payload.churchName.trim(),
      brandTagline: 'Never let an ember go cold.',
      planId: plans[0]?.id ?? plans[1]?.id ?? 'plan-lite', // Use first available plan
      digestPreference: { dayOfWeek: 1, time: '08:00' },
      emailAlerts: false,
      audibleAlerts: true,
      campuses: [campus],
      primaryCampusId: campusId
    };

    // Create user (director role for signup)
    const avatarColors = ['#2563eb', '#22c55e', '#f97316', '#8b5cf6', '#ec4899', '#14b8a6'];
    const avatarColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];

    const user: UserAccount = {
      id: userId,
      churchId,
      name: payload.name.trim(),
      email: payload.email.trim(),
      phone: payload.phone?.trim(),
      role: 'director' as UserRole,
      avatarColor,
      active: true
    };

    // Create credential
    const credential: UserCredential = {
      userId,
      passwordHash: hashSync(payload.password, 10)
    };

    // Add to data
    this.data.churches.push(church);
    this.data.campuses.push(campus);
    this.data.users.push(user);
    this.data.credentials.push(credential);

    // Persist changes
    this.persist();

    // Create session
    const token = randomUUID();
    this.sessions.set(token, userId);

    return { token, user, church };
  }

  public createContact(payload: ContactInput): Contact {
    const campusId = payload.campusId ?? this.getPrimaryCampusId(payload.churchId);
    if (!campusId) {
      throw new Error('No campus configured for this church.');
    }
    const timestamp = nowIso();
    const contact: Contact = {
      id: randomUUID(),
      churchId: payload.churchId,
      campusId,
      displayName: payload.displayName.trim(),
      email: payload.email?.trim(),
      phone: payload.phone?.trim(),
      temperature: payload.temperature ?? 'new',
      ownerId: payload.ownerId,
      preferredContactMethod: payload.preferredContactMethod ?? 'phone',
      backgroundNotes: payload.backgroundNotes,
      tags: payload.tags ?? [],
      address: payload.address,
      ageRange: payload.ageRange,
      anniversary: payload.anniversary,
      birthday: payload.birthday,
      spouseName: payload.spouseName,
      maritalStatus: payload.maritalStatus,
      children: payload.children,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastActivityAt: timestamp
    };

    this.data.contacts.push(contact);
    this.recordActivity({
      type: 'note',
      note: `Contact created: ${contact.displayName}`,
      churchId: contact.churchId,
      contactId: contact.id,
      userId: payload.ownerId ?? this.getDefaultUserId(contact.churchId)
    });
    this.persist();
    return contact;
  }

  public updateContactStatus(update: ContactStatusUpdate): Contact | undefined {
    const contact = this.findContact(update.contactId, update.churchId);
    if (!contact) return undefined;
    contact.temperature = update.temperature;
    contact.ownerId = update.ownerId ?? contact.ownerId;
    contact.updatedAt = nowIso();
    contact.lastActivityAt = contact.updatedAt;
    this.recordActivity({
      type: 'note',
      note: update.note ?? `Temperature set to ${update.temperature}`,
      churchId: update.churchId,
      contactId: update.contactId,
      userId: update.userId
    });
    this.persist();
    return contact;
  }

  public updateContactPhoto(contactId: string, churchId: string, sourcePath: string) {
    const contact = this.findContact(contactId, churchId);
    if (!contact || !sourcePath) return contact;
    const extension = sourcePath.split('.').pop();
    const filename = `${contactId}.${extension}`;
    if (!existsSync(this.uploadsPath)) mkdirSync(this.uploadsPath, { recursive: true });
    const destination = join(this.uploadsPath, filename);
    copyFileSync(sourcePath, destination);
    contact.photoPath = destination;
    contact.updatedAt = nowIso();
    this.persist();
    return contact;
  }

  public reorderContactTemperature(contactId: string, churchId: string, destination: ContactTemperature, userId: string) {
    return this.updateContactStatus({ contactId, churchId, temperature: destination, userId });
  }

  public createTask(payload: TaskInput): FollowUpTask {
    const timestamp = nowIso();
    const task: FollowUpTask = {
      id: randomUUID(),
      churchId: payload.churchId,
      contactId: payload.contactId,
      assigneeId: payload.assigneeId,
      category: payload.category,
      status: 'pending',
      dueDate: payload.dueDate,
      windowStart: payload.windowStart,
      windowEnd: payload.windowEnd,
      notes: payload.notes,
      recurrence: payload.recurrence ?? 'one-time',
      templateId: payload.templateId,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.data.tasks.push(task);
    this.recordActivity({
      type: 'task',
      note: `Assignment scheduled (${payload.category}) for ${this.getUserName(payload.assigneeId)}`,
      churchId: payload.churchId,
      contactId: payload.contactId,
      userId: payload.assigneeId,
      taskId: task.id
    });
    this.persist();
    return task;
  }

  public updateTaskStatus(update: TaskStatusUpdateInput): FollowUpTask | undefined {
    const task = this.data.tasks.find((t) => t.id === update.taskId);
    if (!task) return undefined;
    task.status = normalizeTaskStatus(update.status, task.dueDate);
    task.updatedAt = nowIso();
    if (update.status === 'completed') {
      task.completedAt = task.updatedAt;
      task.outcomeNote = update.note;
    }
    if (update.status === 'rescheduled') {
      task.rescheduledFor = update.rescheduledFor;
      task.outcomeNote = update.note;
    }
    this.recordActivity({
      type: 'assignment-result',
      note: update.note ?? `Updated task status to ${task.status}`,
      churchId: task.churchId,
      contactId: task.contactId,
      userId: update.userId,
      taskId: task.id
    });
    this.persist();
    return task;
  }

  public createTemplate(template: Omit<AssignmentTemplate, 'id'>) {
    const entry: AssignmentTemplate = { ...template, id: randomUUID() };
    this.data.templates.push(entry);
    this.persist();
    return entry;
  }

  public getTemplates(churchId: string) {
    return this.data.templates.filter((template) => template.churchId === churchId);
  }

  public updatePlan(payload: PlanUpdateInput) {
    const church = this.data.churches.find((c) => c.id === payload.churchId);
    if (!church) return null;
    church.planId = payload.planId;
    this.persist();
    return church;
  }

  public updateSmtpSettings(payload: SmtpSettingsInput): SmtpSettings | undefined {
    const church = this.data.churches.find((c) => c.id === payload.churchId);
    if (!church) return undefined;
    if (!payload.host) {
      church.smtp = undefined;
    } else {
      const existing = church.smtp ?? ({
        host: '',
        port: 587,
        secure: false,
        fromEmail: 'alerts@ember.local',
        fromName: 'Ember Alerts'
      } as SmtpSettings);
      church.smtp = {
        host: payload.host ?? existing.host,
        port: typeof payload.port === 'number' ? payload.port : existing.port,
        secure: typeof payload.secure === 'boolean' ? payload.secure : existing.secure,
        user: payload.user ?? existing.user,
        password: payload.password === undefined ? existing.password : payload.password || undefined,
        fromName: payload.fromName ?? existing.fromName,
        fromEmail: payload.fromEmail ?? existing.fromEmail
      };
    }
    this.persist();
    return church.smtp;
  }

  public recordActivity(activity: ActivityInput): ActivityLog {
    const logEntry: ActivityLog = { id: randomUUID(), ...activity, createdAt: nowIso() };
    const contact = this.findContact(activity.contactId, activity.churchId);
    if (contact) {
      contact.lastActivityAt = logEntry.createdAt;
      contact.updatedAt = logEntry.createdAt;
    }
    this.data.activities.unshift(logEntry);
    this.data.lastUpdated = logEntry.createdAt;
    return logEntry;
  }

  public setPastDueStatuses(): FollowUpTask[] {
    const now = Date.now();
    const changed: FollowUpTask[] = [];
    this.data.tasks.forEach((task) => {
      if (task.status === 'completed') return;
      if (new Date(task.dueDate).getTime() < now && task.status !== 'past-due') {
        task.status = 'past-due';
        changed.push(task);
      }
    });
    if (changed.length > 0) this.persist();
    return changed;
  }

  public generateWeeklyDigest(churchId: string): ReportDigest {
    const now = dayjs();
    return this.composeDigest(churchId, now.startOf('week'), now.endOf('week'), 'Weekly');
  }

  public generateMonthlyDigest(churchId: string): ReportDigest {
    const now = dayjs();
    return this.composeDigest(churchId, now.startOf('month'), now.endOf('month'), 'Monthly');
  }

  public writeReportToDisk(churchId: string, digest: ReportDigest) {
    if (!existsSync(this.reportsPath)) mkdirSync(this.reportsPath, { recursive: true });
    const slug = digest.label.toLowerCase();
    const file = join(this.reportsPath, `${slug}-digest-${churchId}-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify(digest, null, 2), 'utf-8');
    return file;
  }

  public createSyncBundle(churchId: string): SyncBundle | null {
    const church = this.data.churches.find((c) => c.id === churchId);
    if (!church) return null;
    const campuses = this.data.campuses.filter((campus) => campus.churchId === churchId);
    return {
      church: { ...church, campuses },
      campuses,
      contacts: this.data.contacts.filter((contact) => contact.churchId === churchId),
      tasks: this.data.tasks.filter((task) => task.churchId === churchId),
      activities: this.data.activities.filter((activity) => activity.churchId === churchId),
      templates: this.data.templates.filter((template) => template.churchId === churchId),
      generatedAt: nowIso()
    };
  }

  public importSyncBundle(churchId: string, bundle: SyncBundle, path: string): SyncImportResult {
    const church = this.data.churches.find((c) => c.id === churchId);
    if (!church) throw new Error('Church not found.');
    bundle.campuses.forEach((campus) => {
      if (!this.data.campuses.some((existing) => existing.id === campus.id)) {
        this.data.campuses.push(campus);
      }
    });
    let importedContacts = 0;
    bundle.contacts.forEach((contact) => {
      if (this.data.contacts.some((existing) => existing.id === contact.id)) return;
      this.data.contacts.push(contact);
      importedContacts += 1;
    });
    let importedTasks = 0;
    bundle.tasks.forEach((task) => {
      if (this.data.tasks.some((existing) => existing.id === task.id)) return;
      this.data.tasks.push(task);
      importedTasks += 1;
    });
    bundle.templates.forEach((template) => {
      if (this.data.templates.some((existing) => existing.id === template.id)) return;
      this.data.templates.push(template);
    });
    this.persist();
    return { importedContacts, importedTasks, path };
  }

  private composeDigest(churchId: string, start: dayjs.Dayjs, end: dayjs.Dayjs, label: string): ReportDigest {
    const activities = this.data.activities.filter(
      (activity) => activity.churchId === churchId && dayjs(activity.createdAt).isAfter(start) && dayjs(activity.createdAt).isBefore(end)
    );
    const completedAssignments = this.data.tasks.filter(
      (task) =>
        task.churchId === churchId &&
        task.status === 'completed' &&
        task.completedAt &&
        dayjs(task.completedAt).isAfter(start) &&
        dayjs(task.completedAt).isBefore(end)
    );
    const rescheduledAssignments = this.data.tasks.filter(
      (task) =>
        task.churchId === churchId &&
        task.status === 'rescheduled' &&
        task.rescheduledFor &&
        dayjs(task.updatedAt).isAfter(start) &&
        dayjs(task.updatedAt).isBefore(end)
    );
    const pastDueTasks = this.data.tasks.filter((task) => task.churchId === churchId && task.status === 'past-due').length;
    const newContacts = this.data.contacts.filter(
      (contact) => contact.churchId === churchId && dayjs(contact.createdAt).isAfter(start) && dayjs(contact.createdAt).isBefore(end)
    ).length;
    const converts = this.data.contacts.filter((contact) => contact.churchId === churchId && contact.temperature === 'convert').length;
    return {
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      label,
      totalActivities: activities.length,
      completedAssignments: completedAssignments.length,
      rescheduledAssignments: rescheduledAssignments.length,
      newContacts,
      converts,
      pastDueTasks
    };
  }

  private findContact(contactId: string, churchId: string) {
    return this.data.contacts.find((target) => target.id === contactId && target.churchId === churchId);
  }

  private read(): AppDatabase {
    const raw = readFileSync(this.filePath, 'utf-8');
    return JSON.parse(raw) as AppDatabase;
  }

  private persist() {
    this.data.lastUpdated = nowIso();
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  private ensureFile() {
    if (existsSync(this.filePath)) return;
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const seed = seedData();
    writeFileSync(this.filePath, JSON.stringify(seed, null, 2));
  }

  private hydrate() {
    let mutated = false;
    if (!this.data.campuses) {
      this.data.campuses = [];
      mutated = true;
    }
    this.data.churches = this.data.churches.map((church) => {
      let campuses = this.data.campuses.filter((campus) => campus.churchId === church.id);
      if (campuses.length === 0) {
        const fallback: Campus = {
          id: randomUUID(),
          churchId: church.id,
          name: church.name,
          address: church.address,
          timezone: (church as any).timezone ?? 'America/Chicago',
          primary: true
        };
        this.data.campuses.push(fallback);
        campuses = [fallback];
        mutated = true;
      }
      const primaryCampusId = church.primaryCampusId ?? campuses.find((campus) => campus.primary)?.id ?? campuses[0].id;
      return {
        ...church,
        brandTagline: church.brandTagline ?? 'Never let an ember go cold.',
        campuses,
        primaryCampusId
      };
    });
    this.data.contacts = this.data.contacts.map((contact) => {
      if (contact.campusId && this.data.campuses.some((campus) => campus.id === contact.campusId)) {
        return contact;
      }
      const fallbackCampus =
        this.getPrimaryCampusId(contact.churchId) ??
        this.data.campuses.find((campus) => campus.churchId === contact.churchId)?.id;
      if (!fallbackCampus) return contact;
      mutated = true;
      return { ...contact, campusId: fallbackCampus };
    });
    this.data.version = DB_VERSION;
    if (mutated) this.persist();
  }

  private getUserName(userId: string): string {
    return this.data.users.find((user) => user.id === userId)?.name ?? 'Unassigned';
  }

  private getDefaultUserId(churchId: string): string {
    const fallback = this.data.users.find((user) => user.churchId === churchId);
    return fallback?.id ?? 'system';
  }

  private getPrimaryCampusId(churchId: string) {
    const church = this.data.churches.find((c) => c.id === churchId);
    return church?.primaryCampusId;
  }
}

const normalizeTaskStatus = (status: TaskStatus, dueDate: string): TaskStatus => {
  if (status === 'pending' && new Date(dueDate).getTime() < Date.now()) return 'past-due';
  return status;
};

const seedPlans = (): SubscriptionPlan[] => [
  {
    id: 'plan-lite',
    name: 'Lite',
    pricePerMonth: 19,
    maxUsers: 25,
    maxContacts: 500,
    features: ['Assignments', 'Printable lists']
  },
  {
    id: 'plan-growth',
    name: 'Growth',
    pricePerMonth: 49,
    maxUsers: 150,
    maxContacts: 2500,
    features: ['Scheduling', 'Email alerts', 'Exports']
  }
];

const seedData = (): AppDatabase => {
  const timestamp = nowIso();
  const churchId = randomUUID();
  const directorId = randomUUID();
  const connectorId = randomUUID();
  const teacherId = randomUUID();
  const plans = seedPlans();
  const campusId = randomUUID();

  const campuses: Campus[] = [
    {
      id: campusId,
      churchId,
      name: 'Downtown Campus',
      address: '1200 Central Ave, Springfield, USA',
      timezone: 'America/Chicago',
      primary: true
    }
  ];

  const contacts: Contact[] = [
    {
      id: randomUUID(),
      churchId,
      campusId,
      displayName: 'Jasmine Patel',
      email: 'jasmine@example.com',
      phone: '555-0101',
      preferredContactMethod: 'text',
      temperature: 'cool',
      ownerId: connectorId,
      tags: ['young adults', 'new visitor'],
      createdAt: timestamp,
      updatedAt: timestamp,
      lastActivityAt: timestamp,
      backgroundNotes: 'Met during Sunday welcome brunch.'
    },
    {
      id: randomUUID(),
      churchId,
      campusId,
      displayName: 'Marcus Reid',
      email: 'marcus@example.com',
      phone: '555-0102',
      preferredContactMethod: 'phone',
      temperature: 'warm',
      ownerId: teacherId,
      tags: ['family'],
      createdAt: timestamp,
      updatedAt: timestamp,
      lastActivityAt: timestamp,
      backgroundNotes: 'Interested in children’s programs.'
    },
    {
      id: randomUUID(),
      churchId,
      campusId,
      displayName: 'Elena Alvarez',
      email: 'elena@example.com',
      phone: '555-0103',
      preferredContactMethod: 'email',
      temperature: 'new',
      tags: ['prayer'],
      createdAt: timestamp,
      updatedAt: timestamp,
      lastActivityAt: timestamp
    }
  ];

  const users: UserAccount[] = [
    {
      id: directorId,
      churchId,
      name: 'Sarah Summers',
      email: 'sarah@gracecity.church',
      phone: '555-1111',
      role: 'director',
      avatarColor: '#2563eb',
      active: true
    },
    {
      id: connectorId,
      churchId,
      name: 'Andre Lewis',
      email: 'andre@gracecity.church',
      phone: '555-1112',
      role: 'connector',
      avatarColor: '#22c55e',
      active: true
    },
    {
      id: teacherId,
      churchId,
      name: 'Melissa Cho',
      email: 'melissa@gracecity.church',
      phone: '555-1113',
      role: 'teacher',
      avatarColor: '#f97316',
      active: true
    }
  ];

  const credentials = [
    { userId: directorId, passwordHash: hashSync('director123', 10) },
    { userId: connectorId, passwordHash: hashSync('connector123', 10) },
    { userId: teacherId, passwordHash: hashSync('teacher123', 10) }
  ];

  const tasks: FollowUpTask[] = [
    {
      id: randomUUID(),
      churchId,
      contactId: contacts[0].id,
      assigneeId: connectorId,
      category: 'text',
      status: 'pending',
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      notes: 'Send mid-week encouragement text.',
      recurrence: 'one-time',
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: randomUUID(),
      churchId,
      contactId: contacts[1].id,
      assigneeId: teacherId,
      category: 'visit',
      status: 'in-progress',
      dueDate: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
      notes: 'Deliver family welcome basket.',
      recurrence: 'monthly',
      createdAt: timestamp,
      updatedAt: timestamp
    }
  ];

  const activities: ActivityLog[] = [
    {
      id: randomUUID(),
      churchId,
      contactId: contacts[0].id,
      userId: connectorId,
      type: 'note',
      note: 'Jasmine joined the young adults group.',
      createdAt: timestamp
    },
    {
      id: randomUUID(),
      churchId,
      contactId: contacts[1].id,
      userId: teacherId,
      type: 'note',
      note: 'Scheduled a home visit for Thursday evening.',
      createdAt: timestamp
    }
  ];

  const templates: AssignmentTemplate[] = [
    {
      id: randomUUID(),
      churchId,
      label: 'Welcome Phone Call',
      description: 'Call guest within 48 hours with a warm welcome.',
      category: 'call',
      defaultRecurrence: 'one-time'
    },
    {
      id: randomUUID(),
      churchId,
      label: 'Bible Study Invite',
      description: 'Invite contact to join ongoing study group.',
      category: 'bible-study',
      defaultRecurrence: 'weekly'
    }
  ];

  return {
    version: DB_VERSION,
    lastUpdated: timestamp,
    churches: [
      {
        id: churchId,
        name: 'Ember Demo Church',
        brandTagline: 'Never let an ember go cold.',
        planId: plans[1].id,
        digestPreference: { dayOfWeek: 1, time: '08:00' },
        emailAlerts: true,
        audibleAlerts: true,
        campuses,
        primaryCampusId: campusId
      }
    ],
    campuses,
    users,
    credentials,
    contacts,
    tasks,
    activities,
    plans,
    templates
  };
};

