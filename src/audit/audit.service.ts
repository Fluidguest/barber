import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildPage, pageArgs, PageParams } from '../common/pagination';

export interface AuditEntry {
  tenantId: string;
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  ip?: string;
  after?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Registra uma ação. NUNCA lança — auditoria não pode quebrar a operação. */
  async record(e: AuditEntry): Promise<void> {
    try {
      await this.prisma.withTenant(e.tenantId, (tx) =>
        tx.auditLog.create({
          data: {
            tenantId: e.tenantId,
            userId: e.userId,
            action: e.action,
            entity: e.entity,
            entityId: e.entityId,
            ip: e.ip,
            after: e.after,
          },
        }),
      );
    } catch {
      /* silencioso de propósito */
    }
  }

  list(tenantId: string, entity?: string, pg: PageParams = {}) {
    const pa = pageArgs(pg, 50, 200);
    const where = entity ? { entity } : {};
    const select = {
      id: true,
      action: true,
      entity: true,
      entityId: true,
      userId: true,
      ip: true,
      createdAt: true,
      after: true,
    } satisfies Prisma.AuditLogSelect;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const items = await tx.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pa.skip,
        take: pa.take,
        select,
      });
      if (!pa.paginate) return items; // compatível: sem page → array
      const total = await tx.auditLog.count({ where });
      return buildPage(items, total, pa.page, pa.pageSize);
    });
  }
}
