import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export type SendMailParams = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type SendMailResult = {
  sent: boolean;
  mode: 'smtp' | 'log';
  messageId?: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  isEnabled(): boolean {
    return (process.env.SMTP_ENABLED ?? '').toLowerCase() === 'true' && !!process.env.SMTP_HOST?.trim();
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      const port = Number(process.env.SMTP_PORT ?? 587);
      const secure = (process.env.SMTP_SECURE ?? '').toLowerCase() === 'true' || port === 465;
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure,
        auth:
          process.env.SMTP_USER && process.env.SMTP_PASS
            ? {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
              }
            : undefined,
      });
    }
    return this.transporter;
  }

  getFromAddress(): string {
    return process.env.SMTP_FROM?.trim() || 'noreply@myfleet.app';
  }

  async verifyConnection(): Promise<{ ok: boolean; error?: string }> {
    if (!this.isEnabled()) {
      return { ok: false, error: 'smtp_disabled' };
    }

    try {
      await this.getTransporter().verify();
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'smtp_verify_failed';
      this.logger.error(`SMTP verify failed: ${message}`);
      return { ok: false, error: message };
    }
  }

  async sendMail(params: SendMailParams): Promise<SendMailResult> {
    if (!this.isEnabled()) {
      this.logger.log(
        `[mail:log] to=${params.to} subject="${params.subject}"\n${params.text}`,
      );
      return { sent: false, mode: 'log' };
    }

    const info = await this.getTransporter().sendMail({
      from: this.getFromAddress(),
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });

    return {
      sent: true,
      mode: 'smtp',
      messageId: info.messageId,
    };
  }
}
