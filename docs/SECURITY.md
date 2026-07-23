# Segurança

Modelo de segurança do SaaS e o que é testado. Complementa
[ARCHITECTURE.md](ARCHITECTURE.md).

## Princípio central: isolamento de tenant em duas camadas

1. **Aplicação** — todo acesso passa por `PrismaService.withTenant(tenantId)`,
   que abre uma transação e seta `app.current_tenant`.
2. **Banco (RLS)** — policies do Postgres barram vazamento mesmo com bug de
   query. Sem tenant setado → 0 linhas (*fail-closed*). O `app_role` é
   `NOSUPERUSER NOBYPASSRLS`.

Um ID forjado de outro tenant nunca vaza dados: a leitura filtra pela RLS e o
service devolve **404**.

## Mitigações implementadas

| Vetor (OWASP) | Mitigação | Onde |
|---|---|---|
| Broken Access Control | RLS + `withTenant` + checagem de tenant em todo service | `prisma/rls/`, todos os módulos |
| Broken Authentication | JWT + refresh rotativo/revogável; argon2; **2FA (TOTP)** opcional | `auth/` |
| Roubo de sessão (XSS) | **Refresh token em cookie `httpOnly`** (invisível a JS); logout revoga | `auth/refresh-cookie.ts` |
| Brute-force / abuso | **Rate limiting** (throttler): 300 req/min global, 10/min no login | `common/throttler.guard.ts` |
| Injection (SQL) | Prisma parametriza 100% das queries | ORM |
| XSS | React escapa por padrão; sem `dangerouslySetInnerHTML` | frontend |
| Security headers | `helmet` | `main.ts` |
| CSRF | `sameSite=lax` no cookie de refresh; escopo por `path=/api/auth` | `auth/refresh-cookie.ts` |
| CORS | origens restritas por `CORS_ORIGIN` (não libera `*`) | `main.ts` |
| Mass assignment | `ValidationPipe` com `whitelist` + `forbidNonWhitelisted` | `main.ts` |
| Vazamento em erro 500 | **filtro global** normaliza o erro; stack só no log do servidor | `common/all-exceptions.filter.ts` |
| Config insegura no boot | **validação de env** fail-fast (JWT/ENCRYPTION ausentes ou fracos → não sobe) | `common/env.validation.ts` |
| Vazamento de token em URL | mídia por **URL assinada** (HMAC + expiração 15 min), escopo de 1 arquivo | `storage/signed-url.ts` |
| Enumeração de contas | `forgot-password` responde **204 sempre**; login usa hash dummy | `auth/` |
| Sequestro de conta via reset | token **hasheado** no banco, uso único, expira, e o reset **revoga todas as sessões** | `auth/auth.service.ts` |
| Vazamento de PII em log | logs estruturados com **redação** de token/cookie/senha/CPF | `common/logger.config.ts` |
| Observabilidade de falhas | erros 5xx → **Sentry** (opt-in por DSN) com tenant/rota, sem PII | `common/sentry.ts` |
| Vazamento via WebSocket | socket autenticado por JWT entra só na sala `tenant:<id>`; emissão nunca é broadcast | `realtime/` |
| Abuso da área pública | rate limit dedicado (5/min p/ agendar), teto por telefone, janela de 90 dias | `public/` |
| Acesso indevido a agendamento | link do lembrete usa **token HMAC** por agendamento, com expiração | `common/appointment-token.ts` |
| Webhook de pagamento forjado | do corpo só se usa o id; a situação é **consultada no provedor** | `payments/` |
| Pagamento duplicado | `settle` idempotente (checa `externalId`) + `X-Idempotency-Key` no MP | `payments/payments.service.ts` |
| Sensitive Data (LGPD) | **CPF cifrado em repouso** (AES-256-GCM) | `common/crypto.util.ts` |
| Inadimplência | tenant SUSPENDED/CANCELED → 402 (exceto login/billing) | `auth/jwt-auth.guard.ts` |
| Integridade | constraints no banco (overbooking, caixa único, estoque ≥ 0) | `prisma/constraints/` |
| Accountability | **auditoria automática** de toda escrita autenticada (interceptor) | `audit/` |

## Credenciais de banco (privilégio mínimo)

- **Runtime** (`DATABASE_URL`): `app_role`, sofre RLS, sem privilégios de DDL.
- **Migrations/webhook** (`DIRECT_URL`): dono. O webhook de billing usa uma
  conexão de sistema (bypassa RLS) SÓ para resolver `externalId → tenantId`;
  todo o resto processa sob `withTenant`.

## Sessão no browser (tokens)

- **Access token** (curta duração, ~15 min): `localStorage` + header `Authorization`.
- **Refresh token**: **só** em cookie `httpOnly`/`secure`/`sameSite=lax`, escopo
  `path=/api/auth`. O JavaScript **não acessa** — um XSS não consegue exfiltrar a
  renovação da sessão. O frontend renova via cookie (`credentials: include`) e,
  em `401`, tenta renovar uma vez antes de deslogar (`web/lib/api.ts`).
