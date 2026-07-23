# Módulos e Endpoints

Referência para continuidade. 26 módulos de domínio, todos sob `/api` (exceto
`/health`), autenticados via `Authorization: Bearer <accessToken>` — salvo
`auth` (login/registro), webhooks públicos (`billing`, `payments`, `whatsapp`) e
a área pública (`public/*`, agendamento online + auto-atendimento do cliente).

Padrão de cada módulo: `Controller → Service → Prisma` + DTOs validados +
`withTenant` (RLS) + teste e2e com caso de isolamento.

| Módulo | Tela | Teste e2e |
|---|---|---|
| auth | Login | isolation, security |
| clients | Clientes | clients (LGPD) |
| services | Serviços | catalog |
| barbers | Barbeiros | catalog |
| appointments | Agenda | agenda |
| cash + sales | Caixa/PDV | pos, pos-stock |
| commissions | Comissões | commissions |
| finance | Financeiro | finance |
| stock | Estoque | stock |
| reports | Relatórios | reports |
| dashboard | Dashboard | dashboard |
| notifications | (automático) | notifications |
| billing | (—) | billing |

## Endpoints

### auth
- `POST /auth/register` — cria barbearia (tenant) + unidade + admin (seta cookie httpOnly do refresh)
- `POST /auth/login` — resolve tenant pelo slug (rate-limited 10/min; aceita `code` de 2FA; seta cookie httpOnly)
- `POST /auth/refresh` — rotaciona o refresh token (lê do **cookie httpOnly**; fallback no body p/ API)
- `POST /auth/logout` — revoga o refresh token e limpa o cookie
- `POST /auth/forgot-password` — envia link de redefinição (rate-limit 5/min; responde **204 sempre**, para não revelar contas)
- `POST /auth/reset-password` — troca a senha pelo token do e-mail (uso único, expira; **revoga todas as sessões**)
- `GET /auth/me` — usuário logado (inclui `totpEnabled`)
- `POST /auth/2fa/setup` · `POST /auth/2fa/enable` · `POST /auth/2fa/disable` — 2FA (TOTP; segredo cifrado)

### clients
- `POST /clients` · `GET /clients?search=` · `GET /clients/:id` · `PATCH /clients/:id` · `DELETE /clients/:id`
- Campos: nome, telefone, whatsapp, email, **CPF (cifrado)**, nascimento, instagram, origem, obs., endereço.

### services
- `POST/GET/GET:id/PATCH:id/DELETE:id /services` · `POST /services/categories/new` · `GET /services/categories/all`

### barbers
- `POST/GET/GET:id/PATCH:id/DELETE:id /barbers` · `PUT /barbers/:id/schedule` (jornada semanal)
- Cadastro completo: nome, telefone, whatsapp, e-mail, **CPF (cifrado)**,
  nascimento, endereço (JSON). Mesmo tratamento LGPD do cliente.

### appointments (agenda)
- `POST/GET/GET:id /appointments` (filtros `?from&to&barberId&clientId&serviceId&status`)
- `PATCH /appointments/:id/reschedule` · `PATCH /appointments/:id/status`
- `POST/GET /time-blocks` — bloqueios de horário
- Regras: sem overbooking (banco), dentro da jornada, fora de bloqueios; agenda lembrete de WhatsApp.

### cash-sessions (caixa)
- `POST /cash-sessions/open` · `GET /cash-sessions/current` · `GET /cash-sessions/:id` · `PATCH /cash-sessions/:id/close`
- Máx. 1 caixa aberto por unidade (índice único parcial).

### sales (comanda / PDV)
- `POST /sales` · `GET /sales/:id`
- `POST /sales/:id/items` (serviço OU produto — produto baixa estoque) · `DELETE /sales/:id/items/:itemId` (estorna estoque)
- `POST /sales/:id/adjustment` — **acréscimo/desconto** (`mode` PERCENT|FIXED|null; `value` assinado: − desconto, + acréscimo). PERCENT recalcula ao mudar itens; total nunca fica negativo.
- `POST /sales/:id/payments` (forma de pagamento) · `POST /sales/:id/close` (fecha pelo total ajustado; marca atendimento DONE + gera comissão)
- Comanda expõe `subtotalCents`, `adjustmentCents`, `totalCents`.

