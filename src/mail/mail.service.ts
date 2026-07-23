import { Injectable, Logger } from '@nestjs/common';
import { FakeMailProvider } from './fake-mail.provider';
import { SmtpMailProvider } from './smtp-mail.provider';
import { MailMessage, MailProvider } from './mail.provider';

/**
 * Fachada de e-mail: escolhe o provider por `MAIL_PROVIDER` (fake | smtp) e
 * monta os e-mails transacionais do sistema.
 *
 * Falha de envio **não derruba** a operação de negócio — é logada. Ex.: se o
 * SMTP cair, o pedido de reset de senha não pode virar erro 500 para o usuário
 * (e nem revelar se o e-mail existe).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');

  constructor(
    private readonly fake: FakeMailProvider,
    private readonly smtp: SmtpMailProvider,
  ) {}

  private get provider(): MailProvider {
    return (process.env.MAIL_PROVIDER ?? 'fake') === 'smtp' ? this.smtp : this.fake;
  }

  async send(msg: MailMessage): Promise<void> {
    try {
      await this.provider.send(msg);
    } catch (err) {
      this.logger.error(
        `Falha ao enviar e-mail para ${msg.to}: ${(err as Error).message}`,
      );
    }
  }

  /** E-mail de redefinição de senha. `link` já vem com o token. */
  async sendPasswordReset(to: string, name: string, link: string, minutes: number) {
    const text = [
      `Olá, ${name}.`,
      ``,
      `Recebemos um pedido para redefinir a senha da sua conta.`,
      `Use o link abaixo (válido por ${minutes} minutos):`,
      ``,
      link,
      ``,
      `Se você não pediu isso, ignore este e-mail — sua senha continua a mesma.`,
    ].join('\n');

    const html = `
      <p>Olá, <strong>${escapeHtml(name)}</strong>.</p>
      <p>Recebemos um pedido para redefinir a senha da sua conta.</p>
      <p><a href="${escapeHtml(link)}">Redefinir minha senha</a><br>
      <small>Válido por ${minutes} minutos.</small></p>
      <p>Se você não pediu isso, ignore este e-mail — sua senha continua a mesma.</p>
    `.trim();

    await this.send({ to, subject: 'Redefinição de senha', text, html });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
