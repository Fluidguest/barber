import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Conexão privilegiada (dono do banco, DIRECT_URL) que BYPASSA a RLS.
 *
 * ⚠️ USO RESTRITO: apenas ingressos de sistema que legitimamente cruzam a
 * fronteira de tenant sem um usuário autenticado — resolver um identificador
 * externo -> tenantId em webhooks (billing, WhatsApp). Depois de descobrir o
 * tenant, TODO o resto processa por `PrismaService.withTenant` (sob RLS).
 * Nunca use isto para servir requests autenticados.
 */
@Injectable()
export class SystemPrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({ datasources: { db: { url: process.env.DIRECT_URL } } });
  }
  onModuleInit() {
    return this.$connect();
  }
  onModuleDestroy() {
    return this.$disconnect();
  }
}