### commissions
- `POST/GET/PATCH:id/DELETE:id /commission-rules` (regra por barbeiro ou padrão; % ou fixo)
- `GET /commissions?barberId&periodRef&status` · `GET /commissions/summary?periodRef` · `POST /commissions/close`

### finance (contas a pagar/receber)
- `POST/GET /finance/categories`
- `POST /finance/entries` · `GET /finance/entries?type&status&dateField&from&to&page&pageSize` · `GET /finance/entries/:id` · `PATCH /finance/entries/:id` · `POST /finance/entries/:id/pay` · `POST /finance/entries/:id/cancel` · `DELETE /finance/entries/:id`
- `GET /finance/cashflow?from&to` — previsto vs. realizado (inclui PDV; período padrão = mês no fuso da unidade)
- Regras: categoria precisa combinar com o tipo (despesa↔a pagar, receita↔a receber); não edita/paga/cancela lançamento fora de PENDING; `dateField=dueDate|paidAt` no filtro.

### stock (estoque)
- `POST/GET/GET:id/PATCH:id/DELETE:id /products` (busca `?search`, filtro `?lowStock=true`)
- `GET /products/alerts` — baixo estoque + validade próxima
- `POST /products/:id/movements` (IN/OUT) · `GET /products/:id/movements` · `POST /products/:id/adjust` (inventário)

### reports (BI)
- `GET /reports/dre?from&to` — receitas/despesas por categoria + resultado
- `GET /reports/barbers?from&to` — ranking (atendimentos, faturamento, comissão)
- `GET /reports/products-abc?from&to` — curva ABC
- `GET /reports/inactive-clients?days=15|30|45|60|90` — clientes **sem serviço**
  (comanda paga OU atendimento concluído) no período. Ordena do mais inativo ao
  menos. Novos cadastros sem histórico não entram.
- **Exportação CSV**: `GET /reports/dre.csv` · `/reports/barbers.csv` ·
  `/reports/products-abc.csv` · `/reports/inactive-clients.csv` (exigem autenticação).
  Formato pt-BR para abrir direto no Excel: separador `;`, decimal com vírgula
  e **BOM** UTF-8 (sem ele o Excel corrompe os acentos) — `common/csv.ts`.
  No front, o botão "Exportar CSV" baixa a aba visível (`downloadFile` em
  `web/lib/api.ts`, que busca com o header de auth e gera um blob).

### dashboard
- `GET /dashboard/today?date=YYYY-MM-DD` — indicadores do dia (fuso da unidade)

### whatsapp (inbox + envio)
- `GET /whatsapp/conversations` · `GET /whatsapp/conversations/:id` (thread) · `POST /whatsapp/conversations/:id/read`
- `POST /whatsapp/messages` (envia texto; cria/reusa conversa) · `POST /whatsapp/numbers` (mapeia número→tenant) · `POST /whatsapp/simulate-inbound` (dev)
- `GET/POST /whatsapp/webhook` — **público** (verificação Meta + ingestão; resolve tenant pelo `phone_number_id` via conexão de sistema)
- Providers (fake/meta/waha) + `WhatsAppSenderService` (envio, reusado pelas notificações). Ver [INTEGRATIONS.md](INTEGRATIONS.md).

### notifications (lembretes)
- `GET /notifications?status&type` · `POST /notifications/dispatch` · `POST /notifications/:id/send`
- Agenda lembretes e delega o envio ao `WhatsAppSenderService` (módulo whatsapp).

### users (usuários e permissões) — **RBAC**
- `GET /users` (ADMIN/MANAGER) · `POST /users` (ADMIN) · `PATCH /users/:id` (ADMIN) · `DELETE /users/:id` (ADMIN)
- Perfis: ADMIN, MANAGER, RECEPTION, BARBER, FINANCE, MARKETING.
- Autorização via `@Roles` + `RolesGuard` (`common/`). Trava: não remove/rebaixa
  o último administrador; usuário não se desativa. Senha com argon2.

### storage (arquivos / mídia)
- `POST /storage/upload` (multipart, autenticado)
- `GET /storage/:id` — autoriza por header `Authorization` **ou** por
  **URL assinada** (`?t=&exp=&sig=`, HMAC-SHA256, validade 15 min) para
  `<img>`/`<audio>`. O antigo `?token=<accessToken>` foi **removido**.
- A thread do WhatsApp já devolve `mediaUrl` assinada — o frontend usa direto.
- Provider `local` (disco) atrás de interface; S3/R2 pluga por env. Metadados em
  `stored_files` (RLS).

