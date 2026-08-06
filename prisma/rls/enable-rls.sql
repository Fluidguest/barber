-- ============================================================================
--  Row-Level Security (RLS) — ADR-001
--  Rodar como DONO/ADMIN do banco (DIRECT_URL), DEPOIS de `prisma db push`.
--
--  Modelo de conexões (ver rls/README.md):
--   - App em runtime conecta como app_role (NOSUPERUSER, NOBYPASSRLS) -> sofre RLS.
--   - Migrations/este script rodam como dono/admin.
--   - A cada request a app roda, na MESMA transação:
--       SELECT set_config('app.current_tenant', '<tenant_id>', true);
--   - Sem tenant setado, nenhuma linha casa -> fail-closed (isolamento por padrão).
--
--  🔑 AUTO-DESCOBERTA: a RLS é aplicada a TODA tabela que tem uma coluna
--  `tenant_id` (via information_schema). Ou seja, ao adicionar um módulo novo,
--  basta a tabela ter `tenant_id` — ela é protegida automaticamente ao rodar
--  `npm run db:setup`. Não há lista manual para manter (elimina o risco de
--  esquecer uma tabela = vazamento).
-- ============================================================================

-- 0) Role da aplicação — idempotente e sem privilégios perigosos.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_role') THEN
    CREATE ROLE app_role LOGIN PASSWORD 'CHANGE_ME';
  END IF;
END $$;

-- Atributos seguros. Já são o PADRÃO de um role recém-criado, então este ALTER
-- é só uma reafirmação defensiva. Em Postgres gerenciado (ex.: Supabase) o
-- superusuário não é exposto e este ALTER falha com "permission denied to alter
-- role" — como os atributos já estão corretos por padrão, engolimos o erro em
-- vez de abortar o script inteiro (que deixaria a RLS sem aplicar).
DO $$
BEGIN
  ALTER ROLE app_role NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Sem permissão para ALTER ROLE (Postgres gerenciado); atributos já são o padrão seguro.';
END $$;
GRANT USAGE ON SCHEMA public TO app_role;

-- 1) Função helper: tenant corrente da sessão (vazio/ausente -> NULL).
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_tenant', true), '')
$$;

-- 2) RLS em TODA tabela com coluna tenant_id (auto-descoberta).
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'tenant_id'
    GROUP BY table_name
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
    $f$, t);

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_role;', t);

    RAISE NOTICE 'RLS aplicada em %', t;
  END LOOP;
END $$;

-- 3) Tabelas GLOBAIS (sem tenant_id): NÃO devem ter RLS. Em Postgres gerenciado
--    (ex.: Supabase) a RLS vem LIGADA por padrão em todo o schema `public`, o que
--    com FORCE deixaria o app enxergar 0 linhas (login não acha o tenant, planos
--    somem). Desligamos explicitamente — idempotente e inofensivo onde já está off.
DO $$
DECLARE
  g text;
BEGIN
  FOREACH g IN ARRAY ARRAY['plans','tenants','platform_admins','_prisma_migrations']
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=g) THEN
      EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY;', g);
    END IF;
  END LOOP;
END $$;

-- 3a) Catálogo GLOBAL (plans): somente leitura para o app.
GRANT SELECT ON plans TO app_role;

-- 3b) Tabela raiz `tenants` (não tem tenant_id, pois É o tenant): o app precisa
--     criar no cadastro e ler no login. Sem DELETE (soft delete via deleted_at).
GRANT SELECT, INSERT, UPDATE ON tenants TO app_role;

-- Nota: audit_logs aceita tenant_id NULL (ações de plataforma). Essas linhas
-- ficam invisíveis ao app_role (NULL = x -> NULL), o que é o desejado.

-- ============================================================================
--  Verificação (rodar CONECTADO COMO app_role):
--    SELECT set_config('app.current_tenant', 'tenant_A', false);
--    SELECT count(*) FROM clients;  -- só do tenant_A
--    RESET app.current_tenant;      -- sem tenant -> 0 linhas (fail-closed)
-- ============================================================================
