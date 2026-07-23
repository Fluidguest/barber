import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OpenCashDto } from './dto/open-cash.dto';
import { CloseCashDto } from './dto/close-cash.dto';

const SELECT = {
  id: true,
  unitId: true,
  status: true,
  openingCents: true,
  closingCents: true,
  openedById: true,
  openedAt: true,
  closedAt: true,
} satisfies Prisma.CashSessionSelect;

@Injectable()
export class CashSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  open(tenantId: string, userId: string, dto: OpenCashDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const unitId = await defaultUnit(tx);
      const already = await tx.cashSession.findFirst({
        where: { unitId, status: 'OPEN' },
        select: { id: true },
      });
      if (already) {
        throw new ConflictException('Já existe um caixa aberto para esta unidade');
      }
      try {
        return await tx.cashSession.create({
          data: {
            tenantId,
            unitId,
            openedById: userId,
            status: 'OPEN',
            openingCents: dto.openingCents ?? 0,
          },
          select: SELECT,
        });
      } catch (e) {
        // índice único parcial: corrida entre dois "abrir caixa"
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          throw new ConflictException(
            'Já existe um caixa aberto para esta unidade',
          );
        }
        throw e;
      }
    });
  }

  async current(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const unitId = await defaultUnit(tx);
      return tx.cashSession.findFirst({
        where: { unitId, status: 'OPEN' },
        select: SELECT,
      });
    });
  }

  async summary(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const session = await tx.cashSession.findFirst({
        where: { id },
        select: SELECT,
      });
      if (!session) throw new NotFoundException('Caixa não encontrado');
      const totals = await sessionTotals(tx, id, session.openingCents);
      return { ...session, ...totals };
    });
  }

  close(tenantId: string, id: string, dto: CloseCashDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const session = await tx.cashSession.findFirst({
        where: { id, status: 'OPEN' },
        select: { id: true, openingCents: true },
      });
      if (!session) {
        throw new NotFoundException('Caixa aberto não encontrado');
      }
      const totals = await sessionTotals(tx, id, session.openingCents);
      const updated = await tx.cashSession.update({
        where: { id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          closingCents: dto.closingCents,
        },
        select: SELECT,
      });
      return {
        ...updated,
        ...totals,
        countedCashCents: dto.closingCents,
        cashDifferenceCents: dto.closingCents - totals.expectedCashCents,
      };
    });
  }
}

async function defaultUnit(tx: Prisma.TransactionClient): Promise<string> {
  const unit = await tx.unit.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!unit) throw new BadRequestException('Nenhuma unidade cadastrada');
  return unit.id;
}

/** Soma pagamentos das comandas PAGAS da sessão, por método, e caixa esperado. */
async function sessionTotals(
  tx: Prisma.TransactionClient,
  sessionId: string,
  openingCents: number,
) {
  const sales = await tx.sale.findMany({
    where: { cashSessionId: sessionId, status: 'PAID' },
    select: { id: true },
  });
  const saleIds = sales.map((s) => s.id);
  const byMethod = saleIds.length
    ? await tx.payment.groupBy({
        by: ['method'],
        where: { saleId: { in: saleIds } },
        _sum: { amountCents: true },
      })
    : [];
  const paymentsByMethod = byMethod.map((m) => ({
    method: m.method,
    amountCents: m._sum.amountCents ?? 0,
  }));
  const totalPaidCents = paymentsByMethod.reduce(
    (acc, m) => acc + m.amountCents,
    0,
  );
  const cashCents =
    paymentsByMethod.find((m) => m.method === 'CASH')?.amountCents ?? 0;
  return {
    salesCount: saleIds.length,
    totalPaidCents,
    paymentsByMethod,
    expectedCashCents: openingCents + cashCents,
  };
}
