import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTimeBlockDto } from './dto/create-time-block.dto';

const SELECT = {
  id: true,
  barberId: true,
  startAt: true,
  endAt: true,
  reason: true,
} satisfies Prisma.TimeBlockSelect;

@Injectable()
export class TimeBlocksService {
  constructor(private readonly prisma: PrismaService) {}

  create(tenantId: string, dto: CreateTimeBlockDto) {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (endAt <= startAt) {
      throw new BadRequestException('Fim deve ser depois do início');
    }
    return this.prisma.withTenant(tenantId, async (tx) => {
      let unitId: string;
      if (dto.barberId) {
        const barber = await tx.barber.findFirst({
          where: { id: dto.barberId, deletedAt: null },
          select: { unitId: true },
        });
        if (!barber) throw new BadRequestException('Barbeiro inválido');
        unitId = barber.unitId;
      } else {
        const unit = await tx.unit.findFirst({
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (!unit) throw new BadRequestException('Nenhuma unidade cadastrada');
        unitId = unit.id;
      }
      return tx.timeBlock.create({
        data: {
          tenantId,
          unitId,
          barberId: dto.barberId,
          startAt,
          endAt,
          reason: dto.reason,
        },
        select: SELECT,
      });
    });
  }

  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.timeBlock.findMany({
        orderBy: { startAt: 'asc' },
        select: SELECT,
      }),
    );
  }
}
