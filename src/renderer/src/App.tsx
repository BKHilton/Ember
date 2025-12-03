import clsx from 'clsx';
import { DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppSnapshot,
  AssignmentTemplate,
  Contact,
  ContactTemperature,
  FollowUpTask,
  LoginPayload,
  NotificationPayload,
  SessionInfo,
  SubscriptionPlan,
  SmtpSettingsInput,
  TaskCategory,
  TaskRecurrence
} from '@shared/types';

type Toast = NotificationPayload & { id: string };

const methodOptions: Contact['preferredContactMethod'][] = ['phone', 'text', 'email', 'visit'];
const taskCategories: TaskCategory[] = [
  'call',
  'visit',
  'text',
  'email',
  'gift',
  'meal',
  'coffee',
  'bible-study',
  'prayer',
  'other'
];
const recurrenceOptions: TaskRecurrence[] = ['one-time', 'weekly', 'biweekly', 'monthly', 'quarterly'];
const temperatureColumns: { key: ContactTemperature; label: string; accent: string; description: string }[] = [
  { key: 'new', label: 'All / Intake', accent: '#6366f1', description: 'Fresh submissions' },
  { key: 'cool', label: 'Cool · Blue', accent: '#38bdf8', description: 'Rare attendees' },
  { key: 'warm', label: 'Warm · Yellow', accent: '#facc15', description: 'Consistent guests' },
  { key: 'hot', label: 'Hot · Red', accent: '#f87171', description: 'Active bible studies' },
  { key: 'convert', label: 'Converts · Gold', accent: '#fbbf24', description: 'Completed new birth' }
];
const alphaSegments = [
  { id: 'A-F', match: /^[A-F]/i },
  { id: 'G-L', match: /^[G-L]/i },
  { id: 'M-R', match: /^[M-R]/i },
  { id: 'S-Z', match: /^[S-Z]/i }
];
const ALERT_SOUND =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';

