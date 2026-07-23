import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { concatMap } from 'rxjs/operators';
import { AuditService } from './audit.service';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Registra em audit_logs toda ação AUTENTICADA de escrita (POST/PATCH/PUT/DELETE),
 * após o sucesso. Não loga o corpo (evita senha/CPF em log) — só metadados:
 * quem, quando, método, entidade, id e IP. Aguarda a gravação (concatMap) para
 * a trilha ser durável antes de responder.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    if (!MUTATING.has(req.method)) return next.handle();

    return next.handle().pipe(
      concatMap(async (result) => {
        const user = req.user; // setado pelo JwtAuthGuard
        if (user?.tenantId) {
          const path: string = req.path ?? req.url ?? '';
          const parts = path.split('/').filter(Boolean); // ['api','clients','id']
          const entity = parts[1] ?? 'unknown';
          const entityId =
            req.params?.id ??
            (result && typeof result === 'object'
              ? (result as { id?: string }).id
              : undefined);
          await this.audit.record({
            tenantId: user.tenantId,
            userId: user.userId,
            action: req.method,
            entity,
            entityId,
            ip: req.ip,
            after: { path },
          });
        }
        return result;
      }),
    );
  }
}
