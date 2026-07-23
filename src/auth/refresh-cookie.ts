import type { Request, Response } from 'express';

/**
 * Cookie httpOnly do refresh token.
 *
 * Por que cookie e não localStorage: um XSS no frontend consegue ler
 * `localStorage`, mas NÃO consegue ler um cookie `httpOnly`. O refresh token é
 * o alvo mais valioso (renova sessões), então ele fica só no cookie.
 *
 * - `httpOnly`: invisível ao JavaScript.
 * - `secure`: só trafega em HTTPS (ligado fora de dev).
 * - `sameSite=lax`: mitiga CSRF em navegação cross-site.
 * - `path=/api/auth`: o cookie só é enviado aos endpoints de auth.
 *
 * Leitura sem `cookie-parser`: parseamos o header `Cookie` na mão (zero dep).
 */
export const REFRESH_COOKIE = 'refresh_token';
const COOKIE_PATH = '/api/auth';

const isProd = () => process.env.NODE_ENV === 'production';

function maxAgeMs(): number {
  const days = Number(process.env.REFRESH_TTL_DAYS ?? 30);
  return days * 24 * 60 * 60 * 1000;
}

type SameSite = 'lax' | 'strict' | 'none';

/**
 * `COOKIE_SAMESITE` decide como o cookie viaja entre origens:
 *
 * - `lax` (padrão): serve quando frontend e API compartilham o mesmo domínio
 *   registrável (ex.: `app.barber.com` + `api.barber.com`) ou rodam atrás do
 *   mesmo proxy. **Não** é enviado em `fetch` cross-site.
 * - `none`: obrigatório quando frontend e API estão em domínios DIFERENTES
 *   (ex.: Vercel + Render). Exige `Secure` (HTTPS) — os navegadores rejeitam
 *   `SameSite=None` sem ele, então forçamos `secure` nesse caso.
 * - `strict`: mais rígido; quebra fluxos de retorno de redirect externo.
 */
function sameSite(): SameSite {
  const v = (process.env.COOKIE_SAMESITE ?? 'lax').toLowerCase();
  return v === 'none' || v === 'strict' ? v : 'lax';
}

/** `Secure` em produção; forçado quando SameSite=None (exigência do browser). */
function secure(): boolean {
  return isProd() || sameSite() === 'none';
}

/** Domínio opcional — use para compartilhar o cookie entre subdomínios. */
function domain(): string | undefined {
  return process.env.COOKIE_DOMAIN?.trim() || undefined;
}

export function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: secure(),
    sameSite: sameSite(),
    path: COOKIE_PATH,
    domain: domain(),
    maxAge: maxAgeMs(),
  });
}

export function clearRefreshCookie(res: Response) {
  // As opções devem casar com as do set, senão o browser não remove.
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: secure(),
    sameSite: sameSite(),
    path: COOKIE_PATH,
    domain: domain(),
  });
}

export function readRefreshCookie(req: Request): string | undefined {
  const header = req.headers?.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    if (name === REFRESH_COOKIE) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return undefined;
}
