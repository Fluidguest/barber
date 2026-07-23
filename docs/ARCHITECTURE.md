# Arquitetura e Decisões (ADRs implementadas)

Registro do que foi **efetivamente construído** e por quê. Complementa o
roadmap em [../prompt-barbearia-saas.md](../prompt-barbearia-saas.md).

## Visão geral

Monolito modular NestJS. Cada módulo segue o mesmo padrão:

```
Controller (rotas, guard JWT)
   -> Service (regra de negócio, sempre via withTenant)
      -> Prisma (RLS ativa no Postgres)
```

Um request autenticado carrega `tenantId` no JWT; o `JwtAuthGuard` o coloca em
`req.user`; o Service passa para `withTenant`, que seta `app.current_tenant` na
transação. A RLS do Postgres faz o resto.

## ADRs

### ADR-001 — Multi-tenancy: row-level + RLS do Postgres
Uma base, uma schema, `tenant_id` em toda tabela de negócio. Isolamento
garantido por **RLS** (policy `tenant_isolation`, `FORCE ROW LEVEL SECURITY`),
não só pelo filtro da aplicação. *Fail-closed*: sem `app.current_tenant`,
zero linhas. Ver [../prisma/rls/](../prisma/rls/).

### ADR-002 — Infra: Docker Compose (K8s só quando precisar)
Postgres + Redis via Compose. Containers stateless, config por env
("Kubernetes-ready" sem provisionar K8s agora).

### ADR-003 — WhatsApp atrás de interface (fluxo pronto; provider real pendente)
`WhatsAppProvider` (`src/notifications/`) já implementado com `FakeWhatsAppProvider`.
Criar um atendimento agenda um lembrete (`WhatsAppMessage` QUEUED com `scheduledFor`);
`sendOne`/`dispatchDue` chamam o provider FORA da transação. Falta plugar a
implementação real (Meta Cloud API / WAHA) trocando o provider no módulo, e um
disparador automático das mensagens vencidas — hoje o `dispatch` é por endpoint
(RLS-safe, por tenant). Um worker cross-tenant exigirá conexão de service-role
ou iteração por tenant (tensão RLS × job de fundo).

### ADR-004 / ADR-006 — Billing da plataforma (fluxo pronto; provider real pendente)
`PlatformPaymentProvider` (`src/billing/`) implementado com `FakePaymentProvider`.
Ciclo: `subscribe` (trial + fatura pendente) → `webhook` (approved/failed/suspend)
→ `cancel`. A **suspensão por inadimplência** é aplicada no `JwtAuthGuard`
(tenant SUSPENDED/CANCELED → 402), exceto rotas `@AllowSuspended` (login/billing).
O webhook é **público** e resolve `externalId → tenantId` via `SystemPrismaService`
(conexão de dono que bypassa RLS, uso restrito a ingressos de sistema); o resto
processa sob `withTenant`. Falta plugar o Mercado Pago real (preapproval).

### ADR-005 — Agenda timezone-aware por unidade
Instantes gravados em **UTC**; cada `Unit` tem `timezone`. A validação de
jornada de trabalho converte UTC → hora local via `Intl` (sem dependência). O
Postgres do container roda em UTC (`TZ=UTC`).

### ADR-006 — Billing da plataforma ≠ gateway do cliente (pendente)
Modelos `Plan`/`Subscription`/`PlatformInvoice` já existem no schema; o fluxo
de cobrança da assinatura ainda não foi construído.

### ADR-007 — REST em camadas; filas só onde pagam
Sem CQRS. Redis/BullMQ reservado para trabalho assíncrono (notificações etc.)
quando entrarem.

### ADR-008 — Jobs da plataforma com advisory lock (não fila)
Lembretes automáticos e expiração de trial rodam via `@nestjs/schedule`
(`src/scheduler/`). Como varrem todos os tenants, usam a conexão de sistema.
Para multi-instância, `pg_try_advisory_lock` garante que só uma execute — evita
lembrete duplicado sem precisar de um broker. Migrar para fila só se o volume
exigir paralelismo real.

### ADR-009 — Realtime por salas de tenant (Socket.io)
Gateway em `/realtime` autentica o socket com o mesmo JWT e o coloca **só** na
sala `tenant:<id>`. Emissão é sempre para a sala — nunca broadcast. Assim o
isolamento do REST vale também no WebSocket, sem uma segunda camada de
autorização. Ver ADR-001.

### ADR-010 — Operador da plataforma com identidade separada
Quem vende o SaaS não é usuário de barbearia: tabela GLOBAL `platform_admins`,
token com `scope=platform` (sem `tenantId`). Efeito cruzado: token de barbearia
não entra no painel (sem scope) e token de plataforma não acessa dados de
barbearia (sem tenant, barrado pelo `JwtAuthGuard`). O `app_role` de runtime não
tem privilégio sobre `platform_admins`.

### ADR-011 — Pagamento do cliente ≠ billing da plataforma
`payments/` cobra o cliente final no PDV (PIX); `billing/` cobra a assinatura da
barbearia. Provedores e credenciais são independentes — cada barbearia usa a
própria conta do Mercado Pago (dinheiro cai direto nela).

## Garantias no banco (não só na aplicação)

Regras críticas ficam no Postgres para serem à prova de corrida:

