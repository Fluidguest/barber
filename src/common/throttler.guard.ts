import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate limiting (proteção contra brute-force / abuso — OWASP).
 * Pode ser desligado via THROTTLE_DISABLED=true (usado nos testes funcionais
 * para não interferir; a suíte de segurança liga explicitamente).
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(_context: ExecutionContext): Promise<boolean> {
    return process.env.THROTTLE_DISABLED === 'true';
  }
}
