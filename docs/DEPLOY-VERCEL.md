# Deploy: Vercel (frontend) + Render (backend) + Neon (banco)

Guia prático de produção. A divisão existe porque o **backend NestJS é um servidor
persistente** (WebSocket do realtime + agendador cron) — isso não roda em funções
serverless. Então:

```
Frontend (web/, Next.js)  →  Vercel
Backend  (NestJS)         →  Render        (servidor sempre ligado)
Banco    (Postgres)       →  Neon          (Postgres gerenciado)
Redis    (opcional)       →  Upstash       (rate limit multi-instância)
Storage  (opcional)       →  Cloudflare R2 (arquivos de mídia)
```

> Render/Neon/Upstash/R2 podem ser trocados por equivalentes (Railway, Supabase,
> Fly.io) — o que importa são as **variáveis de ambiente** de cada um.

---

## Ordem geral

1. Banco no Neon → 2. Backend no Render → 3. Frontend no Vercel → 4. Ligar as pontas.

---

## 1. Banco de dados (Neon)

1. Crie um projeto em <https://neon.tech> → anote a **connection string** (algo
   como `postgresql://OWNER:SENHA@ep-xxx.neon.tech/neondb?sslmode=require`).
   Essa é a conexão **dono** → vira o `DIRECT_URL`.
2. Provisione o schema + segurança. **No seu PC**, apontando para o Neon:
   ```bash
   # use a connection string do Neon como DIRECT_URL
   export DIRECT_URL="postgresql://OWNER:SENHA@ep-xxx.neon.tech/neondb?sslmode=require"
   npm run db:setup:prod   # migrate deploy + RLS + constraints + generate
   ```
3. Defina a senha do `app_role` (a RLS o cria) e monte o `DATABASE_URL`:
   ```bash
   psql "$DIRECT_URL" -c "ALTER ROLE app_role PASSWORD 'UMA_SENHA_FORTE';"
   ```
   O **`DATABASE_URL`** (conexão de runtime, sofre RLS) fica:
   `postgresql://app_role:UMA_SENHA_FORTE@ep-xxx.neon.tech/neondb?sslmode=require`

> Você terá **duas** URLs do mesmo banco: `DIRECT_URL` (owner, migrations) e
> `DATABASE_URL` (app_role, runtime). Ver [DEPLOY.md](DEPLOY.md).

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
   | `DIRECT_URL` | a URL **owner** do Neon (passo 1.1) |
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
  Neon (owner) **antes** do backend novo subir; se criou tabela nova, reaplique a
  RLS (`db:rls:psql`). Ver [prisma/migrations/README.md](../prisma/migrations/README.md).
