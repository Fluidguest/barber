import * as Sentry from '@sentry/node';

/**
 * Captura de erros (Sentry) — **opt-in**.
 *
 * Sem `SENTRY_DSN` definido, tudo aqui é no-op: o sistema funciona exatamente
 * como antes. Com o DSN, erros 5xx passam a ser reportados com contexto
 * (barbearia, usuário, requisição) para você ser avisado antes do cliente.
 *
 * Não substitui os logs (pino) — complementa: log é para investigar, Sentry é
 * para ser alertado e ver a frequência/tendência.
 */

let ativo = false;

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return; // sem DSN, não inicializa

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.APP_RELEASE, // opcional: casa erro com a versão do deploy
    // Amostragem de performance: 0 por padrão (só erros). Suba se quiser tracing.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    // Não enviar dados pessoais por padrão (LGPD).
    sendDefaultPii: false,
  });
  ativo = true;
}

export function sentryEnabled(): boolean {
  return ativo;
}

/**
 * Reporta uma exceção com o contexto multi-tenant do request.
 * `who` traz tenant/usuário quando a requisição está autenticada.
 */
export function captureError(
  error: unknown,
  ctx: {
    requestId?: string;
    method?: string;
    url?: string;
    who?: { tenantId?: string; userId?: string; role?: string };
  },
): void {
  if (!ativo) return;
  Sentry.withScope((scope) => {
    if (ctx.requestId) scope.setTag('request_id', ctx.requestId);
    if (ctx.method && ctx.url) scope.setTag('route', `${ctx.method} ${ctx.url}`);
    if (ctx.who?.tenantId) scope.setTag('tenant_id', ctx.who.tenantId);
    if (ctx.who?.userId) scope.setUser({ id: ctx.who.userId });
    if (ctx.who?.role) scope.setTag('role', ctx.who.role);
    Sentry.captureException(error);
  });
}
