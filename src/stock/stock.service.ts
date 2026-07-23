import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { AdjustStockDto, MoveStockDto } from './dto/move-stock.dto';

const PRODUCT = {
  id: true,
  name: true,
  sku: true,
  barcode: true,
  brand: true,
  supplier: true,
  category: true,
  unit: true,
  costCents: true,
  priceCents: true,
  stockCurrent: true,
  stockMin: true,
  expiresAt: true,
  isActive: true,
} satisfies Prisma.ProductSelect;

const EXPIRY_WINDOW_DAYS = 30;

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  createProduct(tenantId: string, dto: CreateProductDto) {
    const initial = dto.stockCurrent ?? 0;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const product = await tx.product.create({
        data: {
          tenantId,
          name: dto.name,
          sku: dto.sku,
          barcode: dto.barcode,
          brand: dto.brand,
          supplier: dto.supplier,
          category: dto.category,
          unit: dto.unit ?? 'un',
          costCents: dto.costCents ?? 0,
          priceCents: dto.priceCents ?? 0,
          stockCurrent: initial,
          stockMin: dto.stockMin ?? 0,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        },
        select: PRODUCT,
      });
      if (initial > 0) {
        await tx.stockMovement.create({
          data: {
            tenantId,
            productId: product.id,
            type: 'IN',
            quantity: initial,
            reason: 'compra',
            unitCostCents: dto.costCents,
            notes: 'Estoque inicial',
          },
        });
      }
      return product;
    });
  }

  listProducts(tenantId: string, search?: string, lowStock?: boolean) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const products = await tx.product.findMany({
        where: {
          deletedAt: null,
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: 'insensitive' } },
                  { barcode: { contains: search } },
                  { sku: { contains: search } },
                ],
              }
            : {}),
        },
        orderBy: { name: 'asc' },
        select: PRODUCT,
      });
      return lowStock
        ? products.filter((p) => p.stockCurrent <= p.stockMin)
        : products;
    });
  }

  async getProduct(tenantId: string, id: string) {
    const product = await this.prisma.withTenant(tenantId, (tx) =>
      tx.product.findFirst({ where: { id, deletedAt: null }, select: PRODUCT }),
    );
    if (!product) throw new NotFoundException('Produto não encontrado');
    return product;
  }

  updateProduct(tenantId: string, id: string, dto: UpdateProductDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const exists = await tx.product.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Produto não encontrado');
      return tx.product.update({
        where: { id },
        data: {
          name: dto.name,
          sku: dto.sku,
          barcode: dto.barcode,
          brand: dto.brand,
          supplier: dto.supplier,
          category: dto.category,
          unit: dto.unit,
          costCents: dto.costCents,
          priceCents: dto.priceCents,
          stockMin: dto.stockMin,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
          isActive: dto.isActive,
        },
        select: PRODUCT,
      });
    });
  }

  async removeProduct(tenantId: string, id: string) {
    await this.prisma.withTenant(tenantId, async (tx) => {
      const exists = await tx.product.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Produto não encontrado');
      await tx.product.update({ where: { id }, data: { deletedAt: new Date() } });
    });
    return { deleted: true };
  }

  move(tenantId: string, id: string, dto: MoveStockDto) {
    return this.prisma.withTenant(tenantId, (tx) =>
      applyMovement(tx, tenantId, id, dto.type, dto.quantity, {
        reason: dto.reason,
        unitCostCents: dto.unitCostCents,
        notes: dto.notes,
      }),
    );
  }

  adjust(tenantId: string, id: string, dto: AdjustStockDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const product = await tx.product.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, stockCurrent: true },
      });
      if (!product) throw new NotFoundException('Produto não encontrado');
      const delta = dto.targetStock - product.stockCurrent;
      if (delta === 0) return this.getProductTx(tx, id);
      return applyMovement(
        tx,
        tenantId,
        id,
        delta > 0 ? 'IN' : 'OUT',
        Math.abs(delta),
        { reason: 'inventario', notes: dto.notes },
      );
    });
  }

  listMovements(tenantId: string, productId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.stockMovement.findMany({
        where: { productId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          quantity: true,
          reason: true,
          unitCostCents: true,
          notes: true,
          createdAt: true,
        },
      }),
    );
  }

  alerts(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const products = await tx.product.findMany({
        where: { deletedAt: null, isActive: true },
        select: PRODUCT,
      });
      const limit = new Date(Date.now() + EXPIRY_WINDOW_DAYS * 86_400_000);
      return {
        lowStock: products.filter((p) => p.stockCurrent <= p.stockMin),
        expiringSoon: products.filter(
          (p) => p.expiresAt && new Date(p.expiresAt) <= limit,
        ),
      };
    });
  }

  private getProductTx(tx: Prisma.TransactionClient, id: string) {
    return tx.product.findFirst({ where: { id }, select: PRODUCT });
  }

  // ---- Integração com o PDV (chamado DENTRO da tx da venda) --------------

  /** Baixa estoque por venda de produto na comanda. */
  consumeForSale(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productId: string,
    quantity: number,
    saleId: string,
  ) {
    return applyMovement(tx, tenantId, productId, 'OUT', quantity, {
      reason: 'venda',
      saleId,
    });
  }

  /** Estorna estoque quando o item de produto é removido da comanda. */
  restoreFromSale(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productId: string,
    quantity: number,
    saleId: string,
  ) {
    return applyMovement(tx, tenantId, productId, 'IN', quantity, {
      reason: 'estorno',
      saleId,
    });
  }
}

/** Aplica a movimentação e atualiza o estoque na MESMA transação (atômico). */
async function applyMovement(
  tx: Prisma.TransactionClient,
  tenantId: string,
  productId: string,
  type: 'IN' | 'OUT',
  quantity: number,
  extra: { reason?: string; unitCostCents?: number; notes?: string; saleId?: string },
) {
  const product = await tx.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: { id: true, stockCurrent: true },
  });
  if (!product) throw new NotFoundException('Produto não encontrado');

  const next =
    type === 'IN' ? product.stockCurrent + quantity : product.stockCurrent - quantity;
  if (next < 0) {
    throw new BadRequestException(
      `Estoque insuficiente (atual: ${product.stockCurrent}, saída: ${quantity})`,
    );
  }

  await tx.stockMovement.create({
    data: {
      tenantId,
      productId,
      type,
      quantity,
      reason: extra.reason,
      unitCostCents: extra.unitCostCents,
      notes: extra.notes,
      saleId: extra.saleId,
    },
  });

  return tx.product.update({
    where: { id: productId },
    data: { stockCurrent: next },
    select: PRODUCT,
  });
}