- **Logout** (`POST /auth/logout`) revoga o refresh no banco e limpa o cookie.

> Fallback: `/auth/refresh` e `/auth/logout` também aceitam o refresh no body,
> para clientes de API/testes. Browsers usam o cookie.

## Segredos (env)

`JWT_SECRET`, `ENCRYPTION_KEY`, senhas de banco e credenciais de provider ficam
em variáveis de ambiente — nunca no repositório. Em produção, vêm de um cofre.
`.env` está no `.gitignore`. **No boot**, `common/env.validation.ts` recusa subir
se `JWT_SECRET`/`ENCRYPTION_KEY` faltarem, forem curtos (< 32) ou usarem valores
de exemplo — fail-fast em vez de rodar inseguro.

## O que é testado (test/security*.e2e-spec.ts)

- **Cross-tenant com ID forjado**: B não lê/altera/remove recursos de A
  (clients, services, barbers, products, finance) → 404; listas de B vazias.
- **Autenticação**: sem token / token lixo / token com assinatura adulterada → 401.
- **Mass-assignment**: campos não declarados (ex.: `tenantId`, `isAdmin`) → 400.
- **Injeção**: `search` com payload de SQL injection → 200 sem vazar nem quebrar.
- **LGPD**: CPF volta em claro pela API do próprio tenant, mas está cifrado no
  banco (`clients.e2e-spec.ts` inspeciona a coluna crua).
- **Rate limiting**: excedido o limite → 429.
- **Sessão**: refresh em cookie `httpOnly` (`register`/`login` setam; `refresh`
  só com cookie; `logout` revoga → refresh subsequente 401) — `auth-cookie.e2e-spec.ts`.
- **Reset de senha**: não enumera contas, token de uso único, senha curta → 400,
  senha antiga deixa de valer e **sessões ativas são revogadas** —
  `password-reset.e2e-spec.ts`.
- **URL assinada de mídia**: baixa sem token; assinatura/tenant/expiração
  adulterados → 401; `?token=` não autoriza mais — `storage.e2e-spec.ts`.

- **Área pública**: barbearia inexistente/suspensa → 404; não vaza `tenantId`
  nem dado interno; recusa horário no passado e fora do expediente; dois
  clientes no mesmo horário → 409 — `public-booking.e2e-spec.ts`.

- **Pagamento**: B não vê nem aprova cobrança de A (404); não cobra acima do
  saldo nem em comanda fechada; reprocessar não duplica pagamento —
  `payments.e2e-spec.ts`.
- **Link do agendamento**: token adulterado, de outro agendamento ou expirado →
  404; ação em horário passado → 400 — `public-appointment.e2e-spec.ts`.
- **Realtime**: socket sem token é derrubado; evento de A **não** chega no
  socket de B (WhatsApp e agenda) — `realtime.e2e-spec.ts`.
- **Plataforma**: token de barbearia não entra no painel e vice-versa —
  `platform.e2e-spec.ts`.

- **Novas features**: barbeiro com **CPF cifrado** no banco; desconto/acréscimo
  no PDV recalcula e não fica negativo — `new-features.e2e-spec.ts`.

Rode com: `npm run test:e2e` (30 suítes / 198 testes).

## Lacunas conhecidas / próximos passos

- **Throttler em memória**: para múltiplas instâncias, usar storage no Redis
  (`@nestjs/throttler` + `ThrottlerStorageRedisService`).
- **2FA (TOTP)**: ✅ implementado (`otplib`). Setup/enable/disable; login exige o
  código quando ativo; **segredo cifrado em repouso**. Evolução: códigos de
  recuperação (backup codes).
- **Blind index**: como o CPF é cifrado com IV aleatório, não há busca por CPF;
  adicionar coluna HMAC determinística se for necessário.
- **Auditoria**: ✅ implementada (interceptor global grava escritas em
  `audit_logs`). Evoluções: guardar diff `before/after` em updates; auditar
  login/logout.
- **CSRF**: as chamadas de negócio usam Bearer token (imunes a CSRF). O único
  cookie é o refresh (`sameSite=lax`, escopo `/api/auth`); ao evoluir para
  `sameSite=strict`/token anti-CSRF dedicado se abrir fluxos sensíveis por cookie.
- **Mídia**: ✅ resolvido — o `?token=` foi removido e substituído por **URL
  assinada** (HMAC-SHA256 sobre `tenant+arquivo+expiração`, 15 min). Adulterar a
  assinatura, o tenant ou a expiração → 401 (coberto por teste).
- **Migrations**: schema agora versionado (`prisma/migrations/`, baseline `0_init`);
  deploy via `npm run db:deploy`. RLS/constraints continuam em scripts pós-deploy.
- **CI**: `.github/workflows/ci.yml` roda build + 129 e2e (backend, com Postgres +
  RLS + constraints) e typecheck/build do frontend a cada push/PR.
