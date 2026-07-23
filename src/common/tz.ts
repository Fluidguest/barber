/** Utilidades de fuso — mesmas regras usadas no Dashboard. */

/** Deslocamento (ms) do fuso em relação a UTC no instante `date`. */
export function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let hour = g('hour');
  if (hour === 24) hour = 0;
  const asUTC = Date.UTC(g('year'), g('month') - 1, g('day'), hour, g('minute'), g('second'));
  return asUTC - date.getTime();
}

/**
 * Converte uma data-calendário + minutos do dia **no fuso local** para o
 * instante UTC correspondente. É o inverso de `tzOffsetMs`.
 *
 * Ex.: ('2026-08-10', 9*60, 'America/Sao_Paulo') -> 2026-08-10T12:00:00Z
 *
 * Duas passadas: a primeira estima o offset, a segunda o corrige — necessário
 * porque o offset pode mudar exatamente na virada do horário de verão.
 */
export function localDateTimeToUtc(
  dateStr: string,
  minutesOfDay: number,
  timeZone: string,
): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const hh = Math.floor(minutesOfDay / 60);
  const mm = minutesOfDay % 60;
  const asIfUtc = Date.UTC(y, m - 1, d, hh, mm);
  const firstGuess = new Date(asIfUtc - tzOffsetMs(new Date(asIfUtc), timeZone));
  return new Date(asIfUtc - tzOffsetMs(firstGuess, timeZone));
}

/** Dia da semana (0=Dom) de uma data-calendário 'YYYY-MM-DD'. */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Intervalo [1º dia, 1º do mês seguinte) do mês corrente no fuso `tz`, em UTC. */
export function monthRangeUtc(
  timeZone: string,
  ref: Date = new Date(),
): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(ref);
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  const offset = tzOffsetMs(ref, timeZone);
  const start = new Date(Date.UTC(y, m - 1, 1) - offset);
  const end = new Date(Date.UTC(y, m, 1) - offset); // 1º do mês seguinte
  return { start, end };
}
