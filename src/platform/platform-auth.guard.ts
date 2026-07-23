import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { SystemPrismaService } from '../prisma/system-prisma.service';

export interface PlatformUser {
  adminId: string;
  email: string;
}

/** Marca no JWT que identifica um token do painel da plataforma. */
export const PLATFORM_SCOPE = 'platform';

/**
 * Guard do painel da plataforma.
 *
 * A fronteira de identidade é dupla e proposital:
 *  - token de barbearia **não tem** `scope=platform` → não entra aqui;
 *  - token de plataforma **não tem** `tenantId` → é rejeitado pelo
 *    `JwtAuthGuard` das rotas de barbearia.
 *
 * Além disso o admin é reconferido no banco a cada request: desativá-lo corta
 * o acesso na hora, sem esperar o token expirar.
 */
@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly system: SystemPrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token ausente');
    }

    let adminId: string;
    let email: string;
    try {
      const payload = await this.jwt.verifyAsync(header.slice('Bearer '.length));
      if (payload.scope !== PLATFORM_SCOPE || !payload.sub) {
        throw new Error('escopo inválido');
      }
      adminId = payload.sub;
      email = payload.email;
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    const admin = await this.system.platformAdmin.findUnique({
      where: { id: adminId },
      select: { id: true, isActive: true },
    });
    if (!admin?.isActive) {
      throw new UnauthorizedException('Acesso revogado');
    }

    (req as Request & { platform: PlatformUser }).platform = { adminId, email };
    return true;
  }
}
