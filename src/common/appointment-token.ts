import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Token de auto-atendimento do agendamento — o que vai no link do lembrete
 * ("confirmar" / "cancelar").
 *
 * Stateless e assinado (HMAC): não precisa de tabela nem de login do cliente.
 * O token amarra tenant + agendamento + expiração, então:
 *  - não serve para outro agendamento (nem de outra barbearia);
 *  - deixa de valer sozinho depois do atendimento;
 *  - não pode ser forjado nem "chutado" sem o segredo do servidor.
 *
 * Formato: <tenantId>.<appointmentId>.<exp>.<assinatura>
 */

function secret(): string {
  return process.env.ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? 'dev-insecure-key';
}

function sign(tenantId: string, appointmentId: string, exp: number): string {
  return createHmac('sha256', secret())
    .update(`appt.${tenantId}.${appointmentId}.${exp}`)
    .digest('base64url');
}

/**
 * Gera o token. Vale até 24h DEPOIS do horário marcado — tempo de sobra para o
 * cliente clicar, sem virar um link eterno.
 */
export function signAppointmentToken(
  tenantId: string,
  appointmentId: string,
  startAt: Date,
): string {
  const exp = Math.floor((startAt.getTime() + 24 * 3_600_000) / 1000);
  return `${tenantId}.${appointmentId}.${exp}.${sign(tenantId, appointmentId, exp)}`;
}

/** Valida o token e devolve os ids, ou `null` se inválido/expirado. */
export function verifyAppointmentToken(
  token: string,
): { tenantId: string; appointmentId: string } | null {
  const parts = token?.split('.');
  if (!parts || parts.length !== 4) return null;
  const [tenantId, appointmentId, expStr, sig] = parts;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;

  const expected = Buffer.from(sign(tenantId, appointmentId, exp));
  const received = Buffer.from(sig);
  if (expected.length !== received.length) return null;
  return timingSafeEqual(expected, received) ? { tenantId, appointmentId } : null;
}
