# Deploy: Vercel (frontend) + Render (backend) + Supabase (banco)

Guia prático de produção. A divisão existe porque o **backend NestJS é um servidor
persistente** (WebSocket do realtime + agendador cron) — isso não roda em funções
serverless. Então:

```
Frontend (web/, Next.js)  →  Vercel
Backend  (NestJS)         →  Render        (Web Service)
Banco    (Postgres)       →  Supabase      (Postgres gerenciado)
Redis    (opcional)       →  Upstash       (rate limit multi-instância)
Storage  (opcional)       →  Cloudflare R2 (arquivos de mídia)
```

> Podem ser trocados por equivalentes (Railway, Neon, Fly.io) — o que importa são
> as **variáveis de ambiente** de cada um.

> ⚠️ **Render plano grátis hiberna após ~15 min sem acesso.** Efeitos: o primeiro
> acesso depois disso demora ~30–60s, e o **agendador de lembretes pode não
> disparar** enquanto dorme. Para testar, tudo bem. Para clientes reais, use o
> plano pago da Render (~US$7/mês) ou o Railway (sempre ligado). Paliativo no
> grátis: um "pinger" externo (UptimeRobot/cron-job.org) batendo em
> `/api/health` a cada 10 min mantém acordado.

---

## Ordem geral

1. Banco no Supabase → 2. Backend no Render → 3. Frontend no Vercel → 4. Ligar as pontas.

---

## 1. Banco de dados (Supabase)

1. Em <https://supabase.com> → **New project**. Defina uma **senha de banco
   forte** (guarde!) e a região (South America / São Paulo).
2. Pegue a connection string em **Connect** (botão no topo) → **Session pooler**.
   Use SEMPRE o **Session pooler** (host `aws-0-<região>.pooler.supabase.com`,
   porta `5432`), não o "Direct connection": o host direto `db.<ref>.supabase.co`
   é **só IPv6** e não resolve na maioria das redes/PCs IPv4. O usuário no pooler
   tem o formato `postgres.<ref>` (o ref do projeto vai embutido no usuário).
   - (A "Transaction pooler" na 6543 é para serverless — não usamos, pois o
     backend na Render é um servidor persistente.)
3. Provisione o schema + segurança. **No seu PC**, apontando para o Supabase
   (troque `SENHA` e `<ref>`/`<região>` pelos do seu projeto):
   ```bash
   export DIRECT_URL="postgresql://postgres.<ref>:SENHA@aws-0-<região>.pooler.supabase.com:5432/postgres?sslmode=require"
   npm run db:setup:prod   # migrate deploy + RLS + constraints + generate
   ```
   > O `db:rls:psql` já é seguro no Supabase: engole o `ALTER ROLE` que exige
   > superusuário (atributos já são o padrão) e desliga a RLS que o Supabase
   > liga por padrão nas tabelas globais (`plans`, `tenants`, `platform_admins`).
4. Defina a senha do `app_role` (a RLS o cria) e monte o `DATABASE_URL`:
   ```bash
   psql "$DIRECT_URL" -c "ALTER ROLE app_role PASSWORD 'UMA_SENHA_FORTE_DO_APP';"
   ```
   O **`DATABASE_URL`** (runtime, sofre RLS) usa o mesmo host/pooler, trocando o
   usuário para `app_role.<ref>`:
   `postgresql://app_role.<ref>:UMA_SENHA_FORTE_DO_APP@aws-0-<região>.pooler.supabase.com:5432/postgres?sslmode=require`

> Você terá **duas** URLs do mesmo banco: `DIRECT_URL` (usuário `postgres`, dono —
> migrations/RLS) e `DATABASE_URL` (usuário `app_role`, runtime). Ver [DEPLOY.md](DEPLOY.md).

> No Supabase, `psql` você roda do seu PC (a connection string do passo 2). Se não
> tiver `psql` instalado, dá para rodar o `ALTER ROLE` pelo **SQL Editor** do
> painel do Supabase.

---

## 2. Backend (Render)

