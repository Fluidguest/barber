import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFinanceCategoryDto } from './dto/create-category.dto';
import { CreateFinanceEntryDto } from './dto/create-entry.dto';
import { UpdateFinanceEntryDto } from './dto/update-entry.dto';
import { PayEntryDto } from './dto/pay-entry.dto';
import { ListEntriesDto } from './dto/list-entries.dto';
import { buildPage, pageArgs } from '../common/pagination';
import { monthRangeUtc } from '../common/tz';

const ENTRY = {
  id: true,
  type: true,
  description: true,
  amountCents: true,
  dueDate: true,
  status: true,
  categoryId: true,
  costCenter: true,
  method: true,
  paidAt: true,
  notes: true,
} satisfies Prisma.FinanceEntrySelect;

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Categorias --------------------------------------------------------

  createCategory(tenantId: string, dto: CreateFinanceCategoryDto) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.financeCategory.create({
        data: { tenantId, name: dto.name, kind: dto.kind },
        select: { id: true, name: true, kind: true },
      }),
    );
  }

  listCategories(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.financeCategory.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, kind: true },
      }),
    );
  }

  // ---- Lançamentos -------------------------------------------------------

  createEntry(tenantId: string, dto: CreateFinanceEntryDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      await assertCategory(tx, dto.categoryId, dto.type);
      return tx.financeEntry.create({
        data: {
          tenantId,
          type: dto.type,
          description: dto.description,
          amountCents: dto.amountCents,
          dueDate: new Date(dto.dueDate),
          categoryId: dto.categoryId,
          costCenter: dto.costCenter,
          method: dto.method,
          notes: dto.notes,
        },
        select: ENTRY,
      });
    });
  }

  listEntries(tenantId: string, q: ListEntriesDto) {
    const pa = pageArgs(q, 50, 200);
    const where: Prisma.FinanceEntryWhereInput = {
      deletedAt: null,
      ...(q.type ? { type: q.type } : {}),
      ...(q.status ? { status: q.status as any } : {}),
      ...(q.from || q.to
        ? {
            [q.dateField ?? 'dueDate']: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {}),
            },
          }
        : {}),
    };
    return this.prisma.withTenant(tenantId, async (tx) => {
      const items = await tx.financeEntry.findMany({
        where,
        orderBy: { dueDate: 'asc' },
        skip: pa.skip,
        take: pa.take,
        select: ENTRY,
      });
      if (!pa.paginate) return items; // compatível: sem page → array
      const total = await tx.financeEntry.count({ where });
      return buildPage(items, total, pa.page, pa.pageSize);
    });
  }

  async getEntry(tenantId: string, id: string) {
    const entry = await this.prisma.withTenant(tenantId, (tx) =>
      tx.financeEntry.findFirst({ where: { id, deletedAt: null }, select: ENTRY }),
    );
    if (!entry) throw new NotFoundException('Lançamento não encontrado');
    return entry;
  }

  updateEntry(tenantId: string, id: string, dto: UpdateFinanceEntryDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const exists = await tx.financeEntry.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, status: true, type: true },
      });
      if (!exists) throw new NotFoundException('Lançamento não encontrado');
      if (exists.status === 'PAID') {
        throw new BadRequestException('Lançamento já pago não pode ser editado');
      }
      await assertCategory(tx, dto.categoryId, exists.type);
      return tx.financeEntry.update({
        where: { id },
        data: {
          description: dto.description,
          amountCents: dto.amountCents,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          categoryId: dto.categoryId,
          costCenter: dto.costCenter,
          notes: dto.notes,
        },
        select: ENTRY,
      });
    });
  }

  pay(tenantId: string, id: string, dto: PayEntryDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const entry = await tx.financeEntry.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, status: true },
      });
      if (!entry) throw new NotFoundException('Lançamento não encontrado');
      if (entry.status !== 'PENDING') {
        throw new BadRequestException('Lançamento não está pendente');
      }
      return tx.financeEntry.update({
        where: { id },
        data: {
          status: 'PAID',
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          method: dto.method,
        },
        select: ENTRY,
      });
    });
  }

  /** Cancela um lançamento pendente (mantém o registro, status CANCELED). */
  cancel(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const entry = await tx.financeEntry.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, status: true },
      });
      if (!entry) throw new NotFoundException('Lançamento não encontrado');
      if (entry.status !== 'PENDING') {
        throw new BadRequestException('Só é possível cancelar lançamentos pendentes');
      }
      return tx.financeEntry.update({
        where: { id },
        data: { status: 'CANCELED' },
        select: ENTRY,
      });
    });
  }

  async remove(tenantId: string, id: string) {
    await this.prisma.withTenant(tenantId, async (tx) => {
      const exists = await tx.financeEntry.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Lançamento não encontrado');
      await tx.financeEntry.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
    return { deleted: true };
  }

  // ---- Fluxo de caixa (previsto vs realizado) ----------------------------

  cashflow(tenantId: string, from?: string, to?: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      // Período padrão = mês corrente no fuso da unidade (consistente c/ Dashboard).
      let start: Date;
      let end: Date;
      if (from || to) {
        const now = new Date();
        start = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
        end = to ? new Date(to) : new Date(start.getFullYear(), start.getMonth() + 1, 1);
      } else {
        const unit = await tx.unit.findFirst({
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: { timezone: true },
        });
        ({ start, end } = monthRangeUtc(unit?.timezone ?? 'America/Sao_Paulo'));
      }
      // Receita realizada do PDV (pagamentos de comandas pagas).
      const salesIncome = await tx.payment.aggregate({
        where: { paidAt: { gte: start, lt: end }, sale: { status: 'PAID' } },
        _sum: { amountCents: true },
      });
      // Receitas/despesas realizadas do módulo financeiro.
      const finRealizedIncome = await sum(tx, 'RECEIVABLE', 'PAID', 'paidAt', start, end);
      const finRealizedExpense = await sum(tx, 'PAYABLE', 'PAID', 'paidAt', start, end);
      // Previsto (pendentes por vencimento).
      const forecastIncome = await sum(tx, 'RECEIVABLE', 'PENDING', 'dueDate', start, end);
      const forecastExpense = await sum(tx, 'PAYABLE', 'PENDING', 'dueDate', start, end);

      const salesIncomeCents = salesIncome._sum.amountCents ?? 0;
      const realizedIncomeCents = salesIncomeCents + finRealizedIncome;
      const realizedExpenseCents = finRealizedExpense;
      const forecastIncomeCents = forecastIncome;
      const forecastExpenseCents = forecastExpense;

      return {
        period: { from: start, to: end },
        salesIncomeCents,
        realizedIncomeCents,
        realizedExpenseCents,
        realizedBalanceCents: realizedIncomeCents - realizedExpenseCents,
        forecastIncomeCents,
        forecastExpenseCents,
        forecastBalanceCents: forecastIncomeCents - forecastExpenseCents,
      };
    });
  }
}

