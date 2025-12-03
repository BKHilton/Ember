import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import nodemailer, { Transporter } from 'nodemailer';
import type { SmtpSettings } from '@shared/types';

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  private readonly outboxDir: string;

  constructor(private basePath: string) {
    this.outboxDir = join(basePath, 'mail-outbox');
    if (!existsSync(this.outboxDir)) {
      mkdirSync(this.outboxDir, { recursive: true });
    }
  }

  private createTransport(smtp?: SmtpSettings): Transporter {
    if (!smtp || !smtp.host) {
      return nodemailer.createTransport({
        streamTransport: true,
        newline: 'unix',
        buffer: true
      });
    }
    return nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user
        ? {
            user: smtp.user,
            pass: smtp.password
          }
        : undefined
    });
  }

  async send(payload: EmailPayload, smtp?: SmtpSettings) {
    const transporter = this.createTransport(smtp);
    const info = await transporter.sendMail({
      from: smtp ? `"${smtp.fromName}" <${smtp.fromEmail}>` : 'alerts@ember.local',
      to: payload.to,
      subject: payload.subject,
      text: payload.text ?? payload.html,
      html: payload.html
    });
    const filePath = join(this.outboxDir, `mail-${Date.now()}.eml`);
    writeFileSync(filePath, info.message as Buffer);
    return filePath;
  }

  async sendAssignmentNotification(to: string, subject: string, summary: string, smtp?: SmtpSettings) {
    return this.send(
      {
        to,
        subject,
        html: `<p>${summary}</p>`
      },
      smtp
    );
  }

  async sendDigestNotification(to: string, subject: string, summary: string, smtp?: SmtpSettings) {
    return this.send(
      {
      to,
      subject,
      html: `<p>${summary}</p>`
      },
      smtp
    );
  }
}