1. <https://render.com> → **New → Web Service** → conecte o repositório GitHub.
2. Configurações:
   - **Root Directory:** vazio (o backend está na raiz).
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run start:prod`
   - **Health Check Path:** `/api/health`
3. **Environment → Add Environment Variable** — cole:

   | Variável | Valor |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | a URL do **app_role** (passo 1.3) |
   | `DIRECT_URL` | a URL **owner** (`postgres.<ref>`) do Supabase (passo 1.3) |
   | `JWT_SECRET` | `openssl rand -base64 48` |
   | `ENCRYPTION_KEY` | **a chave forte que você guardou no cofre** (nunca troque) |
   | `CORS_ORIGIN` | a URL do frontend na Vercel (passo 3) — ex.: `https://barber.vercel.app` |
   | `APP_URL` | a mesma URL do frontend (usada nos links de e-mail) |
   | `COOKIE_SAMESITE` | `none` |
   | `SCHEDULER_ENABLED` | `true` |

   > **Por que `COOKIE_SAMESITE=none`:** frontend (Vercel) e backend (Render)
   > ficam em **domínios diferentes**. Com `lax`, o cookie de sessão não viajaria
   > e o usuário seria deslogado. `none` exige HTTPS — a Render já dá HTTPS.

   Opcionais (quando quiser ativar):
   | Variável | Para quê |
   |---|---|
   | `MAIL_PROVIDER=smtp` + `MAIL_HOST/PORT/USER/PASS/FROM` | "esqueci a senha" envia e-mail de verdade |
   | `SENTRY_DSN` | alertas de erro |
   | `THROTTLE_REDIS_URL` | rate limit compartilhado (se usar mais de 1 instância) |
   | `STORAGE_PROVIDER=s3` + `S3_*` | mídia em object storage (o disco da Render é efêmero em cada deploy) |

4. Deploy. A app **recusa subir** se algo essencial faltar (validação de env).
   Confira `https://<seu-backend>.onrender.com/api/health` → `{"status":"ok"}`.

> ⚠️ **`ENCRYPTION_KEY` aqui é a de produção e é definitiva.** Guarde uma cópia
> fora do git/Render. Se a perder, os dados cifrados (CPF, tokens) ficam
> irrecuperáveis. Ver [CREDENCIAIS.md](CREDENCIAIS.md#4-segurança-dos-segredos).

---

## 3. Frontend (Vercel)

1. <https://vercel.com> → **Add New → Project** → importe o mesmo repositório.
2. Configurações:
   - **Root Directory:** `web`  ← importante, o Next fica na subpasta.
   - Framework: Next.js (detecta sozinho).
3. **Settings → Environment Variables:**

   | Variável | Valor |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://<seu-backend>.onrender.com/api` |

   > Só isso. O frontend **não** recebe `ENCRYPTION_KEY` nem segredo nenhum — a
   > cifragem acontece no backend. `NEXT_PUBLIC_*` é público por natureza (vai no
   > bundle do navegador), então nunca coloque segredo com esse prefixo.

4. Deploy. Anote a URL final (ex.: `https://barber.vercel.app`).

---

## 4. Ligar as pontas

1. Volte na **Render** e ajuste `CORS_ORIGIN` e `APP_URL` para a URL real da
   Vercel (passo 3.4). Redeploy do backend.
2. Teste o fluxo: abra o frontend, faça login com um tenant, confirme que a
   sessão persiste (o cookie cross-site funcionando) e que os dados carregam.
3. **Credenciais de integração** (WhatsApp, Mercado Pago) — configure **por
   barbearia** na tela **Configurações**, e aponte os webhooks para a URL da
   Render. Passo a passo em [CREDENCIAIS.md](CREDENCIAIS.md).

---

## Resumo: onde cada segredo mora

| Segredo | Onde |
|---|---|
| `ENCRYPTION_KEY`, `JWT_SECRET`, `DATABASE_URL`, `DIRECT_URL` | **Render** (backend) |
| `NEXT_PUBLIC_API_URL` | **Vercel** (frontend) — não é segredo |
| Token WhatsApp / Mercado Pago | **banco** (cifrado), via tela Configurações |
| Cópia de segurança da `ENCRYPTION_KEY` | **seu cofre pessoal** (gerenciador de senhas) |

Nenhum segredo fica no git — os `.env` estão no `.gitignore`; cada plataforma
guarda suas variáveis de forma segura.

---

## Redeploys futuros

- **Código:** `git push` → Render e Vercel reconstroem sozinhas.
- **Mudou o schema (`schema.prisma`):** rode `npm run db:deploy` apontando para o
  Supabase (`DIRECT_URL`, owner) **antes** do backend novo subir; se criou tabela
  nova, reaplique a RLS (`db:rls:psql`) — no Supabase, toda tabela nova nasce com
  RLS ligada, então reaplicar é obrigatório (o script protege as com `tenant_id` e
  desliga as globais). Ver [prisma/migrations/README.md](../prisma/migrations/README.md).
