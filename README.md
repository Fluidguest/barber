# Barber SaaS — Gestão para Barbearias (multi-tenant)

ERP SaaS multi-tenant para barbearias. Cada barbearia é um *tenant* com dados
isolados por **Row-Level Security** do Postgres. Backend NestJS + Prisma.

> Status: **full-stack completo e testado** — 26 módulos backend, 21 telas,
> **198 testes e2e** em 30 suítes (incl. segurança). Faltam apenas as integrações
> reais que dependem de credenciais externas (WhatsApp/Meta e Mercado Pago), já
> prontas atrás de interface. Ver [Roadmap](#roadmap).

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | NestJS + TypeScript |
| Banco | PostgreSQL 16 (com RLS) |
| ORM | Prisma 6 |
| Auth | JWT (acesso curto) + refresh token rotativo; argon2 |
| Infra dev | Docker Compose (Postgres + Redis) |
| Testes | Jest + Supertest (e2e contra banco real) |

---

## Pré-requisitos

- Node.js 20+ e npm
- Docker Desktop

## Início rápido

```bash
# 1. Sobe Postgres (porta 15432) e Redis
docker compose up -d

# 2. Instala dependências
npm install

# 3. Provisiona o banco: schema + RLS + constraints + client (um comando)
npm run db:setup

# 4. (opcional) Popula dados de demonstração
npm run db:seed

# 5. Sobe a API em http://localhost:3333/api
npm run start:dev
```

**Login demo** (após `db:seed`): `slug=demo` · `email=admin@demo.com` · `senha=demo1234`

### Frontend (Next.js)

A interface administrativa fica em [`web/`](web/) (Next.js 16 + Tailwind).

```bash
cd web && npm install && npm run dev -- -p 3100   # http://localhost:3100
```

**21 telas:** Login, Dashboard, Relatórios, Agenda, Caixa/PDV, Financeiro,
Comissões, Estoque, Clientes, Serviços, Barbeiros, Usuários, Conversas
(WhatsApp), Configurações, Auditoria, Segurança/2FA, "esqueci a senha" e
redefinição, **agendamento online** (`/agendar/<slug>`), **auto-atendimento do
cliente** (`/agendamento/<token>`) e **painel do operador** (`/platform`).
Ver [web/README.md](web/README.md).

> A porta do Postgres é **15432** (a 5432/5433 estavam ocupadas por outro
> projeto no ambiente de desenvolvimento). Ajuste em `docker-compose.yml` e
> `.env` se quiser.

---

## Segurança / multi-tenancy

O isolamento entre barbearias tem **duas camadas** (defesa em profundidade):

1. **Aplicação** — todo acesso passa por `PrismaService.withTenant(tenantId, ...)`,
   que abre uma transação e seta `app.current_tenant`.
2. **Banco** — **RLS** do Postgres barra qualquer vazamento mesmo com bug de
   query. Sem tenant setado, nenhuma linha é retornada (*fail-closed*).

Duas credenciais de banco:
- **Runtime** (`DATABASE_URL`): role `app_role` (sofre RLS, `NOBYPASSRLS`).
- **Migrations** (`DIRECT_URL`): dono do banco (DDL).

Garantias críticas ficam no **banco**, à prova de corrida:
- Sem *overbooking* no mesmo barbeiro (constraint `EXCLUDE`).
- No máximo um caixa aberto por unidade (índice único parcial).
- Estoque nunca negativo; intervalos válidos e valores não-negativos (`CHECK`).

Outras defesas: **rate limiting** (throttler, 10/min no login), **CPF cifrado
em repouso** (AES-256-GCM, LGPD), `helmet`, validação estrita (anti
mass-assignment), e enforcement de inadimplência (tenant suspenso → 402).

Detalhes e vetores testados em **[docs/SECURITY.md](docs/SECURITY.md)**.
Arquitetura em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), referência de
endpoints em [docs/MODULES.md](docs/MODULES.md).

---

## Módulos e endpoints

26 módulos de domínio (auth, clients, services, barbers, appointments, cash,
sales, commissions, finance, stock, reports, dashboard, notifications, billing,
whatsapp, storage, settings, users, audit, mail, **payments** (PIX no PDV),
**public** (agendamento online), **realtime** (Socket.io), **scheduler** (jobs
automáticos), **platform** (painel do operador)). Referência completa de rotas em
**[docs/MODULES.md](docs/MODULES.md)**.

Toda rota (exceto `register`/`login`/`refresh`/`billing/webhook`/`health`) exige
`Authorization: Bearer <accessToken>`.

---

## Testes

```bash
npm run test:e2e
```

Suíte e2e roda contra o Postgres real, exercitando cada módulo ponta a ponta —
com **um teste de isolamento de tenant obrigatório por módulo** (DoD) e uma
**suíte dedicada de segurança** (cross-tenant, auth, mass-assignment, injeção,
rate limiting, cookie de sessão, reset de senha, URL assinada, área pública,
pagamento, realtime, plataforma). São **30 suítes / 198 testes**. Rodam também no
**CI** (`.github/workflows/ci.yml`) a cada push/PR.

