/**
 * Regra ÚNICA de slug de barbearia (tenant) — usada tanto no cadastro público
 * (`RegisterDto`) quanto na criação de empresa autenticada (`CreateCompanyDto`),
 * para não divergirem. O slug funciona como subdomínio: minúsculas, números e
 * hífen simples entre palavras, sem hífen no início/fim nem duplicado.
 */
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MESSAGE =
  'slug deve ser minúsculo, sem espaços, com hífen simples entre palavras (ex.: barbearia-do-ze)';
export const SLUG_MIN = 3;
export const SLUG_MAX = 40;
