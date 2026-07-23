import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { MailMessage, MailProvider } from './mail.provider';

/**
 * Envio real via SMTP (nodemailer). Serve para qualquer provedor que ofereça
 * SMTP: Amazon SES, Resend, Postmark, SendGrid, Gmail Workspace, etc.
 *
 * Env: MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS, MAIL_FROM, MAIL_SECURE.
 */
@Injectable()
export class SmtpMailProvider implements MailProvider {
  private readonly logger = new Logger('SmtpMail');
  private transporter?: Transporter;

  private get client(): Transporter {
    if (!this.transporter) {
      const port = Number(process.env.MAIL_PORT ?? 587);
      this.transporter = createTransport({
        host: process.env.MAIL_HOST,
        port,
        // 465 = TLS implícito; 587 = STARTTLS.
        secure: process.env.MAIL_SECURE === 'true' || port === 465,
        auth: process.env.MAIL_USER
          ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
          : undefined,
      });
    }
    return this.transporter;
  }

  async send(msg: MailMessage): Promise<void> {
    await this.client.sendMail({
      from: process.env.MAIL_FROM ?? process.env.MAIL_USER,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    this.logger.log(`enviado para=${msg.to} assunto="${msg.subject}"`);
  }
}
