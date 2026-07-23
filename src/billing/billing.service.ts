import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SystemPrismaService } from '../prisma/system-prisma.service';
import {
  PLATFORM_PAYMENT_PROVIDER,
  PlatformPaymentProvider,
} from './payment-provider';
import { BillingWebhookDto } from './dto/webhook.dto';

const SUB_SELECT = {
  id: true,
  planId: true,
  status: true,
  trialEndsAt: true,
  currentPeriodEnd: true,
  externalId: true,
} satisfies Prisma.SubscriptionSelect;

/** Duração do teste gratuito. Fonte única — o agendador usa a mesma. */
export const TRIAL_DAYS = 14;

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
    @Inject(PLATFORM_PAYMENT_PROVIDER)
    private readonly provider: PlatformPaymentProvider,
  ) {}

  listPlans() {
    // Catálogo global (sem RLS).
    return this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priceCents: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        priceCents: true,
        interval: true,
        maxUsers: true,
        maxUnits: true,
      },
    });
  }

  getSubscription(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.subscription.findUnique({ where: { tenantId }, select: SUB_SELECT }),
    );
  }

  async subscribe(tenantId: string, planId: string) {
    const plan = await this.prisma.plan.findFirst({
      where: { id: planId, isActive: true },
      select: { id: true, slug: true, priceCents: true },
    });
    if (!plan) throw new BadRequestException('Plano inválido');

    // Provider chamado FORA da transação (rede).
    const { externalId } = await this.provider.createSubscription({
      tenantId,
      planSlug: plan.slug,
      priceCents: plan.priceCents,
    });

    return this.prisma.withTenant(tenantId, async (tx) => {
      const now = new Date();
      const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 86_400_000);
      const sub = await tx.subscription.upsert({
        where: { tenantId },
        create: {
          tenantId,
          planId: plan.id,
          status: 'TRIALING',
          trialEndsAt,
          currentPeriodEnd: trialEndsAt,
          externalId,
        },
        update: { planId: plan.id, status: 'TRIALING', externalId },
        select: SUB_SELECT,
      });
      await tx.platformInvoice.create({
        data: {
          tenantId,
          subscriptionId: sub.id,
          amountCents: plan.priceCents,
          status: 'PENDING',
          dueDate: trialEndsAt,
        },
      });
      return sub;
    });
  }

  async cancel(tenantId: string) {
    const sub = await this.prisma.withTenant(tenantId, (tx) =>
      tx.subscription.findUnique({
        where: { tenantId },
        select: { id: true, externalId: true },
      }),
    );
    if (!sub) throw new NotFoundException('Sem assinatura ativa');
    if (sub.externalId) await this.provider.cancelSubscription(sub.externalId);
    return this.prisma.withTenant(tenantId, async (tx) => {
      await tx.subscription.update({
        where: { id: sub.id },
        data: { status: 'CANCELED' },
      });
      await tx.tenant.update({
        where: { id: tenantId },
        data: { status: 'CANCELED' },
      });
      return { status: 'CANCELED' };
    });
  }

  /**
   * Webhook do provider (não autenticado). Resolve o tenant pela conexão de
   * sistema (bypassa RLS SÓ para o lookup) e processa sob o contexto do tenant.
   */
  async handleWebhook(dto: BillingWebhookDto) {
    const sub = await this.system.subscription.findFirst({
      where: { externalId: dto.externalId },
      select: { id: true, tenantId: true, planId: true },
    });
    if (!sub) throw new NotFoundException('Assinatura não encontrada');
    const tenantId = sub.tenantId;

    return this.prisma.withTenant(tenantId, async (tx) => {
      const plan = await tx.plan.findUnique({
        where: { id: sub.planId },
        select: { interval: true },
      });
      const periodEnd = addInterval(new Date(), plan?.interval ?? 'MONTHLY');

      switch (dto.event) {
        case 'approved': {
          await tx.platformInvoice.updateMany({
            where: { subscriptionId: sub.id, status: { in: ['PENDING', 'OVERDUE'] } },
            data: { status: 'PAID', paidAt: new Date() },
          });
          await tx.subscription.update({
            where: { id: sub.id },
            data: {
              status: 'ACTIVE',
              currentPeriodEnd: periodEnd,
            },
          });
          await tx.tenant.update({ where: { id: tenantId }, data: { status: 'ACTIVE' } });
          return { status: 'ACTIVE' };
        }
        case 'failed': {
          await tx.platformInvoice.updateMany({
            where: { subscriptionId: sub.id, status: 'PENDING' },
            data: { status: 'OVERDUE' },
          });
          await tx.subscription.update({
            where: { id: sub.id },
            data: { status: 'PAST_DUE' },
          });
          return { status: 'PAST_DUE' };
        }
        case 'suspend': {
          await tx.subscription.update({
            where: { id: sub.id },
            data: { status: 'PAST_DUE' },
          });
          await tx.tenant.update({
            where: { id: tenantId },
            data: { status: 'SUSPENDED' },
          });
          return { status: 'SUSPENDED' };
        }
      }
    });
  }
}

/** Quantos meses cada intervalo de plano avança. */
const INTERVAL_MONTHS: Record<string, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  YEARLY: 12,
};

/**
 * Avança a data pelo intervalo do plano, em MESES de calendário (não dias
 * fixos) — assim "mensal" cai sempre no mesmo dia do mês seguinte.
 */
export function addInterval(from: Date, interval: string): Date {
  const months = INTERVAL_MONTHS[interval] ?? 1;
  const d = new Date(from);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Corrige meses mais curtos (ex.: 31/jan + 1 mês → 28/fev, não 03/mar).
  if (d.getDate() < day) d.setDate(0);
  return d;
}
