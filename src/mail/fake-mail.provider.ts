import { Injectable, Logger } from '@nestjs/common';
import { MailMessage, MailProvider } from './mail.provider';

/**
 * Provider padrão (dev/teste): não envia nada de verdade — registra no log e
 * guarda a última mensagem em memória, o que permite testar o fluxo de reset
 * de senha ponta a ponta sem servidor SMTP.
 */
@Injectable()
export class FakeMailProvider implements MailProvider {
  private readonly logger = new Logger('FakeMail');

  /** Últimas mensagens "enviadas" (mais recente primeiro). Só para dev/teste. */
  static readonly outbox: MailMessage[] = [];

  async send(msg: MailMessage): Promise<void> {
    FakeMailProvider.outbox.unshift(msg);
    if (FakeMailProvider.outbox.length > 50) FakeMailProvider.outbox.pop();
    this.logger.log(`[fake] para=${msg.to} assunto="${msg.subject}"`);
    this.logger.debug(msg.text);
  }
}
