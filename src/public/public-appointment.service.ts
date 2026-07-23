import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { verifyAppointmentToken } from '../common/appointment-token';

/**
 * Auto-atendimento do cliente sobre o próprio agendamento (link do lembrete):
 * ver, confirmar presença ou cancelar. Sem login — a autorização é o token
 * assinado, que vale só para aquele agendamento.
 */
@Injectable()
export class PublicAppointmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  private parse(token: string) {
    const parsed = verifyAppointmentToken(token);
    if (!parsed) {
      throw new NotFoundException('Link inválido ou expirado');
    }
    return parsed;
  }

  /** Dados que o cliente vê ao abrir o link. */
  async get(token: string) {
    const { tenantId, appointmentId } = this.parse(token);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const appt = await tx.appointment.findFirst({
        where: { id: appointmentId, deletedAt: null },
        select: {
          id: true,
          startAt: true,
          endAt: true,
          status: true,
          service: { select: { name: true, durationMin: true } },
          barber: { select: { name: true } },
          client: { select: { name: true } },
          unit: { select: { name: true, timezone: true, address: true, phone: true } },
        },
      });
      if (!appt) throw new NotFoundException('Agendamento não encontrado');

      const tenant = await tx.tenant.findFirst({ select: { name: true } });
      return {
        // Só o que o cliente precisa ver — nada de ids internos ou preço de custo.
        shopName: tenant?.name,
        clientName: appt.client?.name,
        serviceName: appt.service?.name,
        barberName: appt.barber?.name,
        startAt: appt.startAt,
        endAt: appt.endAt,
        status: appt.status,
        timezone: appt.unit?.timezone ?? 'America/Sao_Paulo',
        unitName: appt.unit?.name,
        unitPhone: appt.unit?.phone,
        canConfirm: appt.status === 'SCHEDULED' && appt.startAt > new Date(),
        canCancel:
          (appt.status === 'SCHEDULED' || appt.status === 'CONFIRMED') &&
          appt.startAt > new Date(),
      };
    });
  }

  /** Cliente confirma presença. */
  async confirm(token: string) {
    return this.transition(token, 'CONFIRMED');
  }

  /** Cliente desmarca. Libera o horário na agenda automaticamente. */
  async cancel(token: string) {
    return this.transition(token, 'CANCELED');
  }

  private async transition(token: string, to: 'CONFIRMED' | 'CANCELED') {
    const { tenantId, appointmentId } = this.parse(token);
    await this.prisma.withTenant(tenantId, async (tx) => {
      const appt = await tx.appointment.findFirst({
        where: { id: appointmentId, deletedAt: null },
        select: { id: true, status: true, startAt: true },
      });
      if (!appt) throw new NotFoundException('Agendamento não encontrado');

      if (appt.status === 'DONE' || appt.status === 'NO_SHOW') {
        throw new BadRequestException('Este atendimento já foi encerrado');
      }
      if (appt.status === 'CANCELED') {
        throw new BadRequestException('Este agendamento já foi cancelado');
      }
      if (appt.startAt <= new Date()) {
        throw new BadRequestException(
          'O horário já passou. Fale com a barbearia.',
        );
      }
      if (to === 'CONFIRMED' && appt.status === 'CONFIRMED') {
        return; // idempotente: confirmar de novo não é erro
      }

      await tx.appointment.update({
        where: { id: appt.id },
        data: { status: to },
      });
    });
    // Realtime: a agenda da recepção mostra o confirmado/cancelado na hora.
    this.realtime.emitToTenant(tenantId, 'appointment:changed', {
      id: appointmentId,
      action: to === 'CANCELED' ? 'canceled' : 'confirmed',
    });
    return this.get(token);
  }
}
