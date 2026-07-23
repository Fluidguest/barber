import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Cliente Prisma base + helper de tenant (ADR-001).
 *
 * REGRA: toda operação em tabela com RLS deve rodar dentro de `withTenant`,
 * que abre UMA transação e seta `app.current_tenant` como GUC local. Assim o
 * set_config e as queries caem na MESMA conexão do pool (ver prisma/rls/README.md).
 *
 * Tabelas SEM RLS (tenants, plans) podem ser acessadas direto no client base.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma conectado');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Executa `fn` com o tenant corrente setado, tudo na mesma transação.
   * Use `tx` (não o client base) para todas as queries dentro de `fn`.
   */
  async withTenant<T>(
    tenantId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!tenantId) {
      throw new Error('withTenant chamado sem tenantId');
    }
    return this.$transaction(async (tx) => {
      // `true` = escopo de transação: morre no fim da tx (seguro no pool).
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
      return fn(tx);
    });
  }
}
