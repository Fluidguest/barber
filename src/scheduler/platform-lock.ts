import { PrismaClient } from '@prisma/client';

/**
 * Lock cooperativo entre instâncias da API (advisory lock do Postgres).
 *
 * Por que existe: quando a API roda em mais de uma instância, todas acordam no
 * mesmo minuto e tentariam disparar os MESMOS lembretes — o cliente receberia a
 * mensagem duplicada. O advisory lock garante que só uma execute.
 *
 * É de sessão e some sozinho se o processo morrer — não trava o sistema.
 */
export async function withPlatformLock<T>(
  db: PrismaClient,
  key: number,
  fn: () => Promise<T>,
): Promise<T | null> {
  const [{ locked }] = await db.$queryRaw<{ locked: boolean }[]>`
    SELECT pg_try_advisory_lock(${key}::bigint) AS locked
  `;
  if (!locked) return null; // outra instância já está cuidando

  try {
    return await fn();
  } finally {
    await db.$queryRaw`SELECT pg_advisory_unlock(${key}::bigint)`;
  }
}

/** Chaves fixas — uma por job, para não competirem entre si. */
export const LOCK = {
  REMINDERS: 815_001,
  TRIALS: 815_002,
} as const;