| Garantia | Mecanismo | Arquivo |
|---|---|---|
| Isolamento de tenant | RLS policy `tenant_isolation` | `prisma/rls/enable-rls.sql` |
| Sem overbooking no mesmo barbeiro | `EXCLUDE USING gist` | `prisma/constraints/business-rules.sql` |
| 1 caixa aberto por unidade | índice único parcial (`WHERE status='OPEN'`) | idem |
| Intervalos válidos / valores ≥ 0 | `CHECK` | idem |
| 1 comissão por item de comanda | `saleItemId @unique` | `prisma/schema.prisma` |

Essas travas o Prisma **não** gera sozinho — são aplicadas como SQL após o
`prisma db push` (embutidas no `npm run db:setup`).

## Convenções de dados

- Dinheiro sempre em **centavos** (`Int`), nunca `Float`.
- Comissão `PERCENT` em **base 10000** (40% = 4000) — sem perda de casas.
- **Soft delete** (`deleted_at`) nas entidades de negócio.
- Timestamps UTC; timezone só na `Unit`.
- IDs `cuid` (gerados pela aplicação — sem sequences a proteger na RLS).

## Fluxo de negócio (o que está pronto)

```
Cliente + Serviço + Barbeiro (+ jornada)
        └── Agenda: agendar / reagendar / cancelar (trava overbooking + jornada + bloqueios)
                 └── Comanda: itens + pagamentos  (exige caixa aberto)
                          └── Fechar comanda -> marca atendimento DONE
                                             -> gera Comissão (regra específica > padrão)
                                             -> entra no Dashboard do dia
        └── Caixa: abrir -> (comandas) -> fechar com resumo por forma de pagamento
```

## Segurança operacional

Detalhes e vetores testados em [SECURITY.md](SECURITY.md). Resumo:

- **Rate limiting** (`@nestjs/throttler`, `common/throttler.guard.ts`): 300 req/min
  global + 10/min no login (anti brute-force). `forRootAsync` lê o limite do env
  na inicialização. Storage em memória — para múltiplas instâncias, usar Redis.
- `app_role` (runtime) é `NOSUPERUSER NOBYPASSRLS`. Nunca sirva request como dono.
- Senhas com argon2; refresh token guardado só como hash (sha256), com rotação.
- Login resolve o tenant pelo `slug` antes do email (email é único por tenant).
- Dados sensíveis são cifrados na aplicação em repouso (a RLS não cifra). O **CPF**
  do cliente usa AES-256-GCM (`common/crypto.util.ts`): cifrado ao gravar, decifrado
  ao ler; formato `enc:v1:...`; chave via `ENCRYPTION_KEY`. Criptografia aleatória
  (IV único) não permite busca por igualdade — para buscar por CPF, adicionar um
  blind index (HMAC). *TOTP do 2FA ainda a cifrar quando o 2FA for ativado.*

## Como estender (novo módulo)

1. Adicione a(s) tabela(s) ao `schema.prisma` com `tenant_id` + soft delete.
2. `npm run db:setup` — a **RLS é aplicada automaticamente** a qualquer tabela
   com `tenant_id` (auto-descoberta via `information_schema`; não há mais lista
   manual). Constraints específicas vão em `prisma/constraints/`.
3. Controller + Service usando `withTenant`, DTOs validados.
4. Teste e2e com **caso de isolamento de tenant** (obrigatório — DoD). Use
   `test/helpers.ts` (`bootstrap`/`registerTenant`) para evitar boilerplate.
5. (Sensível) Aplique `@Roles(...)` + `RolesGuard` para restringir por perfil.

## Avaliação de arquitetura (modularidade & expansão)

Revisão do estado atual (17 módulos) e diretrizes para crescer sem entropia.

### Pontos fortes
- **Módulos de domínio isolados**: cada um é `Controller → Service → Prisma +
  DTOs + Module`, com teste próprio. Adicionar/remover um módulo não afeta os outros.
- **Baixo acoplamento**: só 3 dependências diretas entre módulos —
  `sales → commissions`, `sales → stock` (ambas **atômicas**, na mesma transação
  do fechamento da comanda) e `appointments → notifications`. Justificadas.
- **Integrações atrás de interface** (`WhatsAppProvider`, `PlatformPaymentProvider`):
  trocar de provider não toca no domínio.
- **Segurança transversal** via infraestrutura reutilizável (RLS auto, `withTenant`,
  `@Roles`, `AuditInterceptor`, throttler) — novos módulos herdam sem esforço.

### Diretrizes para novos acoplamentos
- **Efeito colateral que precisa ser atômico** (ex.: baixar estoque ao vender):
  chamada direta ao service do outro módulo, DENTRO da transação (`tx`). É o
  padrão atual de `sales`.
- **Efeito colateral "fire-and-forget"** (ex.: enviar e-mail/WhatsApp, indexar,
  pontos de fidelidade): preferir **eventos de domínio** (`@nestjs/event-emitter`)
  para não transformar um service em "deus". Ainda não introduzido — recomendado
  quando surgir o 2º/3º listener sobre o mesmo fato.

### Dívidas/limites de escala mapeados
- **Paginação**: as listagens retornam tudo. Antes de volumes grandes (clientes,
  agenda, auditoria), migrar para paginação por cursor. `audit` e `finance` são
  os que mais crescem.
- **Config**: alguns services leem `process.env` direto (auth, notifications).
  Centralizar num `ConfigService` tipado quando a config crescer.
- **Throttler/eventos** em memória: para escalar horizontalmente (múltiplas
  instâncias), mover throttler e futura fila de eventos para o Redis (já provisionado).
- **Migrations versionadas**: hoje usamos `db push` (dev). Para produção, migrar
  para `prisma migrate` com histórico versionado.
