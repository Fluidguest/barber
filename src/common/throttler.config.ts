import { ThrottlerModuleOptions } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';

/**
 * Configuração do rate limit.
 *
 * Com UMA instância, o storage em memória basta. Com MAIS DE UMA (atrás de load
 * balancer), cada instância contaria separado e o limite efetivo viraria N× —
 * por isso, quando `THROTTLE_REDIS_URL`/`REDIS_URL` está definido, o contador
 * passa a ser compartilhado no Redis e o limite vale para o cluster inteiro.
 *
 * Sem a env, cai no comportamento antigo (memória) — nada muda em dev.
 */
export function throttlerConfig(): ThrottlerModuleOptions {
  const limit = Number(process.env.THROTTLE_LIMIT ?? 300);
  const base: ThrottlerModuleOptions = {
    throttlers: [{ ttl: 60_000, limit }],
  };

  const url = process.env.THROTTLE_REDIS_URL ?? process.env.REDIS_URL;
  // Em teste nunca usa Redis (a suíte não sobe um).
  const isTest = process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;
  if (!url || isTest) return base;

  return {
    ...base,
    storage: new ThrottlerStorageRedisService(url),
  };
}
