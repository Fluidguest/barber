import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  create(tenantId: string, dto: CreateCategoryDto) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.serviceCategory.create({
        data: { tenantId, name: dto.name },
        select: { id: true, name: true },
      }),
    );
  }

  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.serviceCategory.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
    );
  }
}
