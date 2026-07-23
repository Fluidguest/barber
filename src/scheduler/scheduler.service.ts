import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SystemPrismaService } from '../prisma/system-prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TRIAL_DAYS } from '../billing/billing.service';
import { LOCK, withPlatformLock } from './platform-lock';

/**
 * Jobs da PLATAFORMA — rodam para todas as barbearias, sem usuário logado.
 *
 * Precisam da conexão de sistema porque varrem tenants (é justamente o caso
 * previsto para ela). O trabalho de cada barbearia continua sendo feito sob
 * `withTenant` pelos serviços de domínio.
 *
 * Desligue com `SCHEDULER_ENABLED=false` (usado nos testes e em instâncias que
 * só servem HTTP).
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger('Scheduler');

  constructor(
    private readonly system: SystemPrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private get enabled(): boolean {
    // Desligado nos testes por padrão (senão dispara durante a suíte).
    if (process.env.SCHEDULER_ENABLED !== undefined) {
      return process.env.SCHEDULER_ENABLED === 'true';
    }
    return process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID;
  }

  /**
   * Envia os lembretes cuja hora chegou, de TODAS as barbearias ativas.
   *
   * Antes disto, nenhum lembrete saía sozinho: dependia de alguém chamar
   * `POST /notifications/dispatch` manualmente, barbearia por barbearia.
   */
  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'reminders' })
  async dispatchReminders() {
    if (!this.enabled) return;

    await withPlatformLock(this.system, LOCK.REMINDERS, async () => {
      const tenants = await this.activeTenants();
      let total = 0;
      let falhas = 0;

      for (const t of tenants) {
        try {
          const r = await this.notifications.dispatchDue(t.id);
          total += r.dispatched;
        } catch (err) {
          // Uma barbearia com problema (ex.: token do WhatsApp vencido) não
          // pode impedir o envio das demais.
          falhas++;
          this.logger.error(
            `Falha ao despachar lembretes de ${t.slug}: ${(err as Error).message}`,
          );
        }
      }

      if (total || falhas) {
        this.logger.log(
          `Lembretes: ${total} enviados em ${tenants.length} barbearias` +
            (falhas ? ` (${falhas} com falha)` : ''),
        );
      }
    });
  }

  /**
   * Suspende barbearias cujo período de teste venceu.
   *
   * Antes disto o trial nunca expirava: `trialEndsAt` era gravado, mas nada
   * olhava para ele — na prática, teste gratuito para sempre.
   */
  @Cron(CronExpression.EVERY_HOUR, { name: 'trials' })
  async expireTrials() {
    if (!this.enabled) return;

    await withPlatformLock(this.system, LOCK.TRIALS, async () => {
      const agora = new Date();
      // Quem se cadastrou e NUNCA assinou não tem `trialEndsAt` — para esses o
      // prazo conta a partir da criação da barbearia.
      const corte = new Date(agora.getTime() - TRIAL_DAYS * 86_400_000);

      const vencidas = await this.system.tenant.findMany({
        where: {
          status: 'TRIAL',
          deletedAt: null,
          OR: [
            // 1) assinou o teste e o prazo venceu
            { subscription: { is: { status: 'TRIALING', trialEndsAt: { lt: agora } } } },
            // 2) nunca assinou e já passou do período de teste
            { subscription: { is: null }, createdAt: { lt: corte } },
          ],
        },
        select: { id: true, slug: true },
      });
      if (vencidas.length === 0) return;

      await this.system.tenant.updateMany({
        where: { id: { in: vencidas.map((t) => t.id) } },
        data: { status: 'SUSPENDED' },
      });

      this.logger.log(
        `Trial expirado: ${vencidas.length} barbearia(s) suspensa(s) — ` +
          vencidas.map((t) => t.slug).join(', '),
      );
    });
  }

  /** Barbearias que devem receber processamento automático. */
  private activeTenants() {
    return this.system.tenant.findMany({
      where: { deletedAt: null, status: { in: ['TRIAL', 'ACTIVE'] } },
      select: { id: true, slug: true },
    });
  }
}
