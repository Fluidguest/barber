import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** Indicadores do dia (ou de uma data YYYY-MM-DD) no fuso da unidade. */
  today(tenantId: string, dateStr?: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const unit = await tx.unit.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, timezone: true },
      });
      const timezone = unit?.timezone ?? 'America/Sao_Paulo';
      const { start, end } = localDayRangeUtc(timezone, dateStr);
      const range = { gte: start, lt: end };

      // Faturamento = pagamentos recebidos hoje em comandas pagas.
      const revenue = await tx.payment.aggregate({
        where: { paidAt: range, sale: { status: 'PAID' } },
        _sum: { amountCents: true },
      });
      const revenueCents = revenue._sum.amountCents ?? 0;

      const paidSales = await tx.sale.count({
        where: { status: 'PAID', updatedAt: range },
      });

      // Sequencial: a mesma transação não roda queries em paralelo.
      const total = await this.countAppointments(tx, range);
      const done = await this.countAppointments(tx, range, 'DONE');
      const missed = await this.countAppointments(tx, range, ['CANCELED', 'NO_SHOW']);

      const activeBarbers = await tx.barber.count({ where: { deletedAt: null } });
      const newClients = await tx.client.count({
        where: { deletedAt: null, createdAt: range },
      });
      const commissions = await tx.commissionEntry.aggregate({
        where: { createdAt: range },
        _sum: { amountCents: true },
      });

      const openCash = await tx.cashSession.findFirst({
        where: { unitId: unit?.id, status: 'OPEN' },
        select: { id: true, openedAt: true, openingCents: true },
      });

      const agenda = await tx.appointment.findMany({
        where: { deletedAt: null, startAt: range },
        orderBy: { startAt: 'asc' },
        select: {
          id: true,
          startAt: true,
          endAt: true,
          status: true,
          barberId: true,
          clientId: true,
        },
      });

      return {
        period: { from: start, to: end, timezone },
        revenueCents,
        paidSales,
        averageTicketCents: paidSales ? Math.round(revenueCents / paidSales) : 0,
        appointments: { total, done, missed },
        activeBarbers,
        newClients,
        commissionsGeneratedCents: commissions._sum.amountCents ?? 0,
        cashOpen: openCash,
        agenda,
      };
    });
  }

  private countAppointments(
    tx: Prisma.TransactionClient,
    range: { gte: Date; lt: Date },
    status?: string | string[],
  ) {
    return tx.appointment.count({
      where: {
        deletedAt: null,
        startAt: range,
        ...(Array.isArray(status)
          ? { status: { in: status as any } }
          : status
            ? { status: status as any }
            : {}),
      },
    });
  }
}

/** Deslocamento (ms) do fuso em relação a UTC, no instante `date`. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let hour = g('hour');
  if (hour === 24) hour = 0;
  const asUTC = Date.UTC(g('year'), g('month') - 1, g('day'), hour, g('minute'), g('second'));
  return asUTC - date.getTime();
}

/**
 * Intervalo [00:00, 24:00) do dia local (no fuso `tz`) expresso em UTC.
 * `dateStr` (YYYY-MM-DD) opcional; default = hoje.
 */
function localDayRangeUtc(
  tz: string,
  dateStr?: string,
): { start: Date; end: Date } {
  const now = new Date();
  let y: number;
  let m: number;
  let d: number;
  if (dateStr) {
    [y, m, d] = dateStr.split('-').map(Number);
  } else {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    y = g('year');
    m = g('month');
    d = g('day');
  }
  const offset = tzOffsetMs(now, tz);
  const startAsUTC = Date.UTC(y, m - 1, d, 0, 0, 0);
  const start = new Date(startAsUTC - offset);
  const end = new Date(start.getTime() + 86_400_000);
  return { start, end };
}
