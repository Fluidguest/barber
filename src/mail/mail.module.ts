import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { FakeMailProvider } from './fake-mail.provider';
import { SmtpMailProvider } from './smtp-mail.provider';

/**
 * Global: qualquer módulo pode injetar `MailService` sem reimportar
 * (mesmo tratamento dado ao Prisma).
 */
@Global()
@Module({
  providers: [MailService, FakeMailProvider, SmtpMailProvider],
  exports: [MailService],
})
export class MailModule {}
