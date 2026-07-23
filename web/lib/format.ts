export const brl = (cents: number) =>
  ((cents ?? 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

export const reaisToCents = (s: string) =>
  Math.round((parseFloat(String(s).replace(",", ".")) || 0) * 100);

export const timeBR = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

/** Início e fim do dia local (para consultar a agenda de hoje). */
export function todayRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(from.getTime() + 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Agendado",
  CONFIRMED: "Confirmado",
  DONE: "Concluído",
  CANCELED: "Cancelado",
  NO_SHOW: "Faltou",
};

export const STATUS_COLOR: Record<string, string> = {
  SCHEDULED: "text-muted",
  CONFIRMED: "text-primary",
  DONE: "text-success",
  CANCELED: "text-danger",
  NO_SHOW: "text-warning",
};