### payments (cobrança do cliente no PDV) — PIX
Cobra o cliente final na comanda. (Não confundir com `billing/`, que cobra a
**assinatura da barbearia**.)

- `POST /sales/:saleId/charges` — gera cobrança PIX (sem `amountCents` = saldo restante)
- `GET /sales/:saleId/charges` · `GET /sales/:saleId/charges/:chargeId` (polling do PDV)
- `POST /sales/:saleId/charges/:chargeId/simulate-approval` — **só com provider `fake`**
- `POST /payments/webhook` — **público**; resolve o tenant pela cobrança (conexão de sistema)

**Como funciona**
- Providers: `fake` (padrão — QR fictício, confirmação manual) e `mercadopago`
  (PIX real via `POST /v1/payments`, com `X-Idempotency-Key`).
- Credenciais **por tenant** em Configurações (access token cifrado), com
  fallback no env. Igual ao WhatsApp.
- Ao **APROVAR**, a cobrança vira um `Payment` da comanda — o caixa, o fluxo de
  caixa e o fechamento não mudaram em nada.
- **Idempotente**: reprocessar webhook não duplica pagamento (checa `externalId`).
- O webhook nunca confia no corpo: extrai só o id e **consulta o provedor**.
- A consulta (`GET .../charges/:id`) também pergunta ao provedor se ainda está
  pendente — o PDV funciona mesmo se o webhook não chegar (firewall/rede).
- Valida saldo: não cobra acima do que falta, nem em comanda fechada.

### public (agendamento online) — **sem autenticação**
Página que a barbearia divulga (link/QR): o cliente marca sozinho e o
atendimento cai direto na agenda interna.

- `GET /public/:slug` — nome da barbearia + unidade/fuso
- `GET /public/:slug/services` — serviços ativos (nome, duração, preço)
- `GET /public/:slug/barbers?serviceId=` — profissionais (respeita `BarberService` se houver vínculo)
- `GET /public/:slug/availability?date=YYYY-MM-DD&serviceId=&barberId=` — horários livres
- `POST /public/:slug/appointments` — agenda (nome, telefone, serviço, profissional, horário)

**Regras e proteções** (são endpoints abertos):
- Barbearia resolvida pelo `slug`; suspensa/cancelada/inexistente → **404**
  (não expõe estado de cobrança).
- **Rate limit próprio**: 30–60/min nas leituras, **5/min** na criação.
- Só devolve dado público — nunca cliente, faturamento ou campo interno.
- Grade de 15 min a partir da **jornada** do barbeiro (hora local da unidade),
  descontando atendimentos e bloqueios. Sem jornada publicada → sem vaga online.
- Antecedência mínima 30 min · janela máxima 90 dias · máx. **3 agendamentos
  futuros em aberto por telefone** (anti-abuso).
