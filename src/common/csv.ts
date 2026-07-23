/**
 * Geração de CSV para exportação de relatórios.
 *
 * Convenções brasileiras (o destino é o Excel do dono da barbearia):
 *  - separador `;` (no pt-BR o Excel espera ponto-e-vírgula);
 *  - decimal com **vírgula**;
 *  - **BOM** UTF-8 no início, senão o Excel corrompe acentos.
 */

export interface CsvColumn<T> {
  header: string;
  /** Valor da célula. Number vira decimal pt-BR; Date vira dd/mm/aaaa. */
  value: (row: T) => string | number | Date | null | undefined;
}

const BOM = '﻿';

/** Escapa uma célula: aspas quando houver `;`, aspas ou quebra de linha. */
function cell(v: string | number | Date | null | undefined): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (v instanceof Date) {
    s = v.toLocaleDateString('pt-BR');
  } else if (typeof v === 'number') {
    s = String(v).replace('.', ',');
  } else {
    s = v;
  }
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => cell(c.header)).join(';');
  const body = rows.map((r) => columns.map((c) => cell(c.value(r))).join(';'));
  return BOM + [head, ...body].join('\r\n') + '\r\n';
}

/** Centavos → "1234,56" (sem símbolo, para o Excel entender como número). */
export function money(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/** Nome de arquivo seguro, com o período no final. */
export function csvFilename(base: string, from: Date, to: Date): string {
  const d = (x: Date) => x.toISOString().slice(0, 10);
  return `${base}_${d(from)}_a_${d(to)}.csv`;
}
