import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ALLOW_SUSPENDED } from '../common/allow-suspended.decorator';

export interface AuthUser {
  userId: string;
  tenantId: string;
  role: string;
}

/**
 * Valida o Bearer token, anexa `req.user` (com o tenantId que amarra a RLS) e
 * bloqueia tenants SUSPENDED/CANCELED (inadimplência) — exceto rotas marcadas
 * com @AllowSuspended (login/billing).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token ausente');
    }
    const token = header.slice('Bearer '.length);

    let user: AuthUser;
    let impersonatedBy: string | undefined;
    try {
      const payload = await this.jwt.verifyAsync(token);
      user = {
        userId: payload.sub,
        tenantId: payload.tenantId,
        role: payload.role,
      };
      impersonatedBy = payload.impersonatedBy;
      if (!user.userId || !user.tenantId) {
        throw new UnauthorizedException('Token inválido');
      }
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }
    (req as Request & { user: AuthUser }).user = user;

    // Sessão de suporte do operador (impersonation) é SOMENTE LEITURA: só GET.
    // Qualquer escrita é bloqueada — o operador inspeciona sem alterar dados.
    if (impersonatedBy && req.method !== 'GET') {
      throw new ForbiddenException(
        'Sessão de suporte é somente leitura. Ações de escrita não são permitidas.',
      );
    }

    // Rotas @AllowSuspended pulam a checagem de status (login/billing).
    const allowSuspended = this.reflector.getAllAndOverride<boolean>(
      ALLOW_SUSPENDED,
      [context.getHandler(), context.getClass()],
    );
    if (!allowSuspended) {
      // `tenants` não tem RLS — leitura direta pelo id é segura.
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { status: true },
      });
      if (tenant?.status === 'SUSPENDED' || tenant?.status === 'CANCELED') {
        throw new HttpException(
          'Assinatura suspensa ou cancelada. Regularize o pagamento.',
          402,
        );
      }
    }
    return true;
  }
}
