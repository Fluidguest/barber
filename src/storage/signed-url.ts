import { createHmac, timingSafeEqual } from 'crypto';

/**
 * URLs de mídia assinadas (HMAC-SHA256) para uso em <img>/<audio> sem mandar o
 * access token na query (evita vazamento em log/Referer). A assinatura cobre
 * tenant + id do arquivo + expiração — adulterar qualquer parte invalida.
 *
 * Formato: /api/storage/<id>?t=<tenant>&exp=<epoch_ms>&sig=<hmac_hex>
 */

const TTL_MS = 15 * 60 * 1000; // 15 min

function secret(): string {
  // Reusa o segredo do JWT (processo assina e verifica — não precisa casar com
  // nada externo). Em produção já é um segredo forte por env.
  return process.env.JWT_SECRET || 'dev-storage-secret';
}

function sign(tenantId: string, id: string, exp: number): string {
  return createHmac('sha256', secret())
    .update(`${tenantId}.${id}.${exp}`)
    .digest('hex');
}

export function signedMediaUrl(tenantId: string, id: string): string {
  const exp = Date.now() + TTL_MS;
  const sig = sign(tenantId, id, exp);
  return `/api/storage/${id}?t=${encodeURIComponent(tenantId)}&exp=${exp}&sig=${sig}`;
}

/** Retorna o tenantId se a assinatura for válida e não expirada; senão null. */
export function verifySignedUrl(
  id: string,
  t?: string,
  exp?: string,
  sig?: string,
): string | null {
  if (!t || !exp || !sig) return null;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Date.now()) return null;
  const tenantId = decodeURIComponent(t);
  const expected = sign(tenantId, id, expNum);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  try {
    return timingSafeEqual(a, b) ? tenantId : null;
  } catch {
    return null;
  }
}
