import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

const SELECT = {
  id: true,
  name: true,
  description: true,
  durationMin: true,
  priceCents: true,
  categoryId: true,
  isActive: true,
} satisfies Prisma.ServiceSelect;

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  create(tenantId: string, dto: CreateServiceDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      await this.assertCategory(tx, dto.categoryId);
      return tx.service.create({
        data: {
          tenantId,
          name: dto.name,
          description: dto.description,
          durationMin: dto.durationMin,
          priceCents: dto.priceCents,
          categoryId: dto.categoryId,
        },
        select: SELECT,
      });
    });
  }

  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.service.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        select: SELECT,
      }),
    );
  }

  async get(tenantId: string, id: string) {
    const svc = await this.prisma.withTenant(tenantId, (tx) =>
      tx.service.findFirst({ where: { id, deletedAt: null }, select: SELECT }),
    );
    if (!svc) throw new NotFoundException('Serviço não encontrado');
    return svc;
  }

  update(tenantId: string, id: string, dto: UpdateServiceDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const exists = await tx.service.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Serviço não encontrado');
      await this.assertCategory(tx, dto.categoryId);
      return tx.service.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          durationMin: dto.durationMin,
          priceCents: dto.priceCents,
          categoryId: dto.categoryId,
          isActive: dto.isActive,
        },
        select: SELECT,
      });
    });
  }

  async remove(tenantId: string, id: string) {
    await this.prisma.withTenant(tenantId, async (tx) => {
      const exists = await tx.service.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Serviço não encontrado');
      await tx.service.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });
    });
    return { deleted: true };
  }

  /** Garante que a categoria (se informada) pertence a este tenant. */
  private async assertCategory(
    tx: Prisma.TransactionClient,
    categoryId?: string,
  ) {
    if (!categoryId) return;
    const cat = await tx.serviceCategory.findFirst({
      where: { id: categoryId, deletedAt: null },
      select: { id: true },
    });
    if (!cat) throw new BadRequestException('Categoria inválida');
  }
}
