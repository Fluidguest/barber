import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** DRE simplificado: receitas e despesas realizadas por categoria no período. */
  dre(tenantId: string, from?: string, to?: string) {
    const { start, end } = range(from, to);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const cats = await tx.financeCategory.findMany({
        select: { id: true, name: true },
      });
      const nameOf = (id: string | null) =>
        cats.find((c) => c.id === id)?.name ?? 'Sem categoria';

      const finIncome = await tx.financeEntry.groupBy({
        by: ['categoryId'],
        where: { deletedAt: null, type: 'RECEIVABLE', status: 'PAID', paidAt: { gte: start, lt: end } },
        _sum: { amountCents: true },
      });
      const finExpense = await tx.financeEntry.groupBy({
        by: ['categoryId'],
        where: { deletedAt: null, type: 'PAYABLE', status: 'PAID', paidAt: { gte: start, lt: end } },
        _sum: { amountCents: true },
      });
      const pdv = await tx.payment.aggregate({
        where: { paidAt: { gte: start, lt: end }, sale: { status: 'PAID' } },
        _sum: { amountCents: true },
      });

      const income = [
        { label: 'Vendas (PDV)', amountCents: pdv._sum.amountCents ?? 0 },
        ...finIncome.map((r) => ({
          label: nameOf(r.categoryId),
          amountCents: r._sum.amountCents ?? 0,
        })),
      ].filter((l) => l.amountCents > 0);

      const expense = finExpense
        .map((r) => ({ label: nameOf(r.categoryId), amountCents: r._sum.amountCents ?? 0 }))
        .filter((l) => l.amountCents > 0);

      const totalIncomeCents = income.reduce((a, l) => a + l.amountCents, 0);
      const totalExpenseCents = expense.reduce((a, l) => a + l.amountCents, 0);

      return {
        period: { from: start, to: end },
        income,
        expense,
        totalIncomeCents,
        totalExpenseCents,
        resultCents: totalIncomeCents - totalExpenseCents,
      };
    });
  }

  /** Ranking de barbeiros: atendimentos concluídos, faturamento em serviços, comissão. */
  barbers(tenantId: string, from?: string, to?: string) {
    const { start, end } = range(from, to);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const barbers = await tx.barber.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
      });

      const saleIds = await paidSaleIds(tx, start, end);
      const done = await tx.appointment.groupBy({
        by: ['barberId'],
        where: { deletedAt: null, status: 'DONE', startAt: { gte: start, lt: end } },
        _count: { _all: true },
      });
      const revenue = saleIds.length
        ? await tx.saleItem.groupBy({
            by: ['barberId'],
            where: { barberId: { not: null }, saleId: { in: saleIds } },
            _sum: { totalCents: true },
          })
        : [];
      const commission = await tx.commissionEntry.groupBy({
        by: ['barberId'],
        where: { createdAt: { gte: start, lt: end } },
        _sum: { amountCents: true },
      });

      const rows = barbers.map((b) => ({
        barberId: b.id,
        name: b.name,
        appointmentsDone: done.find((d) => d.barberId === b.id)?._count._all ?? 0,
        revenueCents: revenue.find((r) => r.barberId === b.id)?._sum.totalCents ?? 0,
        commissionCents: commission.find((c) => c.barberId === b.id)?._sum.amountCents ?? 0,
      }));
      rows.sort((a, b) => b.revenueCents - a.revenueCents);
      return { period: { from: start, to: end }, rows };
    });
  }

  /** Curva ABC de produtos por faturamento no período. */
  productsAbc(tenantId: string, from?: string, to?: string) {
    const { start, end } = range(from, to);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const saleIds = await paidSaleIds(tx, start, end);
      const grouped = saleIds.length
        ? await tx.saleItem.groupBy({
            by: ['productId'],
            where: { productId: { not: null }, saleId: { in: saleIds } },
            _sum: { totalCents: true, quantity: true },
          })
        : [];
      const products = await tx.product.findMany({ select: { id: true, name: true } });
      const nameOf = (id: string | null) =>
        products.find((p) => p.id === id)?.name ?? 'Produto';

      const items = grouped
        .map((g) => ({
          productId: g.productId as string,
          name: nameOf(g.productId),
          revenueCents: g._sum.totalCents ?? 0,
          quantity: g._sum.quantity ?? 0,
        }))
        .sort((a, b) => b.revenueCents - a.revenueCents);

      const total = items.reduce((a, i) => a + i.revenueCents, 0);
      let cumulative = 0;
      const rows = items.map((i) => {
        // Classifica pelo acumulado ANTES do item: o que cruza o limite fica na
        // faixa que estava sendo atingida (o 1º/único produto é sempre 'A').
        const cumPctBefore = total ? cumulative / total : 0;
        cumulative += i.revenueCents;
        const curve = cumPctBefore < 0.8 ? 'A' : cumPctBefore < 0.95 ? 'B' : 'C';
        return { ...i, curve };
      });

      return { period: { from: start, to: end }, totalRevenueCents: total, rows };
    });
  }

  /**
   * Clientes inativos: sem serviço nos últimos `days` dias.
   *
   * "Teve serviço" = comanda paga (PDV) OU atendimento concluído (DONE) — o que
   * for mais recente vira a "última visita". Clientes cadastrados DEPOIS do
   * corte e que nunca foram atendidos não entram (são novos, não inativos).
   */
  inactiveClients(tenantId: string, days: number) {
    const cutoff = new Date(Date.now() - days * 86_400_000);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const clients = await tx.client.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, phone: true, whatsapp: true, createdAt: true },
      });

      // Última comanda paga e último atendimento concluído, por cliente.
      const [lastSales, lastAppts] = await Promise.all([
        tx.sale.groupBy({
          by: ['clientId'],
          where: { status: 'PAID', clientId: { not: null } },
          _max: { updatedAt: true },
        }),
        tx.appointment.groupBy({
          by: ['clientId'],
          where: { status: 'DONE', deletedAt: null },
          _max: { startAt: true },
        }),
      ]);
      const saleBy = new Map(lastSales.map((r) => [r.clientId, r._max.updatedAt]));
      const apptBy = new Map(lastAppts.map((r) => [r.clientId, r._max.startAt]));

      const rows = clients
        .map((c) => {
          const dates = [saleBy.get(c.id), apptBy.get(c.id)].filter(Boolean) as Date[];
          const lastServiceAt = dates.length
            ? new Date(Math.max(...dates.map((d) => d.getTime())))
            : null;
          const daysSince = lastServiceAt
            ? Math.floor((Date.now() - lastServiceAt.getTime()) / 86_400_000)
            : null;
          return {
            clientId: c.id,
            name: c.name,
            phone: c.whatsapp ?? c.phone,
            lastServiceAt,
            daysSince,
            createdAt: c.createdAt,
          };
        })
        .filter((r) =>
          r.lastServiceAt
            ? r.lastServiceAt < cutoff // atendido, mas há mais de N dias
            : r.createdAt < cutoff,    // nunca atendido e já não é novo
        )
        // Mais inativos primeiro (nunca atendidos ao final, com daysSince null).
        .sort((a, b) => (b.daysSince ?? Infinity) - (a.daysSince ?? Infinity));

      return { days, cutoff, total: rows.length, rows };
    });
  }
}

/** IDs de comandas pagas na janela (evita filtro por relação no groupBy). */
async function paidSaleIds(
  tx: Prisma.TransactionClient,
  start: Date,
  end: Date,
): Promise<string[]> {
  const sales = await tx.sale.findMany({
    where: { status: 'PAID', updatedAt: { gte: start, lt: end } },
    select: { id: true },
  });
  return sales.map((s) => s.id);
}

/** Janela de datas; default = mês corrente. */
function range(from?: string, to?: string): { start: Date; end: Date } {
  const now = new Date();
  const start = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = to
    ? new Date(to)
    : new Date(start.getFullYear(), start.getMonth() + 1, 1);
  return { start, end };
}
