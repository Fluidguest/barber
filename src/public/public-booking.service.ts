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
import { localDateTimeToUtc, weekdayOf } from '../common/tz';
import { CreatePublicAppointmentDto } from './dto/create-public-appointment.dto';

/** Grade de horários oferecida ao cliente (minutos). */
const SLOT_STEP_MIN = 15;
/** Antecedência mínima para agendar (evita marcar "daqui a 2 minutos"). */
const MIN_LEAD_MIN = 30;
/** Janela máxima de agendamento no futuro (dias). */
const MAX_AHEAD_DAYS = 90;
/** Teto de agendamentos futuros por telefone (anti-abuso). */
const MAX_OPEN_PER_PHONE = 3;

@Injectable()
export class PublicBookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Resolve a barbearia pelo slug. Só barbearias ativas aceitam agendamento
   * online — suspensa/cancelada responde 404 (não expõe estado de cobrança).
   */
  private async tenantBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, name: true, status: true, deletedAt: true },
    });
    if (
      !tenant ||
      tenant.deletedAt ||
      (tenant.status !== 'ACTIVE' && tenant.status !== 'TRIAL')
    ) {
      throw new NotFoundException('Barbearia não encontrada');
    }
    return tenant;
  }

  /** Dados públicos da barbearia (nome + unidade/fuso). */
  async getShop(slug: string) {
    const tenant = await this.tenantBySlug(slug);
    const unit = await this.prisma.withTenant(tenant.id, (tx) =>
      tx.unit.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, timezone: true, address: true, phone: true },
      }),
    );
    return { slug, name: tenant.name, unit };
  }

  async listServices(slug: string) {
    const tenant = await this.tenantBySlug(slug);
    return this.prisma.withTenant(tenant.id, (tx) =>
      tx.service.findMany({
        where: { deletedAt: null, isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, durationMin: true, priceCents: true },
      }),
    );
  }

  /**
   * Barbeiros que atendem o serviço. Se houver vínculo explícito
   * (`BarberService`), respeita-o; senão, lista todos os ativos.
   */
  async listBarbers(slug: string, serviceId?: string) {
    const tenant = await this.tenantBySlug(slug);
    return this.prisma.withTenant(tenant.id, async (tx) => {
      if (serviceId) {
        const links = await tx.barberService.findMany({
          where: { serviceId },
          select: { barberId: true },
        });
        if (links.length > 0) {
          return tx.barber.findMany({
            where: {
              deletedAt: null,
              id: { in: links.map((l) => l.barberId) },
            },
            orderBy: { name: 'asc' },
            select: { id: true, name: true },
          });
        }
      }
      return tx.barber.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      });
    });
  }

  /**
   * Horários livres de um dia.
   *
   * Monta a grade a partir da jornada do barbeiro (hora local da unidade) e
   * remove o que colide com atendimentos já marcados e bloqueios. Sem jornada
   * cadastrada para aquele dia, o barbeiro simplesmente não tem vaga online.
   */
  async availability(
    slug: string,
    date: string,
    serviceId: string,
    barberId?: string,
  ) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Data inválida (use YYYY-MM-DD)');
    }
    const tenant = await this.tenantBySlug(slug);

    return this.prisma.withTenant(tenant.id, async (tx) => {
      const service = await tx.service.findFirst({
        where: { id: serviceId, deletedAt: null, isActive: true },
        select: { durationMin: true },
      });
      if (!service) throw new BadRequestException('Serviço inválido');

      const unit = await tx.unit.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { timezone: true },
      });
      const tz = unit?.timezone ?? 'America/Sao_Paulo';

      const barbers = await tx.barber.findMany({
        where: {
          deletedAt: null,
          ...(barberId ? { id: barberId } : {}),
        },
        select: { id: true, name: true },
      });
      if (barbers.length === 0) return { date, slots: [] };

      const weekday = weekdayOf(date);
      const dayStart = localDateTimeToUtc(date, 0, tz);
      const dayEnd = localDateTimeToUtc(date, 24 * 60, tz);

      // Uma consulta por recurso do dia — o cruzamento é feito em memória.
      const [schedules, appointments, blocks] = await Promise.all([
        tx.workSchedule.findMany({
          where: { weekday, barberId: { in: barbers.map((b) => b.id) } },
          select: { barberId: true, startTime: true, endTime: true },
        }),
        tx.appointment.findMany({
          where: {
            deletedAt: null,
            status: { not: 'CANCELED' },
            barberId: { in: barbers.map((b) => b.id) },
            startAt: { lt: dayEnd },
            endAt: { gt: dayStart },
          },
          select: { barberId: true, startAt: true, endAt: true },
        }),
        tx.timeBlock.findMany({
          where: { startAt: { lt: dayEnd }, endAt: { gt: dayStart } },
          select: { barberId: true, startAt: true, endAt: true },
        }),
      ]);

      const notBefore = new Date(Date.now() + MIN_LEAD_MIN * 60_000);
      const maxDate = new Date(Date.now() + MAX_AHEAD_DAYS * 86_400_000);
      const slots: { startAt: string; barberId: string; barberName: string }[] = [];

      for (const barber of barbers) {
        const daySchedules = schedules.filter((s) => s.barberId === barber.id);
        const busy = appointments.filter((a) => a.barberId === barber.id);
        // Bloqueio sem barbeiro vale para a barbearia inteira.
        const barred = blocks.filter(
          (b) => b.barberId === barber.id || b.barberId === null,
        );

        for (const sc of daySchedules) {
          const from = toMinutes(sc.startTime);
          const to = toMinutes(sc.endTime);
          for (let m = from; m + service.durationMin <= to; m += SLOT_STEP_MIN) {
            const startAt = localDateTimeToUtc(date, m, tz);
            const endAt = new Date(startAt.getTime() + service.durationMin * 60_000);
            if (startAt < notBefore || startAt > maxDate) continue;
            if (busy.some((a) => overlaps(startAt, endAt, a.startAt, a.endAt))) continue;
            if (barred.some((b) => overlaps(startAt, endAt, b.startAt, b.endAt))) continue;
            slots.push({
              startAt: startAt.toISOString(),
              barberId: barber.id,
              barberName: barber.name,
            });
          }
        }
      }

      slots.sort((a, b) => a.startAt.localeCompare(b.startAt));
      return { date, timezone: tz, durationMin: service.durationMin, slots };
    });
  }

  /**
   * Cria o agendamento a partir do formulário público.
   *
   * O cliente é identificado pelo telefone: reusa o cadastro se já existir,
   * senão cria um novo (origem "online"). O overbooking continua barrado pela
   * constraint do banco — à prova de dois clientes clicando ao mesmo tempo.
   */
  async book(slug: string, dto: CreatePublicAppointmentDto) {
    const tenant = await this.tenantBySlug(slug);
    const booked = await this.doBook(tenant, dto);
    // Realtime: agendamento online cai na agenda da recepção sem F5.
    this.realtime.emitToTenant(tenant.id, 'appointment:changed', {
      id: booked.id,
      action: 'created',
      online: true,
    });
    return booked;
  }

  private async doBook(
    tenant: { id: string },
    dto: CreatePublicAppointmentDto,
  ) {
    const startAt = new Date(dto.startAt);
    if (Number.isNaN(startAt.getTime())) {
      throw new BadRequestException('Data/hora inválida');
    }
    if (startAt.getTime() < Date.now() + MIN_LEAD_MIN * 60_000) {
      throw new BadRequestException('Escolha um horário com mais antecedência');
    }
    if (startAt.getTime() > Date.now() + MAX_AHEAD_DAYS * 86_400_000) {
      throw new BadRequestException('Data muito distante');
    }

    const phone = normalizePhone(dto.phone);

    return this.prisma.withTenant(tenant.id, async (tx) => {
      const barber = await tx.barber.findFirst({
        where: { id: dto.barberId, deletedAt: null },
        select: { id: true, unitId: true, unit: { select: { timezone: true } } },
      });
      if (!barber) throw new BadRequestException('Barbeiro inválido');

      const service = await tx.service.findFirst({
        where: { id: dto.serviceId, deletedAt: null, isActive: true },
        select: { id: true, durationMin: true, priceCents: true },
      });
      if (!service) throw new BadRequestException('Serviço inválido');

      const endAt = new Date(startAt.getTime() + service.durationMin * 60_000);
      await assertFree(tx, barber.id, barber.unit.timezone, startAt, endAt);

      // Cliente por telefone: reusa ou cria.
      let client = await tx.client.findFirst({
        where: { phone, deletedAt: null },
        select: { id: true },
      });
      if (client) {
        // Anti-abuso: limita agendamentos futuros em aberto por pessoa.
        const open = await tx.appointment.count({
          where: {
            clientId: client.id,
            deletedAt: null,
            status: { notIn: ['CANCELED', 'DONE'] },
            startAt: { gte: new Date() },
          },
        });
        if (open >= MAX_OPEN_PER_PHONE) {
          throw new ConflictException(
            'Você já tem agendamentos em aberto. Entre em contato com a barbearia.',
          );
        }
      } else {
        client = await tx.client.create({
          data: {
            tenantId: tenant.id,
            name: dto.name.trim(),
            phone,
            whatsapp: phone,
            origin: 'Agendamento online',
          },
          select: { id: true },
        });
      }

      const created = await tx.appointment
        .create({
          data: {
            tenantId: tenant.id,
            unitId: barber.unitId,
            clientId: client.id,
            barberId: barber.id,
            serviceId: service.id,
            startAt,
            endAt,
            priceCents: service.priceCents,
            notes: dto.notes,
          },
          select: { id: true, startAt: true, endAt: true, status: true },
        })
        .catch((e) => {
          throw translateSlotError(e);
        });

      await this.notifications.scheduleAppointmentReminder(tx, tenant.id, {
        id: created.id,
        clientId: client.id,
        startAt,
      });

      // Resposta enxuta: nada de dados internos.
      return {
        id: created.id,
        startAt: created.startAt,
        endAt: created.endAt,
        status: created.status,
      };
    });
  }
}

