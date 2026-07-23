# Integrações

Estado, arquitetura e passos de ativação de cada integração externa. Todas
seguem o mesmo princípio: **atrás de uma interface**, com um provider `fake`
default (para dev/teste) e o provider real ativado por variável de ambiente —
sem tocar no domínio.

| Integração | Estado | Ativa por |
|---|---|---|
| WhatsApp (envio + inbox) | ✅ módulo `whatsapp`; conversas/thread; Meta+WAHA | `WHATSAPP_PROVIDER` |
| WhatsApp (recebimento/webhook) | ✅ estrutura pronta (número→tenant); real precisa de credencial+URL pública | `WHATSAPP_VERIFY_TOKEN` |
| WhatsApp (mídia: áudio/imagem) | ✅ enviar/exibir via Storage local; envio real p/ Meta = próximo | `STORAGE_PROVIDER` |
| Storage de arquivos | ✅ local (disco) **ou S3/R2/MinIO** (SigV4 nativo) | `STORAGE_PROVIDER` |
| Billing da plataforma (assinatura do SaaS) | 🟡 interface pronta; Mercado Pago a plugar | `PLATFORM_PAYMENT_PROVIDER` |
| Pagamento do cliente no PDV (PIX) | ✅ módulo `payments`; fake + **Mercado Pago** (por tenant) | Configurações (por barbearia) |
| E-mail transacional (reset de senha) | ✅ módulo `mail`; fake + SMTP | `MAIL_PROVIDER` |
| Rate limit distribuído (multi-instância) | ✅ memória ou Redis | `THROTTLE_REDIS_URL` |
| Observabilidade (erros) | ✅ Sentry opt-in | `SENTRY_DSN` |
| Google Calendar (agenda) | ⬜ a implementar (design abaixo) | — |
| Fiscal (NFC-e/NFS-e) | ⬜ a implementar (provedor terceiro) | — |

---

## 1. WhatsApp

### Estado: envio pronto (3 providers)
Interface `WhatsAppProvider` (`src/notifications/whatsapp-provider.ts`) com:
- `FakeWhatsAppProvider` — default; loga e devolve id fake (dev/teste).
- `MetaWhatsAppProvider` — **API oficial da Meta (Cloud API)**; recomendado (ADR-003).
- `WahaWhatsAppProvider` — WAHA self-hosted (não-oficial; risco de ban do número).

Seleção por `WHATSAPP_PROVIDER = fake | meta | waha` (factory no
`notifications.module.ts`). O envio já está integrado ao lembrete de agendamento.