const App = () => {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [contactForm, setContactForm] = useState({
    displayName: '',
    email: '',
    phone: '',
    ownerId: '',
    preferredContactMethod: 'phone' as Contact['preferredContactMethod'],
    tags: '',
    backgroundNotes: '',
    temperature: 'new' as ContactTemperature,
    address: '',
    spouseName: '',
    maritalStatus: 'single' as Contact['maritalStatus'],
    birthday: '',
    anniversary: '',
    campusId: ''
  });
  const [taskForm, setTaskForm] = useState({
    contactId: '',
    assigneeId: '',
    category: 'call' as TaskCategory,
    recurrence: 'one-time' as TaskRecurrence,
    dueDate: formatDateInput(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)),
    windowStart: '',
    windowEnd: '',
    notes: '',
    templateId: ''
  });
  const [templates, setTemplates] = useState<AssignmentTemplate[]>([]);
  const [loginForm, setLoginForm] = useState<LoginPayload>({ email: '', password: '' });
  const [selectedAlpha, setSelectedAlpha] = useState(alphaSegments[0].id);
  const [selectedTeamMemberId, setSelectedTeamMemberId] = useState<string>();
  const [selectedCampusId, setSelectedCampusId] = useState<string>('all');
  const [notifications, setNotifications] = useState<Toast[]>([]);
  const [reportsMessage, setReportsMessage] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [planMessage, setPlanMessage] = useState('');
  const [smtpMessage, setSmtpMessage] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const audioRef = useRef<HTMLAudioElement>(null);
  const [smtpForm, setSmtpForm] = useState({
    host: '',
    port: 587,
    secure: false,
    user: '',
    password: '',
    fromName: 'Ember Alerts',
    fromEmail: 'alerts@ember.local'
  });

  const refresh = useCallback(async () => {
    const data = await window.api.getSnapshot();
    setSnapshot(data);
    setLoading(false);
    if (session) {
      const list = await window.api.listTemplates(session.church.id);
      setTemplates(list);
      setSelectedTeamMemberId((prev) => prev ?? data.users.find((u) => u.churchId === session.church.id)?.id);
    }
  }, [session]);

  useEffect(() => {
    const savedToken = localStorage.getItem('followup-token');
    if (savedToken) {
      window.api
        .getSession(savedToken)
        .then((savedSession) => {
          if (savedSession) {
            setSession(savedSession);
          } else {
            localStorage.removeItem('followup-token');
          }
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    refresh().catch(console.error);
  }, [session, refresh]);

  useEffect(() => {
    const unsubscribe = window.api.onNotification((payload) => pushNotification(payload));
    return () => unsubscribe?.();
  }, []);

  const pushNotification = (payload: NotificationPayload) => {
    const id = crypto.randomUUID?.() ?? `${Date.now()}`;
    setNotifications((prev) => [...prev, { ...payload, id }]);
    if (payload.kind === 'assignment') {
      audioRef.current?.play().catch(() => {});
    }
    setTimeout(() => {
      setNotifications((prev) => prev.filter((note) => note.id !== id));
    }, 6000);
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const result = await window.api.login(loginForm);
    if (!result) {
      setError('Invalid credentials.');
      return;
    }
    localStorage.setItem('followup-token', result.token);
    setSession(result);
    setLoginForm({ email: '', password: '' });
  };

  const handleLogout = async () => {
    const token = localStorage.getItem('followup-token');
    if (token) {
      await window.api.logout(token);
      localStorage.removeItem('followup-token');
    }
    setSession(null);
    setSnapshot(null);
  };

  const church = useMemo(
    () => snapshot?.churches.find((entry) => entry.id === session?.church.id),
    [snapshot, session]
  );
  const plan = useMemo(
    () => snapshot?.plans.find((entry) => entry.id === church?.planId),
    [snapshot, church]
  );
  const campuses = church?.campuses ?? [];
  const planOptions = snapshot?.plans ?? [];
  const canManageBilling = session.user.role === 'director' || session.user.role === 'administrator';
  const tagline = church?.brandTagline ?? 'Never let an ember go cold.';
  const campusLookup = useMemo(
    () => new Map(campuses.map((campus) => [campus.id, campus.name])),
    [campuses]
  );

  useEffect(() => {
    if (!church) return;
    setSelectedCampusId(church.primaryCampusId ?? 'all');
    setSmtpForm({
      host: church.smtp?.host ?? '',
      port: church.smtp?.port ?? 587,
      secure: church.smtp?.secure ?? false,
      user: church.smtp?.user ?? '',
      password: '',
      fromName: church.smtp?.fromName ?? 'Ember Alerts',
      fromEmail: church.smtp?.fromEmail ?? 'alerts@ember.local'
    });
  }, [church]);

  const team = useMemo(
    () => snapshot?.users.filter((user) => user.churchId === session?.church.id) ?? [],
    [snapshot, session]
  );

  const contacts = useMemo(
    () =>
      (snapshot?.contacts.filter((contact) => contact.churchId === session?.church.id) ?? []).sort(
        (a, b) =>
          new Date(b.lastActivityAt ?? b.updatedAt).getTime() -
          new Date(a.lastActivityAt ?? a.updatedAt).getTime()
      ),
    [snapshot, session]
  );

  const filteredContacts = useMemo(() => {
    if (selectedCampusId === 'all') return contacts;
    return contacts.filter((contact) => contact.campusId === selectedCampusId);
  }, [contacts, selectedCampusId]);

  const tasks = useMemo(
    () =>
      (snapshot?.tasks.filter((task) => task.churchId === session?.church.id) ?? []).sort(
        (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      ),
    [snapshot, session]
  );

  const activities = useMemo(
    () =>
      snapshot?.activities
        .filter((activity) => activity.churchId === session?.church.id)
        .slice(0, 10) ?? [],
    [snapshot, session]
  );

  const connectors = team.filter((user) => user.role === 'connector' || user.role === 'teacher').length;
  const openTasks = tasks.filter((task) => task.status !== 'completed').length;
  const pastDue = tasks.filter((task) => task.status === 'past-due').length;
  const coverage =
    contacts.length === 0
      ? 0
      : Math.round((contacts.filter((contact) => Boolean(contact.ownerId)).length / contacts.length) * 100);

  const activeMemberAssignments = useMemo(() => {
    if (!selectedTeamMemberId) return [];
    return tasks.filter((task) => task.assigneeId === selectedTeamMemberId);
  }, [tasks, selectedTeamMemberId]);

  const alphabeticalContacts = useMemo(() => {
    const bucket = alphaSegments.find((segment) => segment.id === selectedAlpha);
    if (!bucket) return filteredContacts;
    return filteredContacts.filter((contact) => contact.displayName.match(bucket.match));
  }, [filteredContacts, selectedAlpha]);

  const handleContactSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !contactForm.displayName.trim()) return;
    const fallbackCampus =
      contactForm.campusId ||
      (selectedCampusId !== 'all' ? selectedCampusId : church?.primaryCampusId) ||
      campuses[0]?.id;
    if (!fallbackCampus) {
      setError('Please configure a campus before adding contacts.');
      return;
    }
    await window.api.createContact({
      churchId: session.church.id,
      campusId: fallbackCampus,
      displayName: contactForm.displayName,
      email: contactForm.email || undefined,
      phone: contactForm.phone || undefined,
      ownerId: contactForm.ownerId || undefined,
      preferredContactMethod: contactForm.preferredContactMethod,
      tags: contactForm.tags ? contactForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [],
      backgroundNotes: contactForm.backgroundNotes || undefined,
      temperature: contactForm.temperature,
      address: contactForm.address
        ? { street: contactForm.address }
        : undefined,
      spouseName: contactForm.spouseName || undefined,
      maritalStatus: contactForm.maritalStatus,
      birthday: contactForm.birthday || undefined,
      anniversary: contactForm.anniversary || undefined
    });
    pushNotification({
      title: 'Contact added',
      message: `${contactForm.displayName} is ready for follow-up.`,
      severity: 'success',
      timestamp: new Date().toISOString()
    });
    setContactForm({
      displayName: '',
      email: '',
      phone: '',
      ownerId: '',
      preferredContactMethod: 'phone',
      tags: '',
      backgroundNotes: '',
      temperature: 'new',
      address: '',
      spouseName: '',
      maritalStatus: 'single',
      birthday: '',
      anniversary: '',
      campusId: ''
    });
    await refresh();
  };

  const handleTaskSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !taskForm.assigneeId || !taskForm.contactId) return;
    await window.api.createTask({
      churchId: session.church.id,
      contactId: taskForm.contactId,
      assigneeId: taskForm.assigneeId,
      category: taskForm.category,
      dueDate: new Date(taskForm.dueDate).toISOString(),
      windowStart: taskForm.windowStart || undefined,
      windowEnd: taskForm.windowEnd || undefined,
      notes: taskForm.notes || undefined,
      recurrence: taskForm.recurrence,
      templateId: taskForm.templateId || undefined
    });
    pushNotification({
      title: 'Assignment scheduled',
      message: `Follow-up task created for ${getContactName(taskForm.contactId, contacts)}.`,
      severity: 'info',
      timestamp: new Date().toISOString()
    });
    setTaskForm((prev) => ({
      ...prev,
      notes: '',
      dueDate: formatDateInput(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)),
      windowStart: '',
      windowEnd: '',
      templateId: ''
    }));
    await refresh();
  };

  const handleTaskStatus = async (taskId: string, status: FollowUpTask['status'], note?: string) => {
    if (!session) return;
    await window.api.updateTaskStatus({
      taskId,
      status,
      userId: session.user.id,
      note,
      rescheduledFor: status === 'rescheduled' ? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString() : undefined
    });
    await refresh();
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>, destination: ContactTemperature) => {
    event.preventDefault();
    if (!session) return;
    const contactId = event.dataTransfer.getData('text/plain');
    if (!contactId) return;
    await window.api.reorderContactTemperature({
      contactId,
      churchId: session.church.id,
      temperature: destination,
      userId: session.user.id
    });
    await refresh();
  };

  const handleDragStart = (event: DragEvent<HTMLDivElement>, contactId: string) => {
    event.dataTransfer.setData('text/plain', contactId);
  };

  const handleAttachPhoto = async (contactId: string) => {
    if (!session) return;
    await window.api.uploadContactPhoto(contactId, session.church.id);
    await refresh();
  };

  const handleTemplateCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;
    const formData = new FormData(event.currentTarget);
    await window.api.createTemplate({
      churchId: session.church.id,
      label: String(formData.get('label')),
      description: String(formData.get('description') ?? ''),
      category: String(formData.get('category')) as TaskCategory,
      defaultRecurrence: String(formData.get('recurrence')) as TaskRecurrence
    });
    event.currentTarget.reset();
    const list = await window.api.listTemplates(session.church.id);
    setTemplates(list);
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find((entry) => entry.id === templateId);
    if (!template) return;
    setTaskForm((prev) => ({
      ...prev,
      templateId,
      category: template.category,
      recurrence: template.defaultRecurrence
    }));
  };

  const handlePrint = (sectionId: string) => {
    const node = document.getElementById(sectionId);
    if (!node) return;
    const inner = node.innerHTML;
    const printWindow = window.open('', '', 'width=900,height=700');
    if (!printWindow) return;
    printWindow.document.write(`<html><head><title>Print</title></head><body>${inner}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  const handleReport = async () => {
    if (!session) return;
    const result = await window.api.generateWeeklyReport(session.church.id);
    setReportsMessage(`Weekly digest exported to: ${result.path}`);
    pushNotification({
      title: 'Report ready',
      message: 'Weekly digest saved locally.',
      severity: 'info',
      timestamp: new Date().toISOString()
    });
  };

  const handleMonthlyReport = async () => {
    if (!session) return;
    const result = await window.api.generateMonthlyReport(session.church.id);
    setReportsMessage(`Monthly digest exported to: ${result.path}`);
    pushNotification({
      title: 'Report ready',
      message: 'Monthly digest saved locally.',
      severity: 'info',
      timestamp: new Date().toISOString()
    });
  };

  const handlePlanSelect = async (planId: string) => {
    if (!session) return;
    setPlanMessage('Updating plan…');
    await window.api.updatePlan({ churchId: session.church.id, planId });
    setPlanMessage('Plan updated successfully.');
    await refresh();
  };

  const handleSmtpSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;
    setSmtpMessage('Saving settings…');
    await window.api.updateSmtpSettings({
      churchId: session.church.id,
      host: smtpForm.host,
      port: Number(smtpForm.port),
      secure: smtpForm.secure,
      user: smtpForm.user,
      password: smtpForm.password,
      fromName: smtpForm.fromName,
      fromEmail: smtpForm.fromEmail
    });
    setSmtpMessage('SMTP settings saved.');
    setSmtpForm((prev) => ({ ...prev, password: '' }));
  };

  const handleSyncExport = async () => {
    if (!session) return;
    const result = await window.api.exportData(session.church.id);
    if (result?.path) {
      setSyncMessage(`Exported to ${result.path}`);
      pushNotification({
        title: 'Sync export ready',
        message: 'Data file saved locally.',
        severity: 'info',
        timestamp: new Date().toISOString()
      });
    }
  };

  const handleSyncImport = async () => {
    if (!session) return;
    const result = await window.api.importData(session.church.id);
    if (result) {
      setSyncMessage(
        `Imported ${result.importedContacts} contacts and ${result.importedTasks} tasks from ${result.path}`
      );
      await refresh();
    }
  };

  if (loading) {
    return (
      <div className="content">
        <p>Loading workspace…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="auth-shell">
        <form className="auth-card" onSubmit={handleLogin}>
          <EmberLogo />
          <p className="tagline-small">Never let an ember go cold.</p>
          <label>
            Email
            <input
              type="email"
              value={loginForm.email}
              onChange={(event) => setLoginForm((prev) => ({ ...prev, email: event.target.value }))}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={loginForm.password}
              onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="primary">
            Enter Console
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <audio src={ALERT_SOUND} ref={audioRef} preload="auto" />
      <aside className="sidebar">
        <div className="brand">
          <EmberLogo />
          <p className="tagline-small">{tagline}</p>
        </div>

        <div className="profile">
          <small>Primary campus</small>
          <strong>{campuses.find((c) => c.id === church?.primaryCampusId)?.name ?? 'Configure campus'}</strong>
          <span>{campuses.length} campus{campuses.length === 1 ? '' : 'es'}</span>
        </div>

        <div className="profile">
          <small>Coverage</small>
          <strong>{coverage}% assigned</strong>
          <span>{contacts.length} total contacts</span>
        </div>

        <div className="profile">
          <small>Digest preference</small>
          <strong>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][church?.digestPreference.dayOfWeek ?? 1]} ·{' '}
            {church?.digestPreference.time}
          </strong>
          <span>Saved to local reports</span>
        </div>

        {plan && (
          <div className="profile">
            <small>Plan</small>
            <strong>{plan.name}</strong>
            <span>${plan.pricePerMonth}/mo · {plan.maxUsers} seats</span>
          </div>
        )}

        <button className="secondary" onClick={handleLogout}>
          Log out
        </button>
      </aside>

      <main className="content">
        <div className="content-header">
          <div>
            <h2>Welcome back, {session.user.name}</h2>
            <p>{tagline}</p>
          </div>
          <div className="hero-actions">
            {plan && <span className="pill">Plan · {plan.name}</span>}
            <span className="pill">Campuses · {campuses.length}</span>
          </div>
        </div>

        <section className="grid cards">
          <Card title="Contacts" value={contacts.length} subtitle="Pipeline" />
          <Card title="Open Tasks" value={openTasks} subtitle={`${pastDue} past due`} />
          <Card title="Connectors & Teachers" value={connectors} subtitle="Assignable teammates" />
          <Card title="Coverage" value={`${coverage}%`} subtitle="Assigned to leaders" />
        </section>

        {canManageBilling && (
          <section className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 24 }}>
            <div className="panel">
              <header>
                <h3>Plan & Billing</h3>
                <span>Choose a plan per church campus</span>
              </header>
              <div className="plan-grid">
                {planOptions.map((planOption) => (
                  <PlanCard
                    key={planOption.id}
                    plan={planOption}
                    active={planOption.id === church?.planId}
                    onSelect={() => handlePlanSelect(planOption.id)}
                  />
                ))}
              </div>
              {planMessage && <small>{planMessage}</small>}
            </div>
            <div className="panel">
              <header>
                <h3>Email Alerts (SMTP)</h3>
                <span>Send digests and task notifications from your domain</span>
              </header>
              <form className="smtp-form" onSubmit={handleSmtpSubmit}>
                <label>
                  Host
                  <input
                    value={smtpForm.host}
                    onChange={(event) => setSmtpForm((prev) => ({ ...prev, host: event.target.value }))}
                    placeholder="smtp.yourchurch.com"
                  />
                </label>
                <div className="split">
                  <label>
                    Port
                    <input
                      type="number"
                      value={smtpForm.port}
                      onChange={(event) => setSmtpForm((prev) => ({ ...prev, port: Number(event.target.value) }))}
                    />
                  </label>
                  <label className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={smtpForm.secure}
                      onChange={(event) => setSmtpForm((prev) => ({ ...prev, secure: event.target.checked }))}
                    />
                    Use TLS
                  </label>
                </div>
                <label>
                  Username
                  <input
                    value={smtpForm.user}
                    onChange={(event) => setSmtpForm((prev) => ({ ...prev, user: event.target.value }))}
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={smtpForm.password}
                    onChange={(event) => setSmtpForm((prev) => ({ ...prev, password: event.target.value }))}
                    placeholder="••••••••"
                  />
                </label>
                <label>
                  From name
                  <input
                    value={smtpForm.fromName}
                    onChange={(event) => setSmtpForm((prev) => ({ ...prev, fromName: event.target.value }))}
                  />
                </label>
                <label>
                  From email
                  <input
                    type="email"
                    value={smtpForm.fromEmail}
                    onChange={(event) => setSmtpForm((prev) => ({ ...prev, fromEmail: event.target.value }))}
                  />
                </label>
                <button type="submit" className="secondary">
                  Save SMTP settings
                </button>
              </form>
              {smtpMessage && <small>{smtpMessage}</small>}
            </div>
          </section>
        )}

        <section className="panel" id="board-section">
          <header>
            <h3>Contact Temperatures</h3>
            <div className="actions">
              <select value={selectedCampusId} onChange={(event) => setSelectedCampusId(event.target.value)}>
                <option value="all">All campuses</option>
                {campuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>
                    {campus.name}
                  </option>
                ))}
              </select>
              <button className="secondary" onClick={() => handlePrint('board-section')}>
                Print board
              </button>
            </div>
          </header>
          <div className="kanban">
            {temperatureColumns.map((column) => (
              <div
                className="kanban-column"
                key={column.key}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleDrop(event, column.key)}
              >
                <div className="kanban-column-header" style={{ borderColor: column.accent }}>
                  <strong>{column.label}</strong>
                  <small>{column.description}</small>
                </div>
                <div className="kanban-column-body" data-column-id={column.key}>
                  {filteredContacts
                    .filter((contact) => contact.temperature === column.key)
                    .map((contact) => (
                      <div
                        className="kanban-card"
                        key={contact.id}
                        draggable
                        onDragStart={(event) => handleDragStart(event, contact.id)}
                      >
                        <div className="kanban-card-header">
                          <span>{contact.displayName}</span>
                          <button className="link" onClick={() => handleAttachPhoto(contact.id)}>
                            Add photo
                          </button>
                        </div>
                        <small>
                          {contact.phone ?? contact.email ?? 'No contact info'} ·{' '}
                          {contact.ownerId ? getUserName(contact.ownerId, team) : 'Unassigned'} ·{' '}
                          {campusLookup.get(contact.campusId) ?? 'Campus'}
                        </small>
                        <div className="tags">
                          {contact.tags.slice(0, 3).map((tag) => (
                            <span className="tag" key={tag}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel" id="alphabet-section">
          <header>
            <h3>Alphabetical list</h3>
            <div className="actions">
              <select value={selectedAlpha} onChange={(event) => setSelectedAlpha(event.target.value)}>
                {alphaSegments.map((segment) => (
                  <option key={segment.id} value={segment.id}>
                    {segment.id}
                  </option>
                ))}
              </select>
              <button className="secondary" onClick={() => handlePrint('alphabet-section')}>
                Print list
              </button>
            </div>
          </header>
          <div className="list">
            {alphabeticalContacts.map((contact) => (
              <div className="list-item" key={contact.id}>
                <div>
                  <strong>{contact.displayName}</strong>
                  <small>
                    {contact.address?.street ?? 'No address'} · {contact.preferredContactMethod} ·{' '}
                    {campusLookup.get(contact.campusId) ?? 'Campus'}
                  </small>
                </div>
                <div className={`status-pill temperature-${contact.temperature}`}>{contact.temperature}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div className="panel">
            <header>
              <h3>New Contact</h3>
              <span>Capture details including family data</span>
            </header>
            <form onSubmit={handleContactSubmit}>
              <label>
                Full name
                <input
                  value={contactForm.displayName}
                  onChange={(event) => setContactForm((prev) => ({ ...prev, displayName: event.target.value }))}
                  required
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={contactForm.email}
                  onChange={(event) => setContactForm((prev) => ({ ...prev, email: event.target.value }))}
                />
              </label>
              <label>
                Phone
                <input
                  value={contactForm.phone}
                  onChange={(event) => setContactForm((prev) => ({ ...prev, phone: event.target.value }))}
                />
              </label>
              <label>
                Address
                <input
                  value={contactForm.address}
                  onChange={(event) => setContactForm((prev) => ({ ...prev, address: event.target.value }))}
                />
              </label>
              <label>
                Temperature
                <select
                  value={contactForm.temperature}
                  onChange={(event) =>
                    setContactForm((prev) => ({ ...prev, temperature: event.target.value as ContactTemperature }))
                  }
                >
                  {temperatureColumns.map((column) => (
                    <option key={column.key} value={column.key}>
                      {column.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Campus
                <select
                  value={
                    contactForm.campusId ||
                    (selectedCampusId !== 'all' ? selectedCampusId : church?.primaryCampusId) ||
                    campuses[0]?.id ||
                    ''
                  }
                  onChange={(event) => setContactForm((prev) => ({ ...prev, campusId: event.target.value }))}
                >
                  {campuses.map((campus) => (
                    <option key={campus.id} value={campus.id}>
                      {campus.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Preferred contact method
                <select
                  value={contactForm.preferredContactMethod}
                  onChange={(event) =>
                    setContactForm((prev) => ({
                      ...prev,
                      preferredContactMethod: event.target.value as Contact['preferredContactMethod']
                    }))
                  }
                >
                  {methodOptions.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assign to
                <select
                  value={contactForm.ownerId}
                  onChange={(event) => setContactForm((prev) => ({ ...prev, ownerId: event.target.value }))}
                >
                  <option value="">Unassigned</option>
                  {team.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name} · {member.role}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Spouse
                <input
                  value={contactForm.spouseName}
                  onChange={(event) => setContactForm((prev) => ({ ...prev, spouseName: event.target.value }))}
                />
              </label>
              <label>
                Marital status
                <select
                  value={contactForm.maritalStatus}
                  onChange={(event) =>
                    setContactForm((prev) => ({
                      ...prev,
                      maritalStatus: event.target.value as Contact['maritalStatus']
                    }))
                  }
                >
                  <option value="single">Single</option>
                  <option value="married">Married</option>
                  <option value="divorced">Divorced</option>
                  <option value="widowed">Widowed</option>
                </select>
              </label>
              <div className="split">
                <label>
                  Birthday
                  <input
                    type="date"
                    value={contactForm.birthday}
                    onChange={(event) => setContactForm((prev) => ({ ...prev, birthday: event.target.value }))}
                  />
                </label>
                <label>
                  Anniversary
                  <input
                    type="date"
                    value={contactForm.anniversary}
                    onChange={(event) => setContactForm((prev) => ({ ...prev, anniversary: event.target.value }))}
                  />
                </label>
              </div>
              <label>
                Tags (comma separated)
                <input
                  value={contactForm.tags}
                  onChange={(event) => setContactForm((prev) => ({ ...prev, tags: event.target.value }))}
                />
              </label>
              <label>
                Notes
                <textarea
                  value={contactForm.backgroundNotes}
                  onChange={(event) => setContactForm((prev) => ({ ...prev, backgroundNotes: event.target.value }))}
                />
              </label>
              <button type="submit" className="primary">
                Add contact
              </button>
            </form>
          </div>

          <div className="panel">
            <header>
              <h3>Assignment Templates</h3>
              <span>Create quick actions for directors</span>
            </header>
            <form className="template-form" onSubmit={handleTemplateCreate}>
              <input name="label" placeholder="Template name" required />
              <textarea name="description" placeholder="Instructions" />
              <select name="category">
                {taskCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <select name="recurrence">
                {recurrenceOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <button type="submit" className="secondary">
                Save Template
              </button>
            </form>
            <div className="template-list">
              {templates.map((template) => (
                <button
                  key={template.id}
                  className={clsx('template-chip', { active: taskForm.templateId === template.id })}
                  onClick={() => {
                    handleTemplateSelect(template.id);
                    setTaskForm((prev) => ({ ...prev, templateId: template.id }));
                  }}
                >
                  {template.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div className="panel">
            <header>
              <h3>Schedule Assignment</h3>
              <span>Send to connectors or teachers with recurrence</span>
            </header>
            <form onSubmit={handleTaskSubmit}>
              <label>
                Contact
                <select
                  required
                  value={taskForm.contactId}
                  onChange={(event) => setTaskForm((prev) => ({ ...prev, contactId: event.target.value }))}
                >
                  <option value="">Choose contact</option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Template
                <select
                  value={taskForm.templateId}
                  onChange={(event) => {
                    setTaskForm((prev) => ({ ...prev, templateId: event.target.value }));
                    handleTemplateSelect(event.target.value);
                  }}
                >
                  <option value="">None</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assign to
                <select
                  required
                  value={taskForm.assigneeId}
                  onChange={(event) => setTaskForm((prev) => ({ ...prev, assigneeId: event.target.value }))}
                >
                  <option value="">Select teammate</option>
                  {team.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name} · {member.role}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Category
                <select
                  value={taskForm.category}
                  onChange={(event) =>
                    setTaskForm((prev) => ({ ...prev, category: event.target.value as TaskCategory }))
                  }
                >
                  {taskCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <div className="split">
                <label>
                  Due date
                  <input
                    type="date"
                    value={taskForm.dueDate}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Recurrence
                  <select
                    value={taskForm.recurrence}
                    onChange={(event) =>
                      setTaskForm((prev) => ({ ...prev, recurrence: event.target.value as TaskRecurrence }))
                    }
                  >
                    {recurrenceOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="split">
                <label>
                  Window start
                  <input
                    type="datetime-local"
                    value={taskForm.windowStart}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, windowStart: event.target.value }))}
                  />
                </label>
                <label>
                  Window end
                  <input
                    type="datetime-local"
                    value={taskForm.windowEnd}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, windowEnd: event.target.value }))}
                  />
                </label>
              </div>
              <label>
                Instructions
                <textarea
                  value={taskForm.notes}
                  onChange={(event) => setTaskForm((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </label>
              <button type="submit" className="primary">
                Create task
              </button>
            </form>
          </div>

          <div className="panel" id="team-section">
            <header>
              <h3>Follow-up Team</h3>
              <span>Click a member to see live assignments</span>
            </header>
            <div className="team-list">
              {team
                .filter((member) => member.role === 'connector' || member.role === 'teacher')
                .map((member) => (
                  <button
                    key={member.id}
                    className={clsx('team-chip', { active: selectedTeamMemberId === member.id })}
                    onClick={() => setSelectedTeamMemberId(member.id)}
                  >
                    {member.name}
                  </button>
                ))}
            </div>
            <div className="list">
              {activeMemberAssignments.map((task) => (
                <div className="list-item" key={task.id}>
                  <div>
                    <strong>{getContactName(task.contactId, contacts)}</strong>
                    <small>
                      {task.category} · due {new Date(task.dueDate).toLocaleDateString()}
                    </small>
                    {task.notes && <small>{task.notes}</small>}
                  </div>
                  <div className="actions">
                    <button className="primary" onClick={() => handleTaskStatus(task.id, 'completed', 'Completed')}>
                      Complete
                    </button>
                    <button
                      className="secondary"
                      onClick={() => handleTaskStatus(task.id, 'rescheduled', 'Rescheduled')}
                    >
                      Reschedule
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div className="panel" id="past-due-section">
            <header>
              <h3>Past Due Assignments</h3>
              <div className="actions">
                <button className="secondary" onClick={() => handlePrint('past-due-section')}>
                  Print
                </button>
              </div>
            </header>
            <div className="list">
              {tasks
                .filter((task) => task.status === 'past-due')
                .map((task) => (
                  <div className="list-item" key={task.id}>
                    <div>
                      <strong>{getContactName(task.contactId, contacts)}</strong>
                      <small>Was due {new Date(task.dueDate).toLocaleDateString()}</small>
                    </div>
                    <button className="primary" onClick={() => handleTaskStatus(task.id, 'completed', 'Completed')}>
                      Complete now
                    </button>
                  </div>
                ))}
            </div>
          </div>

          <div className="panel">
            <header>
              <h3>Reports & Logs</h3>
              <span>Weekly/monthly digests saved locally</span>
            </header>
            <div className="list">
              <button className="secondary" onClick={handleReport}>
                Generate weekly digest
              </button>
              <button className="secondary" onClick={handleMonthlyReport}>
                Generate monthly digest
              </button>
              <button className="secondary" onClick={() => handlePrint('team-section')}>
                Print team workload
              </button>
              <button className="secondary" onClick={() => handlePrint('alphabet-section')}>
                Print alphabetical list
              </button>
              <button className="secondary" onClick={handleSyncExport}>
                Export data bundle
              </button>
              <button className="secondary" onClick={handleSyncImport}>
                Import data bundle
              </button>
            </div>
            {reportsMessage && <small>{reportsMessage}</small>}
            {syncMessage && <small>{syncMessage}</small>}
          </div>
        </section>

        <section className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 24 }}>
          <div className="panel">
            <header>
              <h3>Activity Log</h3>
              <span>Latest updates and assignment results</span>
            </header>
            <div className="activity-list">
              {activities.map((activity) => (
                <div className="activity-item" key={activity.id}>
                  <strong>{getContactName(activity.contactId, contacts)}</strong>
                  <p>{activity.note}</p>
                  <small>
                    {new Date(activity.createdAt).toLocaleString()} · {getUserName(activity.userId, team)}
                  </small>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <header>
              <h3>Director Alerts</h3>
              <span>Audible + email ready</span>
            </header>
            <ul className="digest-list">
              <li>Audible alerts: {church?.audibleAlerts ? 'Enabled' : 'Disabled'}</li>
              <li>Email alerts: {church?.emailAlerts ? 'Enabled' : 'Disabled'}</li>
              <li>Plan features: {plan?.features?.join(', ') ?? '—'}</li>
            </ul>
          </div>
        </section>
      </main>

      <div className="notification-stack">
        {notifications.map((note) => (
          <div className={`notification ${note.severity}`} key={note.id}>
            <strong>{note.title}</strong>
            <p>{note.message}</p>
            <small>{new Date(note.timestamp).toLocaleTimeString()}</small>
          </div>
        ))}
      </div>
    </div>
  );
};

const PlanCard = ({
  plan,
  active,
  onSelect
}: {
  plan: SubscriptionPlan;
  active: boolean;
  onSelect: () => void;
}) => (
  <div className={clsx('plan-card', { active })}>
    <div className="plan-card__header">
      <h4>{plan.name}</h4>
      <p className="plan-price">${plan.pricePerMonth}/mo</p>
      <small>
        {plan.maxUsers} seats · {plan.maxContacts.toLocaleString()} contacts
      </small>
    </div>
    <ul>
      {plan.features.map((feature) => (
        <li key={feature}>{feature}</li>
      ))}
    </ul>
    <button className={active ? 'secondary' : 'primary'} onClick={onSelect} disabled={active}>
      {active ? 'Current plan' : 'Switch to plan'}
    </button>
  </div>
);

const EmberLogo = () => (
  <div className="ember-logo">
    <div className="ember-logo__icon">
      <span className="ember-flame" />
    </div>
    <span>Ember</span>
  </div>
);

const Card = ({ title, value, subtitle }: { title: string; value: number | string; subtitle: string }) => (
  <div className="card">
    <h3>{title}</h3>
    <div className="value">{value}</div>
    <p>{subtitle}</p>
  </div>
);

const formatDateInput = (date: Date) => date.toISOString().slice(0, 10);

const getUserName = (userId: string | undefined, team: AppSnapshot['users']) => {
  if (!userId) return 'Unassigned';
  return team.find((member) => member.id === userId)?.name ?? 'Unassigned';
};

const getContactName = (contactId: string, contacts: Contact[]) => {
  return contacts.find((contact) => contact.id === contactId)?.displayName ?? 'Unknown guest';
};

export default App;

