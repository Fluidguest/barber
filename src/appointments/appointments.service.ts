import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { RescheduleDto } from './dto/reschedule.dto';
import { ListAppointmentsDto } from './dto/list-appointments.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

const SELECT = {
  id: true,
  startAt: true,
  endAt: true,
  status: true,
  priceCents: true,
  clientId: true,
  barberId: true,
  serviceId: true,
  notes: true,
} satisfies Prisma.AppointmentSelect;

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(tenantId: string, dto: CreateAppointmentDto) {
    const startAt = new Date(dto.startAt);
    const created = await this.prisma.withTenant(tenantId, async (tx) => {
      const client = await tx.client.findFirst({
        where: { id: dto.clientId, deletedAt: null },
        select: { id: true },
      });
      if (!client) throw new BadRequestException('Cliente inválido');

      const barber = await tx.barber.findFirst({
        where: { id: dto.barberId, deletedAt: null },
        select: { id: true, unitId: true, unit: { select: { timezone: true } } },
      });
      if (!barber) throw new BadRequestException('Barbeiro inválido');

      const service = await tx.service.findFirst({
        where: { id: dto.serviceId, deletedAt: null },
        select: { id: true, durationMin: true, priceCents: true },
      });
      if (!service) throw new BadRequestException('Serviço inválido');

      const endAt = new Date(startAt.getTime() + service.durationMin * 60_000);
      await this.assertAvailable(tx, {
        barberId: barber.id,
        timezone: barber.unit.timezone,
        startAt,
        endAt,
      });

      const created = await tx.appointment
        .create({
          data: {
            tenantId,
            unitId: barber.unitId,
            clientId: client.id,
            barberId: barber.id,
            serviceId: service.id,
            startAt,
            endAt,
            priceCents: service.priceCents,
            notes: dto.notes,
          },
          select: SELECT,
        })
        .catch((e) => {
          throw translateSlotError(e);
        });
      // Agenda o lembrete de WhatsApp (DB-only, mesma transação).
      await this.notifications.scheduleAppointmentReminder(tx, tenantId, {
        id: created.id,
        clientId: client.id,
        startAt,
      });
      return created;
    });
    // Realtime: a agenda de outras telas reflete o novo horário na hora.
    this.realtime.emitToTenant(tenantId, 'appointment:changed', {
      id: created.id,
      action: 'created',
    });
    return created;
  }

  list(tenantId: string, q: ListAppointmentsDto) {
    const from = q.from ? new Date(q.from) : new Date();
    const to = q.to
      ? new Date(q.to)
      : new Date(from.getTime() + 30 * 86_400_000);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.appointment.findMany({
        where: {
          deletedAt: null,
          startAt: { gte: from, lte: to },
          ...(q.barberId ? { barberId: q.barberId } : {}),
          ...(q.clientId ? { clientId: q.clientId } : {}),
          ...(q.serviceId ? { serviceId: q.serviceId } : {}),
          ...(q.status ? { status: q.status as any } : {}),
        },
        orderBy: { startAt: 'asc' },
        select: SELECT,
      }),
    );
  }

  async get(tenantId: string, id: string) {
    const appt = await this.prisma.withTenant(tenantId, (tx) =>
      tx.appointment.findFirst({
        where: { id, deletedAt: null },
        select: SELECT,
      }),
    );
    if (!appt) throw new NotFoundException('Atendimento não encontrado');
    return appt;
  }

  reschedule(tenantId: string, id: string, dto: RescheduleDto) {
    const startAt = new Date(dto.startAt);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const appt = await tx.appointment.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, status: true, serviceId: true, barberId: true },
      });
      if (!appt) throw new NotFoundException('Atendimento não encontrado');
      if (appt.status === 'CANCELED' || appt.status === 'DONE') {
        throw new BadRequestException(
          'Não é possível reagendar um atendimento cancelado ou concluído',
        );
      }

      const barberId = dto.barberId ?? appt.barberId;
      const barber = await tx.barber.findFirst({
        where: { id: barberId, deletedAt: null },
        select: { id: true, unitId: true, unit: { select: { timezone: true } } },
      });
      if (!barber) throw new BadRequestException('Barbeiro inválido');

      const service = await tx.service.findFirst({
        where: { id: appt.serviceId, deletedAt: null },
        select: { durationMin: true },
      });
      const durationMin = service?.durationMin ?? 30;
      const endAt = new Date(startAt.getTime() + durationMin * 60_000);

      await this.assertAvailable(tx, {
        barberId: barber.id,
        timezone: barber.unit.timezone,
        startAt,
        endAt,
        ignoreAppointmentId: id,
      });

      try {
        return await tx.appointment.update({
          where: { id },
          data: { startAt, endAt, barberId: barber.id, unitId: barber.unitId },
          select: SELECT,
        });
      } catch (e) {
        throw translateSlotError(e);
      }
    });
  }

  async setStatus(tenantId: string, id: string, dto: UpdateStatusDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const appt = await tx.appointment.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, status: true },
      });
      if (!appt) throw new NotFoundException('Atendimento não encontrado');
      if (appt.status === 'CANCELED' || appt.status === 'DONE') {
        throw new BadRequestException(
          `Atendimento já está ${appt.status} e não pode mudar de status`,
        );
      }
      return tx.appointment.update({
        where: { id },
        data: { status: dto.status },
        select: SELECT,
      });
    });
  }

  /**
   * Garante que o intervalo está livre: sem bloqueio (TimeBlock) e dentro da
   * jornada do barbeiro (se ele tiver jornada definida). O overbooking em si é
   * barrado pelo banco (EXCLUDE); aqui cobrimos as regras que o banco não sabe.
   */
  private async assertAvailable(
    tx: Prisma.TransactionClient,
    p: {
      barberId: string;
      timezone: string;
      startAt: Date;
      endAt: Date;
      ignoreAppointmentId?: string;
    },
  ): Promise<void> {
    // 1) Bloqueios (comparação em UTC — não precisa de timezone).
    const block = await tx.timeBlock.findFirst({
      where: {
        startAt: { lt: p.endAt },
        endAt: { gt: p.startAt },
        OR: [{ barberId: p.barberId }, { barberId: null }],
      },
      select: { id: true },
    });
    if (block) {
      throw new ConflictException('Horário bloqueado (intervalo/folga/férias)');
    }

    // 2) Jornada de trabalho. Sem jornada cadastrada => sem restrição de horário.
    const schedules = await tx.workSchedule.findMany({
      where: { barberId: p.barberId },
      select: { weekday: true, startTime: true, endTime: true },
    });
    if (schedules.length === 0) return;

    const start = localWeekdayMinutes(p.startAt, p.timezone);
    const end = localWeekdayMinutes(p.endAt, p.timezone);
    const fits =
      start.weekday === end.weekday &&
      schedules.some(
        (sc) =>
          sc.weekday === start.weekday &&
          toMinutes(sc.startTime) <= start.minutes &&
          toMinutes(sc.endTime) >= end.minutes,
      );
    if (!fits) {
      throw new BadRequestException(
        'Fora do horário de trabalho do barbeiro',
      );
    }
  }
}

/**
 * Traduz a violação da constraint de overbooking (EXCLUDE) num 409 amigável.
 * A trava é garantida pelo Postgres (business-rules.sql), à prova de corrida.
 */
function translateSlotError(e: unknown): Error {
  const msg = String((e as { message?: string })?.message ?? '');
  if (
    msg.includes('appointments_no_overlap') ||
    msg.includes('23P01') ||
    msg.toLowerCase().includes('exclusion constraint')
  ) {
    return new ConflictException(
      'Horário indisponível: o barbeiro já tem um atendimento nesse intervalo',
    );
  }
  return e as Error;
}

const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Weekday (0=Dom) e minutos desde a meia-noite no fuso da unidade. */
function localWeekdayMinutes(
  date: Date,
  timeZone: string,
): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? '';
  const weekday = WEEKDAY[get('weekday')] ?? 0;
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0; // alguns runtimes emitem "24" para meia-noite
  const minute = parseInt(get('minute'), 10);
  return { weekday, minutes: hour * 60 + minute };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
