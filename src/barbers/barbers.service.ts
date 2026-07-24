import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { encryptField, decryptField } from '../common/crypto.util';
import { isValidCpf } from '../common/cpf.validator';
import { CreateBarberDto } from './dto/create-barber.dto';
import { UpdateBarberDto } from './dto/update-barber.dto';
import { SetScheduleDto } from './dto/set-schedule.dto';

const SELECT = {
  id: true,
  name: true,
  phone: true,
  whatsapp: true,
  email: true,
  document: true,
  birthDate: true,
  address: true,
  pixKey: true,
  bankData: true,
  unitId: true,
  specialties: { select: { serviceId: true } },
} satisfies Prisma.BarberSelect;

/** Decifra o CPF ao devolver (mesmo tratamento do cliente). */
function decode<T extends { document?: string | null }>(barber: T): T {
  return { ...barber, document: decryptField(barber.document) };
}

@Injectable()
export class BarbersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateBarberDto) {
    const barber = await this.prisma.withTenant(tenantId, async (tx) => {
      const unitId = await this.resolveUnit(tx, dto.unitId);
      await this.assertServices(tx, dto.specialtyIds);
      return tx.barber.create({
        data: {
          tenantId,
          unitId,
          name: dto.name,
          phone: dto.phone,
          whatsapp: dto.whatsapp,
          email: dto.email,
          document: dto.document ? encryptField(dto.document) : undefined,
          birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
          address: dto.address as unknown as Prisma.InputJsonValue,
          pixKey: dto.pixKey,
          bankData: dto.bankData as Prisma.InputJsonValue | undefined,
          specialties: {
            create: (dto.specialtyIds ?? []).map((serviceId) => ({
              tenantId,
              serviceId,
            })),
          },
        },
        select: SELECT,
      });
    });
    return decode(barber);
  }

  async list(tenantId: string) {
    const barbers = await this.prisma.withTenant(tenantId, (tx) =>
      tx.barber.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        select: SELECT,
      }),
    );
    return barbers.map(decode);
  }

  async get(tenantId: string, id: string) {
    const barber = await this.prisma.withTenant(tenantId, (tx) =>
      tx.barber.findFirst({
        where: { id, deletedAt: null },
        select: { ...SELECT, schedules: { select: { weekday: true, startTime: true, endTime: true } } },
      }),
    );
    if (!barber) throw new NotFoundException('Barbeiro não encontrado');
    return decode(barber);
  }

  async update(tenantId: string, id: string, dto: UpdateBarberDto) {
    // CPF, se informado na edição, precisa ser válido.
    if (dto.document && !isValidCpf(dto.document)) {
      throw new BadRequestException('CPF inválido');
    }
    const barber = await this.prisma.withTenant(tenantId, async (tx) => {
      const exists = await tx.barber.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Barbeiro não encontrado');

      if (dto.specialtyIds) {
        await this.assertServices(tx, dto.specialtyIds);
        // Substitui a lista de especialidades.
        await tx.barberService.deleteMany({ where: { barberId: id } });
        if (dto.specialtyIds.length) {
          await tx.barberService.createMany({
            data: dto.specialtyIds.map((serviceId) => ({
              tenantId,
              barberId: id,
              serviceId,
            })),
          });
        }
      }

      return tx.barber.update({
        where: { id },
        data: {
          name: dto.name,
          phone: dto.phone,
          whatsapp: dto.whatsapp,
          email: dto.email,
          pixKey: dto.pixKey,
          bankData: dto.bankData as Prisma.InputJsonValue | undefined,
          // Só regrava o CPF se vier no payload (evita apagar sem querer).
          ...(dto.document !== undefined
            ? { document: dto.document ? encryptField(dto.document) : null }
            : {}),
          birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
          address: dto.address as unknown as Prisma.InputJsonValue | undefined,
        },
        select: SELECT,
      });
    });
    return decode(barber);
  }

  async setSchedule(tenantId: string, id: string, dto: SetScheduleDto) {
    for (const it of dto.items) {
      if (it.startTime >= it.endTime) {
        throw new BadRequestException(
          `Jornada inválida (weekday ${it.weekday}): início deve ser antes do fim`,
        );
      }
    }
    return this.prisma.withTenant(tenantId, async (tx) => {
      const exists = await tx.barber.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Barbeiro não encontrado');

      await tx.workSchedule.deleteMany({ where: { barberId: id } });
      if (dto.items.length) {
        await tx.workSchedule.createMany({
          data: dto.items.map((it) => ({
            tenantId,
            barberId: id,
            weekday: it.weekday,
            startTime: it.startTime,
            endTime: it.endTime,
          })),
        });
      }
      return tx.workSchedule.findMany({
        where: { barberId: id },
        orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
        select: { weekday: true, startTime: true, endTime: true },
      });
    });
  }

  async remove(tenantId: string, id: string) {
    await this.prisma.withTenant(tenantId, async (tx) => {
      const exists = await tx.barber.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Barbeiro não encontrado');
      await tx.barber.update({ where: { id }, data: { deletedAt: new Date() } });
    });
    return { deleted: true };
  }

  /** Valida a unidade (ou resolve a padrão) dentro do tenant. */
  private async resolveUnit(
    tx: Prisma.TransactionClient,
    unitId?: string,
  ): Promise<string> {
    if (unitId) {
      const u = await tx.unit.findFirst({
        where: { id: unitId, deletedAt: null },
        select: { id: true },
      });
      if (!u) throw new BadRequestException('Unidade inválida');
      return u.id;
    }
    const first = await tx.unit.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!first) throw new BadRequestException('Nenhuma unidade cadastrada');
    return first.id;
  }

  /** Garante que todos os serviços informados pertencem a este tenant. */
  private async assertServices(
    tx: Prisma.TransactionClient,
    serviceIds?: string[],
  ) {
    if (!serviceIds?.length) return;
    const found = await tx.service.findMany({
      where: { id: { in: serviceIds }, deletedAt: null },
      select: { id: true },
    });
    if (found.length !== serviceIds.length) {
      throw new BadRequestException('Uma ou mais especialidades são inválidas');
    }
  }
}