- Overbooking barrado pela constraint do banco → **409** ("horário acabou de ser
  preenchido"), à prova de dois cliques simultâneos.
- Cliente identificado pelo telefone: reusa o cadastro ou cria com
  `origin = "Agendamento online"`. Lembrete de WhatsApp é agendado igual à
  agenda interna.

Tela: `web/app/agendar/[slug]` — link público **`/agendar/<slug>`**.

#### Auto-atendimento pelo link do lembrete
O lembrete de WhatsApp leva um link onde o cliente resolve sozinho, sem ligar
para a barbearia (e o horário desmarcado volta para a agenda na hora).

- `GET /public/appointments/:token` — dados do agendamento
- `POST /public/appointments/:token/confirm` — confirma presença (idempotente)
- `POST /public/appointments/:token/cancel` — desmarca

**Token assinado** (`common/appointment-token.ts`): HMAC sobre
`tenant + agendamento + expiração`, **sem tabela nova** e sem login. Vale até
24h depois do horário marcado. Adulterar qualquer parte → **404**. Não serve
para outro agendamento nem para outra barbearia. Ação com horário já passado,
ou em atendimento concluído/cancelado → **400**.

Tela: `web/app/agendamento/[token]`.

### mail (e-mail transacional)
- Sem endpoints: serviço interno (`MailService`, módulo global).
- Providers: `fake` (padrão — só loga, e guarda em memória para os testes) e
  `smtp` (nodemailer; serve SES/Resend/Postmark/SendGrid). Env `MAIL_PROVIDER`.
- Falha de envio **não derruba** a operação de negócio (é logada).
- Hoje usado pelo fluxo de redefinição de senha.

### settings (configurações por tenant) — **admin (RBAC)**
- `GET /settings` · `PUT /settings` (ADMIN)
- Config de integrações por barbearia (provedor de WhatsApp, token Meta/WAHA,
  verify token, horas de lembrete). **Secrets cifrados** (AES-256-GCM) e
  **mascarados** na API (write-only). O `WhatsAppSenderService` resolve o provider
  e as credenciais **por tenant** (fallback no env).

### audit (auditoria)
- `GET /audit?entity&limit` — trilha de ações
- Um **interceptor global** grava toda ação autenticada de escrita
  (POST/PATCH/PUT/DELETE) em `audit_logs`: quem, quando, entidade, id, IP.
  Não loga o corpo (evita senha/CPF). Leituras (GET) não são auditadas.

### realtime (Socket.io) — atualização ao vivo
Telas que se atualizam sozinhas, sem F5. Namespace `/realtime`.
- **Autenticação:** o socket manda o mesmo access token em `auth.token`; o
  gateway valida o JWT e coloca o socket na sala `tenant:<id>`. Token inválido/
  sem `tenantId` → desconectado. Token de plataforma não entra (não tem sala).
- **Isolamento:** só emitimos para a **sala do tenant** — nunca broadcast global.
  Um socket jamais recebe evento de outra barbearia (coberto por teste).
- **Eventos:**
  - `whatsapp:message` — nova mensagem (recebida ou enviada) → o inbox atualiza
    na hora, como o WhatsApp Web. Mídia já vai com URL assinada.
  - `appointment:changed` — novo agendamento (interno ou **online**), confirmação
    ou cancelamento pelo cliente → a agenda da recepção reflete sozinha.
- Front: hook `useRealtime(event, handler)` em `web/lib/socket.ts`; usado no
  inbox (`/conversas`) e na agenda. `RealtimeService.emitToTenant` é injetável
  em qualquer serviço.

### scheduler (jobs automáticos da plataforma)
- Sem endpoints: `@Cron` do NestJS. Roda para **todas** as barbearias.
- **Lembretes** (a cada 5 min): despacha as mensagens vencidas de cada barbearia
  ativa — antes disso, nada era enviado sozinho.
- **Expiração de trial** (a cada 1h): suspende quem venceu o teste (assinou e
  passou de `trialEndsAt`, ou nunca assinou e passou de `TRIAL_DAYS` da criação).
- **Advisory lock** do Postgres garante que só uma instância execute. Ligar/
  desligar por `SCHEDULER_ENABLED`.

### platform (painel do operador do SaaS) — **identidade separada**
Quem **vende** o sistema, não uma barbearia. Tabela global `platform_admins`.
- `POST /platform/auth/login` — login do operador (token `scope=platform`)
- `GET /platform/stats` — total/ativas/teste/suspensas/canceladas
- `GET /platform/tenants?search=` · `GET /platform/tenants/:id` (volumes agregados)
- `POST /platform/tenants/:id/suspend` · `.../reactivate`
- Guard próprio (`PlatformAuthGuard`): token de barbearia não entra; token de
  plataforma não acessa dados de barbearia; operador reconferido no banco a cada
  request. Expõe só métricas de plataforma. Primeiro operador via
  `npm run platform:admin`. Tela: `web/app/platform`.

### billing (assinatura da plataforma)
- `GET /billing/plans` · `GET /billing/subscription` · `POST /billing/subscribe` · `POST /billing/cancel`
- `POST /billing/webhook` — **público**; resolve tenant por `externalId` (conexão de sistema)
- Provider `PlatformPaymentProvider` — hoje `fake`; Mercado Pago pluga depois.
- Planos por intervalo: **mensal, trimestral, semestral, anual** (`PlanInterval`).
  O período da assinatura avança em meses de calendário (`addInterval`).

## Como estender (novo módulo)
1. Tabela(s) no `schema.prisma` com `tenant_id` + soft delete.
2. `npm run db:setup` — a RLS cobre **automaticamente** toda tabela com `tenant_id`.
3. Controller + Service com `withTenant`, DTOs validados.
4. Teste e2e com **caso de isolamento** (use `test/helpers.ts`).
5. (Sensível) `@Roles(...)` + `RolesGuard` para restringir por perfil.