---

## Banco: migrations

O schema é versionado com **Prisma Migrate** (`prisma/migrations/`, baseline
`0_init`). Ver [prisma/migrations/README.md](prisma/migrations/README.md).

| Script | Quando |
|---|---|
| `npm run db:migrate` | dev — alterou o schema, cria e aplica migration |
| `npm run db:deploy` | produção/CI — aplica migrations pendentes (não destrói dados) |
| `npm run db:migrate:status` | conferir estado |

> RLS e constraints **não** ficam nas migrations — são scripts idempotentes
> aplicados **depois** do deploy (`db:rls`, `db:constraints`). `db:setup` faz tudo
> na ordem certa.

---

## Scripts úteis

| Script | O que faz |
|---|---|
| `npm run db:setup` | migrate deploy + RLS + constraints + senha dev + client |
| `npm run db:migrate` / `db:deploy` | migrations (dev / produção) |
| `npm run db:seed` | popula dados de demonstração (limpa antes) |
| `npm run db:rls` | (re)aplica as policies de RLS |
| `npm run db:constraints` | (re)aplica constraints de negócio |
| `npm run build` / `start:dev` | compila / roda em watch |
| `npm run test:e2e` | testes e2e |

Reset total: `docker compose down -v && docker compose up -d && npm run db:setup && npm run db:seed`

---

## Roadmap

| Área | Status |
|---|---|
| Auth + multi-tenant + RLS | ✅ |
| Clientes (cadastro completo + CPF cifrado) | ✅ |
| Serviços, Barbeiros | ✅ |
| Agenda (overbooking + jornada + bloqueios) | ✅ |
| **Agendamento online pelo cliente** (link público `/agendar/<slug>`) | ✅ |
| **Confirmação/cancelamento pelo cliente** (link no lembrete) | ✅ |
| **Pagamento PIX no PDV** (Mercado Pago; `fake` por padrão) | ✅ |
| **Exportação de relatórios em CSV** | ✅ |
| Comanda + Caixa (PDV, com venda de produto) | ✅ |
| Comissão | ✅ |
| Financeiro (contas a pagar/receber + fluxo de caixa) | ✅ |
| Estoque (produtos, movimentações, alertas, integração PDV) | ✅ |
| Relatórios/BI (DRE, ranking, curva ABC) | ✅ |
| Dashboard | ✅ |
| Segurança (rate limit, LGPD, testes) | ✅ |
| Lembrete WhatsApp | ✅ envio via Meta (oficial) + WAHA; **disparo automático** (agendador) |
| Realtime (inbox + agenda ao vivo, Socket.io) | ✅ |
| Observabilidade (Sentry, opt-in) | ✅ |
| Painel do operador da plataforma | ✅ |
| Billing da plataforma | 🟡 ciclo pronto (provider *fake*); Mercado Pago a plugar |

**Credenciais (WhatsApp e Mercado Pago)** — passo a passo de onde obter e onde
colar, por barbearia, em **[docs/CREDENCIAIS.md](docs/CREDENCIAIS.md)**.

**Auditoria de infraestrutura e multi-tenancy** — cobertura de RLS, isolamento
entre barbearias e o que falta para escalar em
**[docs/AUDITORIA.md](docs/AUDITORIA.md)**.

**Deploy em produção** — checklist de env, topologia de cookie, provisionamento
do banco e ordem de subida em **[docs/DEPLOY.md](docs/DEPLOY.md)**. A API valida
o ambiente no boot e **recusa iniciar** com configuração insegura. Guia passo a
passo Vercel + Render + Neon em **[docs/DEPLOY-VERCEL.md](docs/DEPLOY-VERCEL.md)**.

**Integrações** (WhatsApp, Google Calendar, financeiras) — estado, arquitetura e
passos de ativação em **[docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)**.

**Pendências conhecidas** (ver [docs/SECURITY.md](docs/SECURITY.md) e
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)): throttler em Redis (multi-instância),
fiscal (NFC-e/NFS-e) e as integrações que dependem de credenciais reais.

✅ **Escala/operação/qualidade já resolvidos** (ver [docs/AUDITORIA.md](docs/AUDITORIA.md)):
agendador de lembretes + expiração de trial (com lock multi-instância), painel do
operador da plataforma, throttler em Redis e storage S3/R2 (opt-in por env),
**realtime (Socket.io)** no inbox e na agenda, **captura de erros (Sentry)** opt-in.

✅ **Já feitos**: migrations versionadas, validação de env, filtro global de erro,
CORS restrito, refresh em cookie httpOnly, CI, **logging estruturado (pino)**,
**e-mail + reset de senha**, **URLs de mídia assinadas**,
**agendamento online pelo cliente**, **confirmação/cancelamento pelo cliente**,
**pagamento PIX no PDV**, **exportação CSV**.

Roadmap original e priorização em [prompt-barbearia-saas.md](prompt-barbearia-saas.md).
