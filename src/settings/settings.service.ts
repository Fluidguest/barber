import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { encryptField, decryptField } from '../common/crypto.util';
import { UpdateSettingsDto } from './dto/update-settings.dto';

/** Config resolvida do WhatsApp (tenant → fallback env). NÃO exposta pela API. */
export interface WhatsAppConfig {
  provider: string;
  meta: { token?: string; phoneId?: string; apiVersion?: string };
  waha: { url?: string; session?: string; apiKey?: string };
}

/** Config resolvida de pagamento do PDV. NÃO exposta pela API. */
export interface PaymentConfigResolved {
  provider: string;
  accessToken?: string;
  webhookSecret?: string;
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Configurações para exibir na UI — secrets MASCARADOS (booleano "configurado"). */
  async getMasked(tenantId: string) {
    const s = await this.prisma.withTenant(tenantId, (tx) =>
      tx.tenantSettings.findUnique({ where: { tenantId } }),
    );
    return {
      whatsappProvider: s?.whatsappProvider ?? 'fake',
      metaPhoneId: s?.metaPhoneId ?? '',
      metaApiVersion: s?.metaApiVersion ?? 'v21.0',
      metaTokenSet: !!s?.metaToken,
      wahaUrl: s?.wahaUrl ?? '',
      wahaSession: s?.wahaSession ?? 'default',
      wahaApiKeySet: !!s?.wahaApiKey,
      whatsappVerifyToken: s?.whatsappVerifyToken ?? '',
      reminderLeadHours: s?.reminderLeadHours ?? null,
      // Pagamento no PDV
      paymentProvider: s?.paymentProvider ?? 'fake',
      mpAccessTokenSet: !!s?.mpAccessToken,
      mpWebhookSecretSet: !!s?.mpWebhookSecret,
    };
  }

  update(tenantId: string, dto: UpdateSettingsDto) {
    // Secrets: só grava se vier valor não-vazio (mantém o atual caso omisso).
    const data: Prisma.TenantSettingsUncheckedCreateInput = {
      tenantId,
      whatsappProvider: dto.whatsappProvider,
      metaPhoneId: dto.metaPhoneId,
      metaApiVersion: dto.metaApiVersion,
      wahaUrl: dto.wahaUrl,
      wahaSession: dto.wahaSession,
      whatsappVerifyToken: dto.whatsappVerifyToken,
      reminderLeadHours: dto.reminderLeadHours,
      paymentProvider: dto.paymentProvider,
      ...(dto.metaToken ? { metaToken: encryptField(dto.metaToken) } : {}),
      ...(dto.wahaApiKey ? { wahaApiKey: encryptField(dto.wahaApiKey) } : {}),
      ...(dto.mpAccessToken ? { mpAccessToken: encryptField(dto.mpAccessToken) } : {}),
      ...(dto.mpWebhookSecret
        ? { mpWebhookSecret: encryptField(dto.mpWebhookSecret) }
        : {}),
    };
    const update: Prisma.TenantSettingsUpdateInput = { ...data };
    delete (update as { tenantId?: string }).tenantId;

    return this.prisma
      .withTenant(tenantId, (tx) =>
        tx.tenantSettings.upsert({
          where: { tenantId },
          create: data,
          update,
        }),
      )
      .then(() => this.getMasked(tenantId));
  }

  /** Config resolvida (tenant + fallback env) para o envio. Uso interno. */
  async getWhatsAppConfig(tenantId: string): Promise<WhatsAppConfig> {
    const s = await this.prisma.withTenant(tenantId, (tx) =>
      tx.tenantSettings.findUnique({ where: { tenantId } }),
    );
    return {
      provider:
        s?.whatsappProvider ?? process.env.WHATSAPP_PROVIDER ?? 'fake',
      meta: {
        token: decryptField(s?.metaToken) ?? process.env.META_WHATSAPP_TOKEN,
        phoneId: s?.metaPhoneId ?? process.env.META_WHATSAPP_PHONE_ID,
        apiVersion:
          s?.metaApiVersion ?? process.env.META_WHATSAPP_API_VERSION ?? 'v21.0',
      },
      waha: {
        url: s?.wahaUrl ?? process.env.WAHA_URL,
        session: s?.wahaSession ?? process.env.WAHA_SESSION ?? 'default',
        apiKey: decryptField(s?.wahaApiKey) ?? process.env.WAHA_API_KEY,
      },
    };
  }

  /** Config resolvida de pagamento do PDV (tenant + fallback env). Uso interno. */
  async getPaymentConfig(tenantId: string): Promise<PaymentConfigResolved> {
    const s = await this.prisma.withTenant(tenantId, (tx) =>
      tx.tenantSettings.findUnique({ where: { tenantId } }),
    );
    return {
      provider: s?.paymentProvider ?? process.env.PAYMENT_PROVIDER ?? 'fake',
      accessToken: decryptField(s?.mpAccessToken) ?? process.env.MP_ACCESS_TOKEN,
      webhookSecret:
        decryptField(s?.mpWebhookSecret) ?? process.env.MP_WEBHOOK_SECRET,
    };
  }
}
