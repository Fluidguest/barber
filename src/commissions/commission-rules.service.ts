import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';

const SELECT = {
  id: true,
  barberId: true,
  type: true,
  value: true,
  isActive: true,
} satisfies Prisma.CommissionRuleSelect;

@Injectable()
export class CommissionRulesService {
  constructor(private readonly prisma: PrismaService) {}

  create(tenantId: string, dto: CreateRuleDto) {
    if (dto.type === 'PERCENT' && dto.value > 10000) {
      throw new BadRequestException('Percentual não pode passar de 100% (10000)');
    }
    return this.prisma.withTenant(tenantId, async (tx) => {
      if (dto.barberId) {
        const barber = await tx.barber.findFirst({
          where: { id: dto.barberId, deletedAt: null },
          select: { id: true },
        });
        if (!barber) throw new BadRequestException('Barbeiro inválido');
      }
      return tx.commissionRule.create({
        data: {
          tenantId,
          barberId: dto.barberId,
          type: dto.type,
          value: dto.value,
        },
        select: SELECT,
      });
    });
  }

  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.commissionRule.findMany({ orderBy: { createdAt: 'desc' }, select: SELECT }),
    );
  }

  update(tenantId: string, id: string, dto: UpdateRuleDto) {
    if (dto.type === 'PERCENT' && dto.value != null && dto.value > 10000) {
      throw new BadRequestException('Percentual não pode passar de 100% (10000)');
    }
    return this.prisma.withTenant(tenantId, async (tx) => {
      const rule = await tx.commissionRule.findFirst({
        where: { id },
        select: { id: true },
      });
      if (!rule) throw new NotFoundException('Regra não encontrada');
      return tx.commissionRule.update({
        where: { id },
        data: { type: dto.type, value: dto.value, isActive: dto.isActive },
        select: SELECT,
      });
    });
  }

  async remove(tenantId: string, id: string) {
    await this.prisma.withTenant(tenantId, async (tx) => {
      const rule = await tx.commissionRule.findFirst({
        where: { id },
        select: { id: true },
      });
      if (!rule) throw new NotFoundException('Regra não encontrada');
      await tx.commissionRule.delete({ where: { id } });
    });
    return { deleted: true };
  }
}
