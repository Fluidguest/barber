import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { SystemPrismaService } from '../prisma/system-prisma.service';
import { PLATFORM_SCOPE } from './platform-auth.guard';

/**
 * Painel do operador da plataforma: visão e controle das barbearias clientes.
 *
 * Usa a conexão de sistema porque **atravessar tenants é justamente a função**
 * deste módulo. Em compensação, expõe apenas dados de PLATAFORMA (nome, status,
 * assinatura, volumes agregados) — nunca dados de negócio da barbearia
 * (clientes, faturamento, conversas). Suporte que precise disso deve pedir
 * acesso ao dono da barbearia.
 */
@Injectable()
export class PlatformService {
  private readonly logger = new Logger('Platform');

  constructor(
    private readonly system: SystemPrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const admin = await this.system.platformAdmin.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    // Verifica sempre (mesmo sem admin) para não vazar quais e-mails existem.
    const hash = admin?.passwordHash ?? DUMMY_HASH;
    const ok = await argon2.verify(hash, password).catch(() => false);
    if (!admin || !admin.isActive || !ok) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    await this.system.platformAdmin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = await this.jwt.signAsync(
      { sub: admin.id, email: admin.email, scope: PLATFORM_SCOPE },
      { expiresIn: Number(process.env.JWT_ACCESS_TTL ?? 900) },
    );
    this.logger.log(`Login de plataforma: ${admin.email}`);
    return { accessToken, name: admin.name, email: admin.email };
  }

  /** Visão geral do negócio. */
  async stats() {
    const [total, ativas, teste, suspensas, canceladas] = await Promise.all([
      this.system.tenant.count({ where: { deletedAt: null } }),
      this.system.tenant.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      this.system.tenant.count({ where: { deletedAt: null, status: 'TRIAL' } }),
      this.system.tenant.count({ where: { deletedAt: null, status: 'SUSPENDED' } }),
      this.system.tenant.count({ where: { deletedAt: null, status: 'CANCELED' } }),
    ]);
    return { total, ativas, teste, suspensas, canceladas };
  }

  /** Lista as barbearias clientes. */
  async listTenants(search?: string) {
    const tenants = await this.system.tenant.findMany({
      where: {
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { slug: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        subscription: {
          select: { status: true, trialEndsAt: true, currentPeriodEnd: true },
        },
        _count: { select: { users: true } },
      },
    });
    return tenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      status: t.status,
      createdAt: t.createdAt,
      users: t._count.users,
      subscription: t.subscription,
    }));
  }

  /** Detalhe de uma barbearia — só métricas de plataforma. */
  async getTenant(id: string) {
    const t = await this.system.tenant.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        subscription: {
          select: {
            status: true,
            trialEndsAt: true,
            currentPeriodEnd: true,
            plan: { select: { name: true, priceCents: true } },
          },
        },
        _count: {
          select: { users: true, clients: true, appointments: true, units: true },
        },
      },
    });
    if (!t) throw new NotFoundException('Barbearia não encontrada');
    return {
      ...t,
      volumes: t._count, // contagens agregadas, sem conteúdo
      _count: undefined,
    };
  }

  /** Suspende manualmente (inadimplência, abuso, pedido do cliente). */
  async suspend(id: string, adminEmail: string) {
    return this.setStatus(id, 'SUSPENDED', adminEmail);
  }

  /** Reativa uma barbearia suspensa. */
  async reactivate(id: string, adminEmail: string) {
    return this.setStatus(id, 'ACTIVE', adminEmail);
  }

  private async setStatus(
    id: string,
    status: 'ACTIVE' | 'SUSPENDED',
    adminEmail: string,
  ) {
    const t = await this.system.tenant.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, slug: true, status: true },
    });
    if (!t) throw new NotFoundException('Barbearia não encontrada');

    await this.system.tenant.update({ where: { id }, data: { status } });
    // Ação sensível: fica registrada no log com quem fez.
    this.logger.warn(
      `${adminEmail} alterou ${t.slug}: ${t.status} → ${status}`,
    );
    return { id, slug: t.slug, status };
  }
}

/** Hash descartável para igualar o tempo de resposta quando o e-mail não existe. */
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHR2YWx1ZQ$3hb1Zc5xF0Q1s2vJ0kKQ0YQxLZ0gk1xF0Q1s2vJ0kKQ';
