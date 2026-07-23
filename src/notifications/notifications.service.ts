import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppSenderService } from '../whatsapp/whatsapp-sender.service';
import { signAppointmentToken } from '../common/appointment-token';

const SELECT = {
  id: true,
  clientId: true,
  appointmentId: true,
  type: true,
  status: true,
  providerMessageId: true,
  scheduledFor: true,
  sentAt: true,
  payload: true,
} satisfies Prisma.WhatsAppMessageSelect;

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: WhatsAppSenderService,
  ) {}

  /**
   * Agenda o lembrete de um atendimento. DB-only (sem rede) — pode rodar DENTRO
   * da transação que cria o atendimento. Sem contato do cliente, não agenda.
   */
  async scheduleAppointmentReminder(
    tx: Prisma.TransactionClient,
    tenantId: string,
    appt: { id: string; clientId: string; startAt: Date },
  ): Promise<void> {
    const client = await tx.client.findFirst({
      where: { id: appt.clientId, deletedAt: null },
      select: { name: true, whatsapp: true, phone: true },
    });
    const to = client?.whatsapp ?? client?.phone;
    if (!to) return;

    const leadHours = Number(process.env.REMINDER_LEAD_HOURS ?? 24);
    const scheduledFor = new Date(appt.startAt.getTime() - leadHours * 3_600_000);
    const firstName = client?.name?.split(' ')[0] ?? '';
    // Link de auto-atendimento: o cliente confirma ou desmarca sozinho, sem
    // ligar para a barbearia (e o horário desmarcado volta para a agenda).
    const token = signAppointmentToken(tenantId, appt.id, appt.startAt);
    const link = `${process.env.APP_URL ?? 'http://localhost:3100'}/agendamento/${token}`;
    const body =
      `Olá ${firstName}! Passando para lembrar do seu horário na barbearia. ` +
      `Confirme ou remarque por aqui: ${link}`;

    await tx.whatsAppMessage.create({
      data: {
        tenantId,
        clientId: appt.clientId,
        appointmentId: appt.id,
        direction: 'OUTBOUND',
        type: 'REMINDER',
        status: 'QUEUED',
        scheduledFor,
        payload: { to, body },
      },
    });
  }

  list(tenantId: string, filter: { status?: string; type?: string }) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.whatsAppMessage.findMany({
        where: {
          ...(filter.status ? { status: filter.status as any } : {}),
          ...(filter.type ? { type: filter.type as any } : {}),
        },
        orderBy: { createdAt: 'desc' },
        select: SELECT,
      }),
    );
  }

  /** Envia uma mensagem específica agora (útil para reenvio/manual). */
  async sendOne(tenantId: string, id: string) {
    const msg = await this.prisma.withTenant(tenantId, (tx) =>
      tx.whatsAppMessage.findFirst({
        where: { id },
        select: { id: true, payload: true },
      }),
    );
    if (!msg) throw new NotFoundException('Mensagem não encontrada');
    await this.deliver(tenantId, msg.id, msg.payload);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.whatsAppMessage.findFirst({ where: { id }, select: SELECT }),
    );
  }

  /** Envia todas as mensagens QUEUED cujo horário já chegou (deste tenant). */
  async dispatchDue(tenantId: string) {
    const due = await this.prisma.withTenant(tenantId, (tx) =>
      tx.whatsAppMessage.findMany({
        where: { status: 'QUEUED', scheduledFor: { lte: new Date() } },
        select: { id: true, payload: true },
      }),
    );
    let sent = 0;
    for (const m of due) {
      if (await this.deliver(tenantId, m.id, m.payload)) sent++;
    }
    return { due: due.length, dispatched: sent };
  }

  /** Chama o provider FORA da transação e persiste o resultado. */
  private async deliver(
    tenantId: string,
    id: string,
    payload: Prisma.JsonValue,
  ): Promise<boolean> {
    const { to, body } = (payload ?? {}) as { to?: string; body?: string };
    try {
      const res = await this.sender.sendText(tenantId, to ?? '', body ?? '');
      await this.prisma.withTenant(tenantId, (tx) =>
        tx.whatsAppMessage.update({
          where: { id },
          data: {
            status: res.status,
            providerMessageId: res.providerMessageId,
            sentAt: new Date(),
          },
        }),
      );
      return res.status === 'SENT';
    } catch {
      await this.prisma.withTenant(tenantId, (tx) =>
        tx.whatsAppMessage.update({ where: { id }, data: { status: 'FAILED' } }),
      );
      return false;
    }
  }
}