async function sum(
  tx: Prisma.TransactionClient,
  type: 'PAYABLE' | 'RECEIVABLE',
  status: 'PAID' | 'PENDING',
  dateField: 'paidAt' | 'dueDate',
  start: Date,
  end: Date,
) {
  const agg = await tx.financeEntry.aggregate({
    where: {
      deletedAt: null,
      type,
      status,
      [dateField]: { gte: start, lt: end },
    },
    _sum: { amountCents: true },
  });
  return agg._sum.amountCents ?? 0;
}

/** Valida a categoria: existe no tenant e o KIND combina com o TIPO do lançamento. */
async function assertCategory(
  tx: Prisma.TransactionClient,
  categoryId?: string,
  type?: 'PAYABLE' | 'RECEIVABLE',
) {
  if (!categoryId) return;
  const cat = await tx.financeCategory.findFirst({
    where: { id: categoryId, deletedAt: null },
    select: { id: true, kind: true },
  });
  if (!cat) throw new BadRequestException('Categoria inválida');
  if (type) {
    const expected = type === 'PAYABLE' ? 'EXPENSE' : 'INCOME';
    if (cat.kind !== expected) {
      throw new BadRequestException(
        `Categoria de ${cat.kind === 'EXPENSE' ? 'despesa' : 'receita'} não combina com conta ${type === 'PAYABLE' ? 'a pagar' : 'a receber'}`,
      );
    }
  }
}
