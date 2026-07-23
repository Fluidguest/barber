import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListCommissionsDto } from './dto/list-commissions.dto';
import { ClosePeriodDto } from './dto/close-period.dto';

const SELECT = {
  id: true,
  barberId: true,
  saleId: true,
  saleItemId: true,
  baseCents: true,
  amountCents: true,
  status: true,
  periodRef: true,
} satisfies Prisma.CommissionEntrySelect;

@Injectable()
export class CommissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Gera os lançamentos de comissão de uma comanda PAGA. Chamado por
   * SalesService.close DENTRO da mesma transação (recebe `tx`).
   * Um lançamento por item que tem barbeiro; regra específica do barbeiro tem
   * prioridade sobre a regra padrão (barberId null).
   */
  async generateForSale(
    tx: Prisma.TransactionClient,
    tenantId: string,
    saleId: string,
    timezone: string,
  ): Promise<void> {
    const items = await tx.saleItem.findMany({
      where: { saleId, barberId: { not: null } },
      select: { id: true, barberId: true, totalCents: true },
    });
    if (items.length === 0) return;

    const rules = await tx.commissionRule.findMany({
      where: { isActive: true },
      select: { barberId: true, type: true, value: true },
    });
    if (rules.length === 0) return;

    const periodRef = monthInTimezone(new Date(), timezone);

    for (const item of items) {
      const barberId = item.barberId as string;
      const rule =
        rules.find((r) => r.barberId === barberId) ??
        rules.find((r) => r.barberId === null);
      if (!rule) continue;

      const amountCents =
        rule.type === 'PERCENT'
          ? Math.round((item.totalCents * rule.value) / 10000)
          : rule.value;

      await tx.commissionEntry.create({
        data: {
          tenantId,
          barberId,
          saleId,
          saleItemId: item.id, // @unique => idempotente por item
          baseCents: item.totalCents,
          amountCents,
          status: 'PENDING',
          periodRef,
        },
      });
    }
  }

  list(tenantId: string, q: ListCommissionsDto) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.commissionEntry.findMany({
        where: {
          ...(q.barberId ? { barberId: q.barberId } : {}),
          ...(q.periodRef ? { periodRef: q.periodRef } : {}),
          ...(q.status ? { status: q.status as any } : {}),
        },
        orderBy: { createdAt: 'desc' },
        select: SELECT,
      }),
    );
  }

  summary(tenantId: string, periodRef: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const grouped = await tx.commissionEntry.groupBy({
        by: ['barberId', 'status'],
        where: { periodRef },
        _sum: { amountCents: true },
        _count: { _all: true },
      });
      return grouped.map((g) => ({
        barberId: g.barberId,
        status: g.status,
        count: g._count._all,
        amountCents: g._sum.amountCents ?? 0,
      }));
    });
  }

  closePeriod(tenantId: string, dto: ClosePeriodDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const res = await tx.commissionEntry.updateMany({
        where: {
          periodRef: dto.periodRef,
          status: 'PENDING',
          ...(dto.barberId ? { barberId: dto.barberId } : {}),
        },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
      return { closed: res.count };
    });
  }
}

/** Retorna "YYYY-MM" no fuso da unidade (fecha comissão pelo mês local). */
function monthInTimezone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  return `${year}-${month}`;
}
