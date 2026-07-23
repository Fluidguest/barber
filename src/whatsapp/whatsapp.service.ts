import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SystemPrismaService } from '../prisma/system-prisma.service';
import { StorageService } from '../storage/storage.service';
import { signedMediaUrl } from '../storage/signed-url';
import { RealtimeService } from '../realtime/realtime.service';
import { WhatsAppSenderService } from './whatsapp-sender.service';

const CONVO = {
  id: true,
  contactPhone: true,
  contactName: true,
  clientId: true,
  status: true,
  unreadCount: true,
  lastMessageAt: true,
  lastPreview: true,
} satisfies Prisma.WhatsAppConversationSelect;

const MSG = {
  id: true,
  direction: true,
  contentType: true,
  body: true,
  mediaUrl: true,
  status: true,
  createdAt: true,
} satisfies Prisma.WhatsAppMessageSelect;

@Injectable()
export class WhatsAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
    private readonly sender: WhatsAppSenderService,
    private readonly storage: StorageService,
    private readonly realtime: RealtimeService,
  ) {}

  listConversations(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.whatsAppConversation.findMany({
        orderBy: { lastMessageAt: 'desc' },
        select: CONVO,
      }),
    );
  }

  async getConversation(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const convo = await tx.whatsAppConversation.findFirst({
        where: { id },
        select: CONVO,
      });
      if (!convo) throw new NotFoundException('Conversa não encontrada');
      const messages = await tx.whatsAppMessage.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: 'asc' },
        select: MSG,
      });
      // A mídia sai com URL assinada e de curta duração — o frontend usa
      // direto em <img>/<audio>, sem precisar mandar token na query.
      return { ...convo, messages: messages.map((m) => signMedia(tenantId, m)) };
    });
  }

  async markRead(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const convo = await tx.whatsAppConversation.findFirst({
        where: { id },
        select: { id: true },
      });
      if (!convo) throw new NotFoundException('Conversa não encontrada');
      await tx.whatsAppConversation.update({
        where: { id },
        data: { unreadCount: 0 },
      });
      return { ok: true };
    });
  }

  /** Envia texto ou mídia: cria a mensagem, chama o provider FORA da tx, atualiza status. */
  async sendText(
    tenantId: string,
    input: { conversationId?: string; to?: string; body?: string; mediaId?: string },
  ) {
    if (!input.body && !input.mediaId) {
      throw new BadRequestException('Informe texto (body) ou uma mídia (mediaId)');
    }

    // Resolve a mídia (se houver) fora da tx.
    let media: { contentType: string; mediaUrl: string } | null = null;
    if (input.mediaId) {
      const file = await this.storage.getMeta(tenantId, input.mediaId);
      if (!file) throw new BadRequestException('Mídia inválida');
      media = {
        contentType: mapMime(file.contentType),
        mediaUrl: `/api/storage/${file.id}`,
      };
    }
    const preview = input.body ?? `[${(media?.contentType ?? 'TEXT').toLowerCase()}]`;

    const created = await this.prisma.withTenant(tenantId, async (tx) => {
      const convo = await this.resolveConversation(tx, tenantId, input);
      const msg = await tx.whatsAppMessage.create({
        data: {
          tenantId,
          conversationId: convo.id,
          direction: 'OUTBOUND',
          type: 'FREE_TEXT',
          contentType: (media?.contentType as any) ?? 'TEXT',
          body: input.body,
          mediaUrl: media?.mediaUrl,
          status: 'QUEUED',
          payload: { to: convo.contactPhone, body: input.body },
        },
        select: { id: true },
      });
      await tx.whatsAppConversation.update({
        where: { id: convo.id },
        data: { lastMessageAt: new Date(), lastPreview: preview.slice(0, 120) },
      });
      return { id: msg.id, to: convo.contactPhone, conversationId: convo.id };
    });

    const res = await this.sender
      .sendText(tenantId, created.to, input.body ?? '')
      .catch(() => ({ providerMessageId: '', status: 'FAILED' as const }));

    const saved = await this.prisma.withTenant(tenantId, (tx) =>
      tx.whatsAppMessage.update({
        where: { id: created.id },
        data: {
          status: res.status,
          providerMessageId: res.providerMessageId,
          sentAt: new Date(),
        },
        select: MSG,
      }),
    );

    // Realtime: a mensagem enviada aparece na hora em outras abas/dispositivos.
    this.realtime.emitToTenant(tenantId, 'whatsapp:message', {
      conversationId: created.conversationId,
      message: signMedia(tenantId, saved),
    });
    return saved;
  }

  /** Recebe uma mensagem (chamado pelo webhook, com o tenant já resolvido). */
  async receiveInbound(
    tenantId: string,
    input: { from: string; name?: string; body?: string; contentType?: string; providerMessageId?: string },
  ) {
    const result = await this.prisma.withTenant(tenantId, async (tx) => {
      const convo = await tx.whatsAppConversation.upsert({
        where: { tenantId_contactPhone: { tenantId, contactPhone: input.from } },
        create: { tenantId, contactPhone: input.from, contactName: input.name },
        update: input.name ? { contactName: input.name } : {},
        select: { id: true },
      });
      const msg = await tx.whatsAppMessage.create({
        data: {
          tenantId,
          conversationId: convo.id,
          direction: 'INBOUND',
          type: 'FREE_TEXT',
          contentType: (input.contentType as any) ?? 'TEXT',
          body: input.body,
          status: 'DELIVERED',
          providerMessageId: input.providerMessageId,
        },
        select: MSG,
      });
      await tx.whatsAppConversation.update({
        where: { id: convo.id },
        data: {
          lastMessageAt: new Date(),
          lastPreview: (input.body ?? input.contentType ?? 'mídia').slice(0, 120),
          unreadCount: { increment: 1 },
        },
      });
      return { conversationId: convo.id, message: msg };
    });

    // Realtime: a mensagem do cliente aparece no inbox sem F5 (o maior ganho).
    this.realtime.emitToTenant(tenantId, 'whatsapp:message', {
      conversationId: result.conversationId,
      message: signMedia(tenantId, result.message),
      inbound: true,
    });
    return { conversationId: result.conversationId };
  }

  /** Registra o número (phone_number_id da Meta) para o tenant. */
  async registerNumber(tenantId: string, phoneNumberId: string, label?: string) {
    try {
      return await this.prisma.withTenant(tenantId, (tx) =>
        tx.whatsAppNumber.create({
          data: { tenantId, phoneNumberId, label },
          select: { id: true, phoneNumberId: true, label: true },
        }),
      );
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Número já registrado');
      }
      throw e;
    }
  }

  /** Resolve o tenant dono de um número (webhook, sem contexto de tenant). */
  async resolveTenantByNumber(phoneNumberId: string): Promise<string | null> {
    const row = await this.system.whatsAppNumber.findFirst({
      where: { phoneNumberId },
      select: { tenantId: true },
    });
    return row?.tenantId ?? null;
  }

  private async resolveConversation(
    tx: Prisma.TransactionClient,
    tenantId: string,
    input: { conversationId?: string; to?: string },
  ) {
    if (input.conversationId) {
      const c = await tx.whatsAppConversation.findFirst({
        where: { id: input.conversationId },
        select: { id: true, contactPhone: true },
      });
      if (!c) throw new NotFoundException('Conversa não encontrada');
      return c;
    }
    if (input.to) {
      return tx.whatsAppConversation.upsert({
        where: { tenantId_contactPhone: { tenantId, contactPhone: input.to } },
        create: { tenantId, contactPhone: input.to },
        update: {},
        select: { id: true, contactPhone: true },
      });
    }
    throw new BadRequestException('Informe conversationId ou to');
  }
}

/**
 * Troca o caminho cru do arquivo (`/api/storage/<id>`) por uma URL assinada,
 * válida por poucos minutos. Mensagens sem mídia passam intactas.
 */
function signMedia<T extends { mediaUrl?: string | null }>(
  tenantId: string,
  msg: T,
): T {
  const id = msg.mediaUrl?.match(/\/api\/storage\/([^/?]+)$/)?.[1];
  return id ? { ...msg, mediaUrl: signedMediaUrl(tenantId, id) } : msg;
}

/** MIME → tipo de conteúdo do WhatsApp. */
function mapMime(mime: string): string {
  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime.startsWith('audio/')) return 'AUDIO';
  if (mime.startsWith('video/')) return 'VIDEO';
  return 'DOCUMENT';
}
