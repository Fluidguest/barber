-- ============================================================================
--  Constraints de integridade que o Prisma não expressa.
--  Rodar como DONO/ADMIN, após `prisma migrate`, como migration manual.
--  (Prisma não gerencia estas; ele não as remove se adicionadas via migration.)
-- ============================================================================

-- Necessário para o EXCLUDE com igualdade + sobreposição de intervalo.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1) Nenhum barbeiro pode ter dois atendimentos que se sobrepõem no tempo.
--    Garantido no BANCO (não só na app) -> impossível criar overbooking mesmo
--    com corrida de requests concorrentes.
--    - barber_id iguais + intervalos que se cruzam = rejeitado.
--    - Cancelados/no-show e soft-deletados não contam.
--    - barber_id é global (cuid), então não há falso conflito entre tenants.
--    - Bordas [ ) (tsrange padrão): fim == próximo início NÃO conflita
--      (agendamentos encostados são permitidos).
ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_no_overlap;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_no_overlap
  EXCLUDE USING gist (
    barber_id WITH =,
    tsrange(start_at, end_at) WITH &&
  )
  WHERE (status NOT IN ('CANCELED', 'NO_SHOW') AND deleted_at IS NULL);

-- 2) Intervalos válidos (fim > início).
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_time_valid;
ALTER TABLE appointments ADD CONSTRAINT appointments_time_valid CHECK (end_at > start_at);

ALTER TABLE time_blocks DROP CONSTRAINT IF EXISTS time_blocks_time_valid;
ALTER TABLE time_blocks ADD CONSTRAINT time_blocks_time_valid CHECK (end_at > start_at);

ALTER TABLE days_off DROP CONSTRAINT IF EXISTS days_off_time_valid;
ALTER TABLE days_off ADD CONSTRAINT days_off_time_valid CHECK (end_at > start_at);

-- 3) Valores monetários não-negativos (defesa contra dado corrompido).
ALTER TABLE services            DROP CONSTRAINT IF EXISTS services_price_nonneg;
ALTER TABLE services            ADD CONSTRAINT services_price_nonneg CHECK (price_cents >= 0);
ALTER TABLE appointments        DROP CONSTRAINT IF EXISTS appointments_price_nonneg;
ALTER TABLE appointments        ADD CONSTRAINT appointments_price_nonneg CHECK (price_cents >= 0);
ALTER TABLE sale_items          DROP CONSTRAINT IF EXISTS sale_items_amounts_nonneg;
ALTER TABLE sale_items          ADD CONSTRAINT sale_items_amounts_nonneg CHECK (unit_price_cents >= 0 AND total_cents >= 0 AND quantity > 0);
ALTER TABLE payments            DROP CONSTRAINT IF EXISTS payments_amount_pos;
ALTER TABLE payments            ADD CONSTRAINT payments_amount_pos CHECK (amount_cents > 0);
ALTER TABLE sales               DROP CONSTRAINT IF EXISTS sales_total_nonneg;
ALTER TABLE sales               ADD CONSTRAINT sales_total_nonneg CHECK (total_cents >= 0);

-- Observação: "serviços simultâneos" com MÚLTIPLOS barbeiros continua permitido
-- (o EXCLUDE só bloqueia sobreposição no MESMO barber_id). Se um dia for preciso
-- um barbeiro atender dois clientes ao mesmo tempo, relaxa-se esta constraint.

-- 4) No máximo UM caixa aberto por unidade (à prova de corrida).
DROP INDEX IF EXISTS one_open_cash_per_unit;
CREATE UNIQUE INDEX one_open_cash_per_unit
  ON cash_sessions (unit_id)
  WHERE status = 'OPEN';

-- 5) Estoque nunca negativo e valores não-negativos (garantido no banco).
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_stock_nonneg;
ALTER TABLE products ADD CONSTRAINT products_stock_nonneg CHECK (stock_current >= 0 AND stock_min >= 0);
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_money_nonneg;
ALTER TABLE products ADD CONSTRAINT products_money_nonneg CHECK (cost_cents >= 0 AND price_cents >= 0);
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_qty_pos;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_qty_pos CHECK (quantity > 0);
