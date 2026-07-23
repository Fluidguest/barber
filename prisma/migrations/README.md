# Migrations

Histórico versionado do schema (Prisma Migrate). **Substitui o antigo
`prisma db push`** — agora a evolução do banco é controlada e auditável.

## Fluxo

| Situação | Comando |
|---|---|
| Alterou o `schema.prisma` (dev) | `npm run db:migrate` — cria uma migration nova e aplica |
| Deploy (produção/CI) | `npm run db:deploy` — aplica migrations pendentes (não destrói dados) |
| Conferir estado | `npm run db:migrate:status` |
| Setup completo do zero | `npm run db:setup` — deploy + RLS + constraints + generate |

## Baseline (`0_init`)

`0_init` foi gerado a partir do schema já existente (`migrate diff --from-empty`)
e marcado como **aplicado** (`migrate resolve --applied`), pois o banco já havia
sido criado via `db push`. Bancos novos recebem todo o schema por ele.

## Ordem no deploy (importante)

As migrations criam **apenas a estrutura de tabelas**. A segurança multi-tenant
não está nas migrations — fica em scripts idempotentes aplicados **depois**:

1. `db:deploy` — tabelas (migrations)
2. `db:rls` — Row-Level Security (auto-descobre toda tabela com `tenant_id`)
3. `db:constraints` — regras de negócio (índices únicos parciais, checks)

`npm run db:setup` executa os três na ordem certa. **Nunca** rode só o deploy em
produção sem reaplicar RLS/constraints se houver tabela nova.
