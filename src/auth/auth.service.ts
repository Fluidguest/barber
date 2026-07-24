import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SystemPrismaService } from '../prisma/system-prisma.service';
import { MailService } from '../mail/mail.service';
import { encryptField, decryptField } from '../common/crypto.util';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthUser } from './jwt-auth.guard';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
  ) {}

  async register(dto: RegisterDto): Promise<TokenPair & { tenantId: string }> {
    // Registro público: nova conta-dono (ownerAccountId novo).
    const result = await this.provisionCompany({
      barbershopName: dto.barbershopName,
      slug: dto.slug,
      adminName: dto.adminName,
      email: dto.email,
      passwordHash: await argon2.hash(dto.password),
      ownerAccountId: randomUUID(),
    });

    return result;
  }

  async login(dto: LoginDto): Promise<TokenPair & { tenantId: string }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });
    if (!tenant || tenant.deletedAt) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    return this.prisma.withTenant(tenant.id, async (tx) => {
      const user = await tx.user.findUnique({
        where: { tenantId_email: { tenantId: tenant.id, email: dto.email } },
      });
      // argon2.verify sempre roda (mesmo sem user) p/ reduzir enumeração de e-mail.
      const hash = user?.passwordHash ?? DUMMY_HASH;
      const ok = await argon2.verify(hash, dto.password).catch(() => false);
      if (!user || !user.isActive || !ok) {
        throw new UnauthorizedException('Credenciais inválidas');
      }
      // Segundo fator (TOTP), se ativo para este usuário.
      if (user.totpEnabled) {
        if (!dto.code) {
          throw new UnauthorizedException('Código de autenticação (2FA) necessário');
        }
        const secret = decryptField(user.totpSecret);
        if (!secret || !authenticator.verify({ token: dto.code, secret })) {
          throw new UnauthorizedException('Código 2FA inválido');
        }
      }
      const tokens = await this.issueTokens(tx, user.id, tenant.id, user.role);
      return { tenantId: tenant.id, ...tokens };
    });
  }

  async refresh(refreshToken: string): Promise<TokenPair & { tenantId: string }> {
    const tenantId = refreshToken.split('.')[0];
    if (!tenantId) throw new UnauthorizedException('Refresh inválido');
    const tokenHash = hashToken(refreshToken);

    return this.prisma.withTenant(tenantId, async (tx) => {
      const stored = await tx.refreshToken.findUnique({ where: { tokenHash } });
      if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
        throw new UnauthorizedException('Refresh inválido ou expirado');
      }
      const user = await tx.user.findUnique({ where: { id: stored.userId } });
      if (!user || !user.isActive) {
        throw new UnauthorizedException('Usuário inativo');
      }
      // Rotação: revoga o antigo e emite um novo par.
      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });
      const tokens = await this.issueTokens(tx, user.id, tenantId, user.role);
      return { tenantId, ...tokens };
    });
  }

  // ---- Redefinição de senha ("esqueci minha senha") ----------------------

  /**
   * Gera um token de reset e envia por e-mail.
   *
   * Segurança: responde SEMPRE da mesma forma, exista ou não a conta — não
   * revela quais e-mails estão cadastrados (enumeração). O token em claro só
   * viaja no e-mail; no banco fica apenas o hash, com expiração e uso único.
   */
  async forgotPassword(slug: string, email: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant || tenant.deletedAt) return; // silencioso de propósito

    const minutes = Number(process.env.RESET_TOKEN_TTL_MIN ?? 60);

    await this.prisma.withTenant(tenant.id, async (tx) => {
      const user = await tx.user.findUnique({
        where: { tenantId_email: { tenantId: tenant.id, email } },
      });
      if (!user || !user.isActive || user.deletedAt) return; // silencioso

      // Invalida pedidos anteriores ainda abertos (um link válido por vez).
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      const raw = `${tenant.id}.${randomBytes(32).toString('base64url')}`;
      await tx.passwordResetToken.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          tokenHash: hashToken(raw),
          expiresAt: new Date(Date.now() + minutes * 60_000),
        },
      });

      const base = process.env.APP_URL ?? 'http://localhost:3100';
      const link = `${base}/reset-password?token=${encodeURIComponent(raw)}`;
      await this.mail.sendPasswordReset(user.email, user.name, link, minutes);
    });
  }

  /**
   * Consome o token e troca a senha. Revoga TODAS as sessões do usuário —
   * se um invasor tinha um refresh válido, ele morre aqui.
   */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tenantId = rawToken.split('.')[0];
    if (!tenantId) throw new BadRequestException('Token inválido');
    const tokenHash = hashToken(rawToken);

    await this.prisma.withTenant(tenantId, async (tx) => {
      const stored = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
      if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
        throw new BadRequestException('Token inválido ou expirado');
      }
      const user = await tx.user.findUnique({ where: { id: stored.userId } });
      if (!user || !user.isActive || user.deletedAt) {
        throw new BadRequestException('Token inválido ou expirado');
      }

      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: await argon2.hash(newPassword) },
      });
      // Uso único.
      await tx.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      });
      // Derruba todas as sessões ativas do usuário.
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  /** Revoga o refresh token (logout). Idempotente: token inválido é ignorado. */
  async logout(refreshToken: string): Promise<void> {
    const tenantId = refreshToken.split('.')[0];
    if (!tenantId) return;
    const tokenHash = hashToken(refreshToken);
    await this.prisma.withTenant(tenantId, async (tx) => {
      await tx.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  async me(user: AuthUser) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.user.findUnique({
        where: { id: user.userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          tenantId: true,
          totpEnabled: true,
        },
      }),
    );
  }

  // ---- Multiempresa (conta-dono) -----------------------------------------

  /**
   * Cria uma barbearia (tenant) + unidade Matriz + usuário admin, sob um
   * `ownerAccountId`. Usado pelo registro público (owner novo) e pela criação
   * de empresa por um dono já autenticado (reusa o owner dele).
   */
  private async provisionCompany(input: {
    barbershopName: string;
    slug: string;
    adminName: string;
    email: string;
    passwordHash: string;
    ownerAccountId: string;
  }): Promise<TokenPair & { tenantId: string }> {
    const existing = await this.prisma.tenant.findUnique({
      where: { slug: input.slug },
    });
    if (existing) throw new ConflictException('Slug de barbearia já está em uso');

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: input.barbershopName, slug: input.slug, status: 'TRIAL' },
      });
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenant.id}, true)`;
      await tx.unit.create({ data: { tenantId: tenant.id, name: 'Matriz' } });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: input.adminName,
          email: input.email,
          passwordHash: input.passwordHash,
          role: 'ADMIN',
          isActive: true,
          ownerAccountId: input.ownerAccountId,
        },
      });
      const tokens = await this.issueTokens(tx, user.id, tenant.id, user.role);
      return { tenantId: tenant.id, ...tokens };
    });
  }

  /**
   * Empresas às quais a conta-dono do usuário tem acesso (para alternar).
   * Cruza tenants pela conexão de sistema (é uma leitura cross-tenant legítima),
   * agrupando por `ownerAccountId` — nunca por e-mail.
   */
  async listCompanies(user: AuthUser) {
    const me = await this.system.user.findUnique({
      where: { id: user.userId },
      select: { ownerAccountId: true },
    });
    if (!me?.ownerAccountId) {
      // Usuário sem conta-dono: só a empresa atual.
      const t = await this.system.tenant.findUnique({
        where: { id: user.tenantId },
        select: { id: true, name: true, slug: true, status: true },
      });
      return t ? [{ ...t, role: user.role, current: true }] : [];
    }
    const users = await this.system.user.findMany({
      where: {
        ownerAccountId: me.ownerAccountId,
        isActive: true,
        deletedAt: null,
        tenant: { deletedAt: null },
      },
      select: {
        role: true,
        tenant: { select: { id: true, name: true, slug: true, status: true } },
      },
      orderBy: { tenant: { name: 'asc' } },
    });
    return users.map((u) => ({
      id: u.tenant.id,
      name: u.tenant.name,
      slug: u.tenant.slug,
      status: u.tenant.status,
      role: u.role,
      current: u.tenant.id === user.tenantId,
    }));
  }

  /**
   * Cria uma nova empresa vinculada à MESMA conta-dono do usuário autenticado
   * (é o que dá acesso multiempresa de forma segura). NÃO troca a sessão atual.
   */
  async createCompany(
    user: AuthUser,
    dto: { barbershopName: string; slug: string },
  ) {
    const me = await this.system.user.findUnique({
      where: { id: user.userId },
      select: { name: true, email: true, passwordHash: true, ownerAccountId: true },
    });
    if (!me) throw new UnauthorizedException('Usuário inválido');
    const ownerAccountId = me.ownerAccountId ?? user.userId;

    const created = await this.provisionCompany({
      barbershopName: dto.barbershopName,
      slug: dto.slug,
      adminName: me.name,
      email: me.email,
      passwordHash: me.passwordHash, // mesma credencial da conta-dono
      ownerAccountId,
    });

    // Garante que o usuário atual também fique marcado com o ownerAccountId.
    if (!me.ownerAccountId) {
      await this.system.user.update({
        where: { id: user.userId },
        data: { ownerAccountId },
      });
    }
    return { tenantId: created.tenantId };
  }

  /**
   * Alterna a empresa ativa: emite um novo par de tokens para o usuário da
   * conta-dono na empresa escolhida. Só permite empresas do mesmo
   * `ownerAccountId` (verificado) — impede pular para tenant de terceiros.
   */
  async switchCompany(
    user: AuthUser,
    tenantId: string,
  ): Promise<TokenPair & { tenantId: string }> {
    const me = await this.system.user.findUnique({
      where: { id: user.userId },
      select: { ownerAccountId: true },
    });
    if (!me?.ownerAccountId) {
      throw new UnauthorizedException('Conta sem acesso multiempresa');
    }
    const target = await this.system.user.findFirst({
      where: {
        tenantId,
        ownerAccountId: me.ownerAccountId,
        isActive: true,
        deletedAt: null,
        tenant: { deletedAt: null },
      },
      select: { id: true, role: true, tenantId: true },
    });
    if (!target) {
      throw new UnauthorizedException('Você não tem acesso a essa empresa');
    }
    return this.prisma.withTenant(tenantId, async (tx) => {
      const tokens = await this.issueTokens(tx, target.id, tenantId, target.role);
      return { tenantId, ...tokens };
    });
  }

  /** Renomeia uma empresa da conta-dono (Controle Geral). */
  async renameCompany(user: AuthUser, tenantId: string, name: string) {
    const me = await this.system.user.findUnique({
      where: { id: user.userId },
      select: { ownerAccountId: true },
    });
    const ok = await this.system.user.findFirst({
      where: {
        tenantId,
        ownerAccountId: me?.ownerAccountId ?? '__none__',
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!ok) throw new UnauthorizedException('Sem acesso a essa empresa');
    await this.system.tenant.update({ where: { id: tenantId }, data: { name } });
    return { id: tenantId, name };
  }

  // ---- 2FA (TOTP) --------------------------------------------------------

  /** Gera um segredo TOTP (cifrado em repouso). Ainda NÃO ativa o 2FA. */
  async setup2fa(user: AuthUser) {
    const secret = authenticator.generateSecret();
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const dbUser = await tx.user.findUnique({
        where: { id: user.userId },
        select: { email: true },
      });
      const otpauthUrl = authenticator.keyuri(
        dbUser?.email ?? 'user',
        'Barber SaaS',
        secret,
      );
      await tx.user.update({
        where: { id: user.userId },
        data: { totpSecret: encryptField(secret), totpEnabled: false },
      });
      return { secret, otpauthUrl };
    });
  }

  /** Confirma o código do app autenticador e ATIVA o 2FA. */
  async enable2fa(user: AuthUser, code: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const dbUser = await tx.user.findUnique({
        where: { id: user.userId },
        select: { totpSecret: true },
      });
      if (!dbUser?.totpSecret) {
        throw new BadRequestException('Configure o 2FA primeiro (setup)');
      }
      const secret = decryptField(dbUser.totpSecret);
      if (!secret || !authenticator.verify({ token: code, secret })) {
        throw new UnauthorizedException('Código inválido');
      }
      await tx.user.update({
        where: { id: user.userId },
        data: { totpEnabled: true },
      });
      return { enabled: true };
    });
  }

  /** Desativa o 2FA (exige um código válido). */
  async disable2fa(user: AuthUser, code: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const dbUser = await tx.user.findUnique({
        where: { id: user.userId },
        select: { totpSecret: true, totpEnabled: true },
      });
      const secret = dbUser?.totpSecret ? decryptField(dbUser.totpSecret) : null;
      if (!dbUser?.totpEnabled || !secret || !authenticator.verify({ token: code, secret })) {
        throw new UnauthorizedException('Código inválido');
      }
      await tx.user.update({
        where: { id: user.userId },
        data: { totpEnabled: false, totpSecret: null },
      });
      return { enabled: false };
    });
  }

  private async issueTokens(
    tx: Prisma.TransactionClient,
    userId: string,
    tenantId: string,
    role: string,
  ): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, tenantId, role },
      { expiresIn: Number(process.env.JWT_ACCESS_TTL ?? 900) },
    );

    // Refresh opaco, prefixado com o tenantId (não sensível) para resolver a
    // RLS na renovação. Guardamos só o HASH.
    const secret = randomBytes(32).toString('base64url');
    const refreshToken = `${tenantId}.${secret}`;
    const days = Number(process.env.REFRESH_TTL_DAYS ?? 30);
    await tx.refreshToken.create({
      data: {
        tenantId,
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + days * 86_400_000),
      },
    });

    return { accessToken, refreshToken };
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Hash argon2 fixo de uma senha aleatória — usado só para igualar o tempo de
// resposta quando o e-mail não existe (mitiga enumeração de usuários).
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$3g2Z5r8m1uJ0i9xq7wYz0Xb1cD2eF3gH4iJ5kL6mN8';
