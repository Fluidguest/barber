# Deploy em produção

Checklist para subir sem surpresa. A aplicação **valida o ambiente no boot** e
**recusa iniciar** se algo essencial estiver errado (`src/common/env.validation.ts`)
— melhor falhar no deploy do que rodar inseguro.

---

## 1. Variáveis obrigatórias

| Variável | Regra em produção |
|---|---|
| `NODE_ENV` | **`production`** (liga `Secure` no cookie e o modo estrito de validação) |
| `DATABASE_URL` | `app_role` com **senha forte** (não pode conter `app_dev_pw`/`CHANGE_ME`) |
| `DIRECT_URL` | dono do banco (migrations, RLS, constraints) |
| `JWT_SECRET` | **≥ 32 chars** aleatórios — `openssl rand -base64 48` |
| `ENCRYPTION_KEY` | **≥ 32 chars**. ⚠️ **Nunca troque depois de gravar dados** — ela decifra CPF/segredos já salvos; trocar torna os dados ilegíveis |
| `CORS_ORIGIN` | URL pública do frontend. **Não pode ser localhost** |
| `COOKIE_SAMESITE` | ver tabela abaixo |
| `APP_URL` | URL pública do frontend — entra nos links de e-mail (reset de senha) |
| `MAIL_PROVIDER` | **`smtp`** em produção (o padrão `fake` só loga, não envia) |
| `MAIL_HOST` / `MAIL_PORT` / `MAIL_USER` / `MAIL_PASS` / `MAIL_FROM` | credenciais SMTP (SES, Resend, Postmark…) |

Gere os segredos assim:

```bash
openssl rand -base64 48   # JWT_SECRET
openssl rand -base64 48   # ENCRYPTION_KEY (só na primeira vez!)
```

## 2. Cookie de sessão x topologia (o erro mais comum)

O refresh token vai num cookie `httpOnly`. Se o cookie não viajar, o usuário é
deslogado ao renovar. Escolha conforme **onde o frontend roda**:

| Topologia | `COOKIE_SAMESITE` | Extra |
|---|---|---|
| Mesmo domínio / mesmo proxy (`barber.com` serve app e `/api`) | `lax` | — |
| Subdomínios (`app.barber.com` + `api.barber.com`) | `lax` | `COOKIE_DOMAIN=".barber.com"` |
| Domínios **diferentes** (ex.: Vercel + Render) | `none` | **exige HTTPS** nas duas pontas |

> `SameSite=none` sem HTTPS é rejeitado pelo navegador — por isso o boot bloqueia
> se houver origem `http://` em `CORS_ORIGIN` com `none`.

## 3. Provisionamento do banco

Ordem obrigatória — as migrations criam **só as tabelas**; a segurança
multi-tenant vem depois:

```bash
npm run db:setup:prod
# = prisma migrate deploy  → npm run db:rls:psql → npm run db:constraints:psql → prisma generate
```

Depois, defina a senha do `app_role` (a RLS o cria com `CHANGE_ME`):

```bash
psql "$DIRECT_URL" -c "ALTER ROLE app_role PASSWORD 'a-senha-forte-do-DATABASE_URL';"
```

> Os scripts `db:rls` / `db:constraints` (sem `:psql`) usam `docker exec` e
> servem **só ao dev local**. Em produção use as variantes `:psql`, que
> conectam via `DIRECT_URL`.

⚠️ **Ao adicionar tabela nova**: reaplique `db:rls:psql` — a RLS auto-descobre
toda tabela com `tenant_id`, mas só quando o script roda.

## 4. Frontend

```bash
cd web
NEXT_PUBLIC_API_URL="https://api.seudominio.com/api" npm run build
npm start
```

A URL da API entra no bundle **em tempo de build** — rebuild ao trocá-la.

## 5. Ordem do deploy

1. Subir o banco e rodar `db:setup:prod`
2. Subir a API (`npm run build && npm run start:prod`) — se o env estiver errado, **não sobe**
3. Conferir `GET /api/health` → `{"status":"ok","db":"up"}`
4. Buildar e subir o frontend

## 6. Antes de abrir para clientes

- [ ] HTTPS ponta a ponta (o cookie `Secure` depende disso)
- [ ] Backup automático do Postgres (+ teste de restore)
- [ ] `ENCRYPTION_KEY` guardada em cofre — perdê-la = perder CPF/tokens cifrados
- [ ] **Agendador ligado** (`SCHEDULER_ENABLED=true`) — sem ele os lembretes
      automáticos não saem e o trial não expira. Com várias instâncias, pode
      deixar ligado em todas: o advisory lock garante que só uma processe.
- [ ] **Operador da plataforma** criado: `npm run platform:admin -- <email> <senha> "<Nome>"`.
      Acesso em `/platform`.
- [ ] Multi-instância: `STORAGE_PROVIDER=s3` (+ credenciais S3/R2) e
      `THROTTLE_REDIS_URL` — senão arquivos e rate limit não são compartilhados
      entre as instâncias.
- [ ] Rate limit: para múltiplas instâncias, mover o throttler para Redis
- [ ] `MAIL_PROVIDER=smtp` configurado e testado — sem isso o "esqueci minha
      senha" **não envia e-mail** (o provider `fake` apenas loga)
- [ ] Coletar os logs JSON (stdout) num agregador — cada linha traz `reqId`,
      `tenantId` e `userId` para rastrear uma requisição ponta a ponta
- [ ] **Sentry** (recomendado): criar projeto em sentry.io e definir `SENTRY_DSN`
      para ser avisado de erros 5xx antes do cliente. Sem o DSN, fica desligado.
- [ ] **Realtime**: o WebSocket usa o mesmo host/porta da API (namespace
      `/realtime`). Se houver proxy reverso (nginx), habilite o *upgrade* de
      WebSocket. `CORS_ORIGIN` também vale para o socket.
- [ ] Trocar os providers `fake` (WhatsApp/pagamento) pelos reais — ver
      [INTEGRATIONS.md](INTEGRATIONS.md)
- [ ] **Pagamento no PDV**: em Configurações, trocar para `mercadopago` e colar
      o access token. Com `fake`, o QR é fictício e **não cobra de verdade**.
      Aponte o webhook de pagamentos do Mercado Pago para
      `https://<sua-api>/api/payments/webhook`

## Pendências conhecidas para escala

Logging estruturado (pino) + observabilidade (Sentry), e-mail transacional
(reset de senha), URLs assinadas para mídia, throttler em Redis. Ver
[SECURITY.md](SECURITY.md).
