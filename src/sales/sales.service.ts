import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CommissionsService } from '../commissions/commissions.service';
import { StockService } from '../stock/stock.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { AddItemDto } from './dto/add-item.dto';
import { AddPaymentDto } from './dto/add-payment.dto';

const DETAIL = {
  id: true,
  status: true,
  subtotalCents: true,
  adjustmentMode: true,
  adjustmentValue: true,
  adjustmentCents: true,
  clientCreditCents: true,
  totalCents: true,
  clientId: true,
  barberId: true,
  appointmentId: true,
  cashSessionId: true,
  items: {
    select: {
      id: true,
      description: true,
      quantity: true,
      unitPriceCents: true,
      totalCents: true,
      serviceId: true,
      productId: true,
      barberId: true,
    },
  },
  payments: {
    select: { id: true, method: true, amountCents: true, paidAt: true },
  },
} satisfies Prisma.SaleSelect;

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commissions: CommissionsService,
    private readonly stock: StockService,
  ) {}

  create(tenantId: string, dto: CreateSaleDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const unit = await tx.unit.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (!unit) throw new BadRequestException('Nenhuma unidade cadastrada');

      const session = await tx.cashSession.findFirst({
        where: { unitId: unit.id, status: 'OPEN' },
        select: { id: true },
      });
      if (!session) {
        throw new ConflictException(
          'Abra o caixa antes de iniciar uma comanda',
        );
      }

      await assertRef(tx, 'client', dto.clientId, 'Cliente inválido');
      await assertRef(tx, 'barber', dto.barberId, 'Barbeiro inválido');
      await assertRef(
        tx,
        'appointment',
        dto.appointmentId,
        'Atendimento inválido',
      );

      try {
        return await tx.sale.create({
          data: {
            tenantId,
            unitId: unit.id,
            cashSessionId: session.id,
            clientId: dto.clientId,
            barberId: dto.barberId,
            appointmentId: dto.appointmentId,
            status: 'OPEN',
            totalCents: 0,
          },
          select: DETAIL,
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          throw new ConflictException(
            'Este atendimento já possui uma comanda',
          );
        }
        throw e;
      }
    });
  }

  addItem(tenantId: string, saleId: string, dto: AddItemDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      await this.assertOpenSale(tx, saleId);

      let description = dto.description;
      let unitPriceCents = dto.unitPriceCents;
      const quantity = dto.quantity ?? 1;

      if (dto.serviceId) {
        const svc = await tx.service.findFirst({
          where: { id: dto.serviceId, deletedAt: null },
          select: { name: true, priceCents: true },
        });
        if (!svc) throw new BadRequestException('Serviço inválido');
        description = description ?? svc.name;
        unitPriceCents = unitPriceCents ?? svc.priceCents;
      }
      if (dto.productId) {
        const product = await tx.product.findFirst({
          where: { id: dto.productId, deletedAt: null },
          select: { name: true, priceCents: true },
        });
        if (!product) throw new BadRequestException('Produto inválido');
        description = description ?? product.name;
        unitPriceCents = unitPriceCents ?? product.priceCents;
        // Baixa o estoque na MESMA transação (rejeita se insuficiente).
        await this.stock.consumeForSale(
          tx,
          tenantId,
          dto.productId,
          quantity,
          saleId,
        );
      }
      if (!description || unitPriceCents == null) {
        throw new BadRequestException(
          'Item avulso exige descrição e preço unitário',
        );
      }
      await assertRef(tx, 'barber', dto.barberId, 'Barbeiro inválido');

      await tx.saleItem.create({
        data: {
          tenantId,
          saleId,
          serviceId: dto.serviceId,
          productId: dto.productId,
          barberId: dto.barberId,
          description,
          quantity,
          unitPriceCents,
          totalCents: unitPriceCents * quantity,
        },
      });
      return this.recompute(tx, saleId);
    });
  }

  removeItem(tenantId: string, saleId: string, itemId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      await this.assertOpenSale(tx, saleId);
      const item = await tx.saleItem.findFirst({
        where: { id: itemId, saleId },
        select: { id: true, productId: true, quantity: true },
      });
      if (!item) throw new NotFoundException('Item não encontrado');
      await tx.saleItem.delete({ where: { id: itemId } });
      // Se era produto, devolve ao estoque.
      if (item.productId) {
        await this.stock.restoreFromSale(
          tx,
          tenantId,
          item.productId,
          item.quantity,
          saleId,
        );
      }
      return this.recompute(tx, saleId);
    });
  }

  addPayment(tenantId: string, saleId: string, dto: AddPaymentDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      await this.assertOpenSale(tx, saleId);
      await tx.payment.create({
        data: {
          tenantId,
          saleId,
          method: dto.method,
          amountCents: dto.amountCents,
        },
      });
      return this.detail(tx, saleId);
    });
  }

  close(tenantId: string, saleId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId, deletedAt: null },
        select: {
          id: true,
          status: true,
          subtotalCents: true,
          totalCents: true,
          clientId: true,
          clientCreditCents: true,
          appointmentId: true,
          unit: { select: { timezone: true } },
        },
      });
      if (!sale) throw new NotFoundException('Comanda não encontrada');
      if (sale.status !== 'OPEN') {
        throw new BadRequestException('Comanda não está aberta');
      }
      if (sale.subtotalCents <= 0) {
        throw new BadRequestException('Comanda sem itens');
      }
      const agg = await tx.payment.aggregate({
        where: { saleId },
        _sum: { amountCents: true },
      });
      const paid = agg._sum.amountCents ?? 0;
      if (paid < sale.totalCents) {
        throw new BadRequestException(
          `Pagamento insuficiente: faltam ${sale.totalCents - paid} centavos`,
        );
      }
      const updated = await tx.sale.update({
        where: { id: saleId },
        data: { status: 'PAID' },
        select: DETAIL,
      });
      // Baixa o crédito de desconto usado do saldo do cliente.
      if (sale.clientId && sale.clientCreditCents > 0) {
        await tx.client.update({
          where: { id: sale.clientId },
          data: { discountBalanceCents: { decrement: sale.clientCreditCents } },
        });
      }
      // Se veio da agenda, marca o atendimento como concluído.
      if (sale.appointmentId) {
        await tx.appointment.updateMany({
          where: { id: sale.appointmentId, status: { notIn: ['CANCELED', 'DONE'] } },
          data: { status: 'DONE' },
        });
      }
      // Gera comissões automaticamente (mesma transação).
      await this.commissions.generateForSale(
        tx,
        tenantId,
        saleId,
        sale.unit.timezone,
      );
      return updated;
    });
  }

  async get(tenantId: string, saleId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const sale = await this.detail(tx, saleId).catch(() => null);
      if (!sale) throw new NotFoundException('Comanda não encontrada');
      return sale;
    });
  }

  private async assertOpenSale(tx: Prisma.TransactionClient, saleId: string) {
    const sale = await tx.sale.findFirst({
      where: { id: saleId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!sale) throw new NotFoundException('Comanda não encontrada');
    if (sale.status !== 'OPEN') {
      throw new BadRequestException('Comanda não está aberta');
    }
  }

  /**
   * Recalcula subtotal (itens) → ajuste (desconto/acréscimo) → total.
   *
   * O ajuste PERCENT é recalculado sobre o novo subtotal a cada mudança de item;
   * o FIXED é mantido. O total nunca fica negativo.
   */
  private async recompute(tx: Prisma.TransactionClient, saleId: string) {
    const agg = await tx.saleItem.aggregate({
      where: { saleId },
      _sum: { totalCents: true },
    });
    const subtotal = agg._sum.totalCents ?? 0;

    const sale = await tx.sale.findFirst({
      where: { id: saleId },
      select: { adjustmentMode: true, adjustmentValue: true, clientId: true },
    });
    const adjustmentCents = computeAdjustment(
      subtotal,
      sale?.adjustmentMode,
      sale?.adjustmentValue ?? 0,
    );
    const afterAdjustment = Math.max(0, subtotal + adjustmentCents);

    // Crédito do cliente aplicado automaticamente: usa o saldo dele, limitado
    // ao que resta a pagar. É baixado do saldo somente ao FECHAR a comanda.
    let clientCreditCents = 0;
    if (sale?.clientId) {
      const client = await tx.client.findFirst({
        where: { id: sale.clientId, deletedAt: null },
        select: { discountBalanceCents: true },
      });
      clientCreditCents = Math.min(client?.discountBalanceCents ?? 0, afterAdjustment);
    }

    await tx.sale.update({
      where: { id: saleId },
      data: {
        subtotalCents: subtotal,
        adjustmentCents,
        clientCreditCents,
        totalCents: Math.max(0, afterAdjustment - clientCreditCents),
      },
    });
    return this.detail(tx, saleId);
  }

  /**
   * Define (ou remove) o acréscimo/desconto da comanda.
   * `mode`: 'PERCENT' (valor em % ) | 'FIXED' (valor em reais→centavos) | null.
   * `value` assinado: negativo = desconto, positivo = acréscimo.
   */
  setAdjustment(
    tenantId: string,
    saleId: string,
    dto: { mode: 'PERCENT' | 'FIXED' | null; value: number },
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      await this.assertOpenSale(tx, saleId);
      // PERCENT guarda pontos-base (10% → 1000); FIXED guarda centavos.
      const stored =
        dto.mode === 'PERCENT'
          ? Math.round(dto.value * 100)
          : dto.mode === 'FIXED'
            ? Math.round(dto.value * 100)
            : 0;
      if (dto.mode === 'PERCENT' && Math.abs(dto.value) > 100) {
        throw new BadRequestException('Percentual deve estar entre -100% e 100%');
      }
      await tx.sale.update({
        where: { id: saleId },
        data: {
          adjustmentMode: dto.mode,
          adjustmentValue: dto.mode ? stored : 0,
        },
      });
      return this.recompute(tx, saleId);
    });
  }

  private async detail(tx: Prisma.TransactionClient, saleId: string) {
    const sale = await tx.sale.findFirst({
      where: { id: saleId, deletedAt: null },
      select: DETAIL,
    });
    if (!sale) throw new NotFoundException('Comanda não encontrada');
    return sale;
  }
}

/**
 * Efeito do ajuste sobre o subtotal, em centavos (assinado).
 * PERCENT: `value` em pontos-base (1000 = 10%). FIXED: `value` em centavos.
 */
function computeAdjustment(
  subtotal: number,
  mode: string | null | undefined,
  value: number,
): number {
  if (!mode || !value) return 0;
  if (mode === 'PERCENT') return Math.round((subtotal * value) / 10000);
  return value; // FIXED já está em centavos
}

/** Valida que a entidade referenciada existe dentro do tenant (RLS ativa). */
async function assertRef(
  tx: Prisma.TransactionClient,
  model: 'client' | 'barber' | 'appointment',
  id: string | undefined,
  message: string,
) {
  if (!id) return;
  const where = { id, deletedAt: null } as { id: string; deletedAt: null };
  const found =
    model === 'client'
      ? await tx.client.findFirst({ where, select: { id: true } })
      : model === 'barber'
        ? await tx.barber.findFirst({ where, select: { id: true } })
        : await tx.appointment.findFirst({ where, select: { id: true } });
  if (!found) throw new BadRequestException(message);
}