### Ativar a Meta (oficial) — pela interface (recomendado)
As credenciais são **por barbearia (tenant)**, editáveis na aba **Configurações**
(perfil admin): provedor = Meta, Token, Phone Number ID, verify token. Ficam
**cifradas** no banco. O envio resolve provider+credenciais por tenant.
Passos: criar app no [Meta for Developers](https://developers.facebook.com/) →
produto "WhatsApp" → Token permanente + Phone Number ID → colar em Configurações.
Alternativa global (dev): `WHATSAPP_PROVIDER`/`META_*` no `.env` (fallback).
4. Mensagens iniciadas pela empresa fora da janela de 24h exigem **templates**
   aprovados — evoluir `sendText` para `sendTemplate` quando necessário.

### Ativar o WAHA
Suba o container WAHA, então `.env`: `WHATSAPP_PROVIDER=waha`, `WAHA_URL=http://...`,
`WAHA_SESSION=default`, `WAHA_API_KEY=...` (se configurado).

### Pendente: recebimento (webhook)
Para chat bidirecional (o prompt pede): endpoint público `POST /notifications/whatsapp/webhook`
que (a) responde ao *challenge* de verificação da Meta (GET), (b) recebe mensagens/
status e grava como `WhatsAppMessage` INBOUND. Como é não-autenticado, o tenant
precisa ser resolvido pelo `phone_number_id` recebido → **exige uma tabela de
mapeamento `phone_number_id → tenant`** e uma conexão de sistema (mesmo padrão do
webhook de billing). Design pronto; implementação sob demanda.

---

## 2. Financeiras

Há **dois** contextos de pagamento (ADR-006), que não se misturam:

### 2a. Billing da plataforma (a barbearia paga o SaaS) — 🟡 quase pronto
Interface `PlatformPaymentProvider` (`src/billing/`) com `FakePaymentProvider`.
Ciclo completo já construído: `subscribe` (trial) → `webhook` → `cancel` +
suspensão por inadimplência.

**Plugar o Mercado Pago:**
1. Obter `MP_ACCESS_TOKEN` (produção) no painel do Mercado Pago.
2. Implementar `MercadoPagoPlatformProvider` (`createSubscription` via
   [preapproval](https://www.mercadopago.com.br/developers) → devolve `init_point`
   + `id`; `cancelSubscription` via `PUT /preapproval/{id}` status=cancelled).
   Requer também o **e-mail do pagador** e um **fluxo de redirect** (o tenant
   autoriza no MP) — ajustar `subscribe` para devolver a URL de autorização.
3. Configurar o **webhook do MP** apontando para `POST /billing/webhook` (já existe;
   mapear os eventos do MP para approved/failed).
4. `.env`: `PLATFORM_PAYMENT_PROVIDER=mercadopago`, `MP_ACCESS_TOKEN=...`.

### 2b. Gateway do cliente (a barbearia cobra os clientes dela) — ⬜ a construir
Hoje o PDV registra a forma de pagamento manualmente (dinheiro/PIX/cartão). Para
**cobrar de verdade** (gerar PIX/link, conciliar):
- Novo módulo `payments-gateway` com interface `PaymentGateway`:
  `createPixCharge(amount, description) -> { qrCode, copyPaste, externalId }`,
  `createPaymentLink(...)`, `getStatus(externalId)`.
- Providers: `fake` (dev) e `mercadopago`/`asaas`/`stripe` (ADR-004 sugere começar
  por **um**: Mercado Pago ou Asaas).
- Webhook `POST /payments-gateway/webhook` confirma o pagamento → dá baixa na
  comanda (Sale) e lança a receita no financeiro. Mesmo padrão RLS×webhook do billing.
- Env: reaproveita `MP_ACCESS_TOKEN` (ou credenciais do provider escolhido).

---

## 3. Google Calendar (agenda) — ⬜ a construir (design)

Objetivo: espelhar os atendimentos da agenda no Google Calendar do barbeiro/unidade
(criar/atualizar/cancelar evento quando o `Appointment` muda), e opcionalmente
Google Meet para atendimentos online.

### Desafio principal: OAuth por tenant
Cada barbearia autoriza o acesso ao seu Google Calendar. É preciso:
1. App no Google Cloud Console → OAuth 2.0 (`GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`).
2. Fluxo de consentimento: `GET /integrations/google/connect` → redireciona ao Google;
   `GET /integrations/google/callback` → troca o code por **refresh_token**, guardado
   **cifrado** (reuso do `crypto.util.ts`) numa tabela `google_credentials` por
   tenant/unidade (com `tenant_id` → RLS automática).

### Arquitetura (mesma dos demais)
- Interface `CalendarProvider`: `upsertEvent(appt) -> externalEventId`,
  `deleteEvent(externalEventId)`.
- `NoopCalendarProvider` (default) e `GoogleCalendarProvider` (usa o refresh_token
  do tenant para obter access_token e chamar a Calendar API v3 via fetch).
- **Disparo via eventos de domínio** (recomendação do ARCHITECTURE.md): ao criar/
  reagendar/cancelar um `Appointment`, emitir um evento; um listener chama o
  `CalendarProvider`. Isso evita acoplar `AppointmentsService` ao Google e é
  fire-and-forget (não-atômico com a transação da agenda).
- Guardar o `externalEventId` no `Appointment` (nova coluna) para update/delete.

### Passos para implementar
1. Tabela `google_credentials` (tenant_id, refresh_token cifrado, calendar_id).
2. Rotas de connect/callback (OAuth).
3. `@nestjs/event-emitter` + listener `appointment.*` → `CalendarProvider`.
4. `GoogleCalendarProvider` via Calendar API v3.

---

## Princípio comum
Toda integração externa entra **atrás de interface + provider fake default +
seleção por env**, e todo webhook resolve o tenant por um identificador externo
usando conexão de sistema (bypassa RLS só no lookup) — como já faz o billing.
Assim o núcleo permanece testável offline e a ativação é só configuração.