// ---------------------------------------------------------------------------

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Mantém só dígitos — o telefone é a chave de identificação do cliente. */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** Mesmas regras da agenda interna: sem bloqueio e dentro da jornada. */
async function assertFree(
  tx: Prisma.TransactionClient,
  barberId: string,
  timezone: string,
  startAt: Date,
  endAt: Date,
): Promise<void> {
  const block = await tx.timeBlock.findFirst({
    where: {
      startAt: { lt: endAt },
      endAt: { gt: startAt },
      OR: [{ barberId }, { barberId: null }],
    },
    select: { id: true },
  });
  if (block) throw new ConflictException('Horário indisponível');

  const schedules = await tx.workSchedule.findMany({
    where: { barberId },
    select: { weekday: true, startTime: true, endTime: true },
  });
  // No agendamento ONLINE exigimos jornada publicada — sem ela, não há vaga.
  if (schedules.length === 0) {
    throw new ConflictException('Este profissional não atende por agendamento online');
  }

  const s = localWeekdayMinutes(startAt, timezone);
  const e = localWeekdayMinutes(endAt, timezone);
  const fits =
    s.weekday === e.weekday &&
    schedules.some(
      (sc) =>
        sc.weekday === s.weekday &&
        toMinutes(sc.startTime) <= s.minutes &&
        toMinutes(sc.endTime) >= e.minutes,
    );
  if (!fits) throw new ConflictException('Horário fora do expediente');
}

function translateSlotError(e: unknown): Error {
  const msg = String((e as { message?: string })?.message ?? '');
  if (
    msg.includes('appointments_no_overlap') ||
    msg.includes('23P01') ||
    msg.toLowerCase().includes('exclusion constraint')
  ) {
    return new ConflictException('Esse horário acabou de ser preenchido. Escolha outro.');
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
  if (hour === 24) hour = 0;
  return { weekday, minutes: hour * 60 + parseInt(get('minute'), 10) };
}
