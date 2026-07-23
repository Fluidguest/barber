import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SystemPrismaService } from '../prisma/system-prisma.service';
import { SettingsService } from '../settings/settings.service';
import { FakeSalePaymentProvider } from './fake-sale-payment.provider';
import { MercadoPagoSalePaymentProvider } from './mercadopago-sale-payment.provider';
import { PaymentConfig, SalePaymentProvider } from './sale-payment.provider';

/** Validade padrão do PIX (minutos). */
const PIX_TTL_MIN = 30;

const CHARGE = {
  id: true,
  saleId: true,
  provider: true,
  externalId: true,
  method: true,
  amountCents: true,
  status: true,
  qrCode: true,
  qrCodeBase64: true,
  ticketUrl: true,
  expiresAt: true,
  paidAt: true,
} satisfies Prisma.SaleChargeSelect;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');

  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
    private readonly settings: SettingsService,
    private readonly fake: FakeSalePaymentProvider,
    private readonly mp: MercadoPagoSalePaymentProvider,
  ) {}

  private pick(cfg: PaymentConfig): SalePaymentProvider {
    return cfg.provider === 'mercadopago' ? this.mp : this.fake;
  }

  /** Cria uma cobrança PIX para a comanda aberta. */
  async createPixCharge(tenantId: string, saleId: string, amountCents?: number) {
    const cfg = await this.settings.getPaymentConfig(tenantId);

    const prepared = await this.prisma.withTenant(tenantId, async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId, deletedAt: null },
        select: { id: true, status: true, totalCents: true },
      });
      if (!sale) throw new NotFoundException('Comanda não encontrada');
      if (sale.status !== 'OPEN') {
        throw new BadRequestException('Comanda não está aberta');
      }

      // Valor: o informado ou o que ainda falta pagar.
      const paid = await tx.payment.aggregate({
        where: { saleId },
        _sum: { amountCents: true },
      });
      const remaining = sale.totalCents - (paid._sum.amountCents ?? 0);
      const value = amountCents ?? remaining;
      if (value <= 0) throw new BadRequestException('Nada a pagar nesta comanda');
      if (value > remaining) {
        throw new BadRequestException(
          `Valor acima do saldo da comanda (${(remaining / 100).toFixed(2)})`,
        );
      }

      // Grava PENDENTE antes de chamar o provedor: se a chamada externa falhar,
      // sobra um registro rastreável em vez de uma cobrança órfã lá fora.
      return tx.saleCharge.create({
        data: {
          tenantId,
          saleId,
          provider: cfg.provider,
          method: 'PIX',
          amountCents: value,
          status: 'PENDING',
        },
        select: { id: true, amountCents: true },
      });
    });

    const result = await this.pick(cfg).createPixCharge(
      {
        amountCents: prepared.amountCents,
        description: `Comanda ${saleId.slice(-6)}`,
        externalReference: prepared.id,
        expiresInMin: PIX_TTL_MIN,
      },
      cfg,
    );

    return this.prisma.withTenant(tenantId, (tx) =>
      tx.saleCharge.update({
        where: { id: prepared.id },
        data: {
          externalId: result.externalId,
          qrCode: result.qrCode,
          qrCodeBase64: result.qrCodeBase64,
          ticketUrl: result.ticketUrl,
          expiresAt: result.expiresAt,
        },
        select: CHARGE,
      }),
    );
  }

  listCharges(tenantId: string, saleId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.saleCharge.findMany({
        where: { saleId },
        orderBy: { createdAt: 'desc' },
        select: CHARGE,
      }),
    );
  }

  /**
   * Consulta a cobrança. Se ainda estiver pendente, pergunta ao provedor —
   * assim o PDV funciona mesmo que o webhook não chegue (rede/firewall).
   */
  async getCharge(tenantId: string, chargeId: string) {
    const charge = await this.prisma.withTenant(tenantId, (tx) =>
      tx.saleCharge.findFirst({ where: { id: chargeId }, select: CHARGE }),
    );
    if (!charge) throw new NotFoundException('Cobrança não encontrada');
    if (charge.status !== 'PENDING' || !charge.externalId) return charge;

    const cfg = await this.settings.getPaymentConfig(tenantId);
    const remote = await this.pick(cfg).getChargeStatus(charge.externalId, cfg);
    if (remote.status === 'PENDING') return charge;

    await this.settle(tenantId, chargeId, remote.status, remote.paidAt);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.saleCharge.findFirst({ where: { id: chargeId }, select: CHARGE }),
    );
  }

  /**
   * Aplica o desfecho da cobrança. Ao APROVAR, cria o `Payment` da comanda —
   * é o que faz o dinheiro entrar no caixa/fluxo. Idempotente: reprocessar o
   * mesmo webhook não duplica pagamento.
   */
  async settle(
    tenantId: string,
    chargeId: string,
    status: 'APPROVED' | 'EXPIRED' | 'CANCELED' | 'FAILED',
    paidAt?: Date,
  ): Promise<void> {
    await this.prisma.withTenant(tenantId, async (tx) => {
      const charge = await tx.saleCharge.findFirst({
        where: { id: chargeId },
        select: {
          id: true,
          saleId: true,
          status: true,
          amountCents: true,
          method: true,
          externalId: true,
        },
      });
      if (!charge || charge.status !== 'PENDING') return; // já processada

      await tx.saleCharge.update({
        where: { id: charge.id },
        data: { status, paidAt: status === 'APPROVED' ? (paidAt ?? new Date()) : null },
      });

      if (status !== 'APPROVED') return;

      // Não duplica se já houver Payment com o mesmo externalId.
      const existing = charge.externalId
        ? await tx.payment.findFirst({
            where: { saleId: charge.saleId, externalId: charge.externalId },
            select: { id: true },
          })
        : null;
      if (existing) return;

      await tx.payment.create({
        data: {
          tenantId,
          saleId: charge.saleId,
          method: charge.method,
          amountCents: charge.amountCents,
          externalId: charge.externalId,
          paidAt: paidAt ?? new Date(),
        },
      });
    });
  }

  /** Só com o provider `fake`: marca a cobrança como paga (demo/teste). */
  async simulateApproval(tenantId: string, chargeId: string) {
    const cfg = await this.settings.getPaymentConfig(tenantId);
    if (cfg.provider !== 'fake') {
      throw new BadRequestException(
        'Simulação disponível apenas com o provedor de pagamento "fake"',
      );
    }
    const charge = await this.prisma.withTenant(tenantId, (tx) =>
      tx.saleCharge.findFirst({
        where: { id: chargeId },
        select: { id: true, externalId: true, status: true },
      }),
    );
    if (!charge) throw new NotFoundException('Cobrança não encontrada');
    if (charge.status !== 'PENDING') {
      throw new BadRequestException('Cobrança não está pendente');
    }
    if (charge.externalId) this.fake.approve(charge.externalId);
    await this.settle(tenantId, chargeId, 'APPROVED', new Date());
    return this.getCharge(tenantId, chargeId);
  }

  /**
   * Webhook do provedor (público). Resolve o tenant pela cobrança usando a
   * conexão de sistema — mesmo padrão do webhook de billing/WhatsApp — e daí
   * em diante trabalha sob RLS.
   */
  async handleWebhook(externalId: string): Promise<void> {
    const charge = await this.system.saleCharge.findFirst({
      where: { externalId },
      select: { id: true, tenantId: true, status: true },
    });
    if (!charge) {
      this.logger.warn(`Webhook para cobrança desconhecida: ${externalId}`);
      return;
    }
    if (charge.status !== 'PENDING') return;

    const cfg = await this.settings.getPaymentConfig(charge.tenantId);
    const remote = await this.pick(cfg).getChargeStatus(externalId, cfg);
    if (remote.status === 'PENDING') return;
    await this.settle(charge.tenantId, charge.id, remote.status, remote.paidAt);
    this.logger.log(`Cobrança ${charge.id} → ${remote.status}`);
  }
}
