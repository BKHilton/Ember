import dayjs from 'dayjs';
import type { NotificationPayload } from '@shared/types';
import { DataStore } from '../dataStore';
import { EmailService } from './emailService';

type NotifyFn = (payload: NotificationPayload) => void;

export class ReportScheduler {
  private readonly lastDigestSent = new Map<string, string>();
  private interval?: NodeJS.Timeout;

  constructor(
    private store: DataStore,
    private emailService: EmailService,
    private notify: NotifyFn
  ) {}

  start() {
    if (this.interval) return;
    this.interval = setInterval(() => this.tick(), 1000 * 60 * 30);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  private async tick() {
    const snapshot = this.store.getSnapshot();
    for (const church of snapshot.churches) {
      const preference = church.digestPreference;
      const now = dayjs();
      if (now.day() !== preference.dayOfWeek) return;
      const [hour, minute] = preference.time.split(':').map(Number);
      if (now.hour() !== hour || now.minute() < minute || now.minute() > minute + 5) return;

      const key = `${church.id}-${now.format('YYYY-MM-DD')}`;
      if (this.lastDigestSent.get(church.id) === key) return;
      this.lastDigestSent.set(church.id, key);

      const digest = this.store.generateWeeklyDigest(church.id);
      const reportPath = this.store.writeReportToDisk(church.id, digest);
      const director = snapshot.users.find(
        (user) => user.churchId === church.id && user.role === 'director'
      );
      if (director && church.emailAlerts) {
        await this.emailService.sendDigestNotification(
          director.email,
          `${church.name} Weekly Activity Digest`,
          `Completed assignments: ${digest.completedAssignments}
Rescheduled assignments: ${digest.rescheduledAssignments}
Past due tasks: ${digest.pastDueTasks}
Report: ${reportPath}`,
          church.smtp
        );
      }
      this.notify({
        title: 'Weekly Digest',
        message: `${church.name} summary ready. File saved to reports folder.`,
        severity: 'info',
        kind: 'digest',
        timestamp: new Date().toISOString()
      });
      if (now.date() === now.daysInMonth()) {
        const monthlyDigest = this.store.generateMonthlyDigest(church.id);
        const monthlyPath = this.store.writeReportToDisk(church.id, monthlyDigest);
        const director = snapshot.users.find(
          (user) => user.churchId === church.id && user.role === 'director'
        );
        if (director && church.emailAlerts) {
          await this.emailService.sendDigestNotification(
            director.email,
            `${church.name} Monthly Activity Digest`,
            `Completed assignments: ${monthlyDigest.completedAssignments}
Rescheduled assignments: ${monthlyDigest.rescheduledAssignments}
Past due tasks: ${monthlyDigest.pastDueTasks}
Report: ${monthlyPath}`,
            church.smtp
          );
        }
        this.notify({
          title: 'Monthly Digest',
          message: `${church.name} monthly log exported.`,
          severity: 'info',
          kind: 'digest',
          timestamp: new Date().toISOString()
        });
      }
    }
  }
}

