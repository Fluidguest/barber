# Auditoria de infraestrutura e multi-tenancy

Verificação executada contra o banco e o código reais (não é checklist teórico).
Reproduza os comandos quando quiser reauditar.

---

## 1. Isolamento entre barbearias — ✅ sólido

### 1.1 Cobertura de RLS: 34/34 tabelas, zero descobertas

```sql
-- Tabelas com tenant_id SEM row-level security (deve retornar VAZIO)
SELECT c.relname FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity = false
  AND EXISTS (SELECT 1 FROM information_schema.columns col
              WHERE col.table_name=c.relname AND col.column_name='tenant_id');
```
**Resultado: vazio.** As 34 tabelas de negócio estão protegidas. A
auto-descoberta (`prisma/rls/enable-rls.sql`) cobriu inclusive as criadas
depois (`password_reset_tokens`, `sale_charges`) — basta rodar `db:rls`.

O modelo é **fail-closed**: sem `app.current_tenant` na transação, nenhuma
linha casa. Esquecer o filtro no código não vaza dado.

### 1.2 Conexão que bypassa a RLS: 3 usos, todos legítimos

| Onde | Para quê |
|---|---|
| `billing.service.ts` | assinatura pelo `externalId` (webhook de cobrança) |
| `payments.service.ts` | cobrança pelo `externalId` (webhook de pagamento) |
| `whatsapp.service.ts` | número → barbearia (webhook da Meta) |

Os três resolvem **um identificador externo → tenantId** e daí em diante
processam sob `withTenant`. É exatamente o uso previsto.

### 1.3 Acesso sem `withTenant`: só na tabela `tenants`

5 ocorrências, todas em `tenants` — tabela **global da plataforma** (não tem
`tenant_id`), usada para: resolver slug no login/registro, no agendamento
público e checar suspensão no guard. Correto por natureza.

Nenhum endpoint lista barbearias → **não há enumeração de tenants**.

### 1.4 Índices únicos: nenhum problemático

Os únicos que não incluem `tenant_id` são chaves primárias (`cuid`) ou globais
**de propósito**:
- `whatsapp_numbers.phone_number_id` — precisa ser global: é a chave que o
  webhook usa para achar a barbearia;
- hashes de `refresh_tokens` / `password_reset_tokens` — valores aleatórios.

Uniques de negócio (ex.: e-mail de usuário) são `(tenant_id, ...)`. Duas
barbearias podem ter o mesmo produto, cliente, e-mail de usuário, etc.

### 1.5 Testes

**198 testes / 30 suítes**, com caso de isolamento por módulo + suíte dedicada
de segurança (cross-tenant com id forjado, auth, mass-assignment, injeção,
rate limit, cookie, reset de senha, URL assinada, área pública, pagamento,
realtime, plataforma).

---

## 2. Vender para várias barbearias — funciona, com lacunas **operacionais**

O modelo comercial já está de pé: cadastro self-service (`POST /auth/register`)
cria barbearia + unidade + admin em `TRIAL`; `billing/` tem planos, assinatura e
webhook; o guard devolve **402** para `SUSPENDED`/`CANCELED`. Não há trabalho
manual para abrir uma barbearia nova.

As lacunas abaixo eram de operação (não de segurança). **As quatro foram
corrigidas** — a descrição fica como registro do que era e como foi resolvido.

### ✅ 2.1 Agendador (cron) — RESOLVIDO

Era: lembretes ficavam na fila, mas só saíam se alguém chamasse
`POST /notifications/dispatch` **por barbearia**. Nenhum lembrete era enviado
sozinho.

Agora: `SchedulerService` (`src/scheduler/`) roda a cada 5 min, itera as
barbearias ativas e despacha os lembretes vencidos de todas. Uma barbearia com
erro (ex.: token vencido) não impede as demais. Protegido por **advisory lock**
do Postgres (`pg_try_advisory_lock`) — com várias instâncias, só uma executa, e
o cliente não recebe mensagem duplicada. Desligável por `SCHEDULER_ENABLED`.

### ✅ 2.2 Expiração de trial — RESOLVIDO

Era: `trialEndsAt` era gravado, mas nada olhava para ele → teste gratuito para
sempre.

Agora: job horário (`expireTrials`) suspende **dois** casos — quem assinou o
teste e venceu (`subscription.trialEndsAt < agora`) **e** quem se cadastrou e
nunca assinou (conta `TRIAL_DAYS` a partir de `createdAt`). Este segundo caso
foi descoberto **pelo teste** — a query inicial só pegava quem tinha assinatura.
Idempotente. Ao suspender, a API da barbearia passa a responder 402.

### ✅ 2.3 Painel do operador da plataforma — RESOLVIDO

`src/platform/` + tela `web/app/platform`. Ver estatísticas, listar/buscar
barbearias, ver volumes agregados e **suspender/reativar** manualmente.

**Fronteira de identidade** (o ponto sensível): o operador é uma tabela GLOBAL
`platform_admins`, com login próprio e token marcado `scope=platform`. Efeito:
- token de barbearia **não entra** no painel (não tem o scope);
- token de plataforma **não acessa** dados de barbearia (não tem `tenantId`,
  barrado pelo `JwtAuthGuard`);
- o painel expõe **só métricas de plataforma** — nunca clientes, faturamento ou
  conversas da barbearia;
- a conexão de runtime (`app_role`) **não tem privilégio** sobre
  `platform_admins` (verificado: `has_table_privilege` = false) — os hashes de
  senha do painel ficam fora do alcance do caminho normal da aplicação;
- desativar o operador corta o acesso **na hora** (reconferido no banco);
- ações de suspensão ficam no log com quem fez.

Primeiro operador: `npm run platform:admin -- <email> <senha> "<Nome>"`.

### ✅ 2.4 Escala horizontal — RESOLVIDO

| O quê | Correção |
|---|---|
| Rate limit | `THROTTLE_REDIS_URL`/`REDIS_URL` → contador compartilhado no Redis (`ThrottlerStorageRedisService`). Sem a env, segue em memória (dev). |
| Storage | `STORAGE_PROVIDER=s3` → `S3StorageProvider` (S3/R2/MinIO), assinatura **SigV4 nativa, sem SDK**. Sem a env, segue em disco local. |

Ambos são **opt-in por env** — dev e single-instance não mudam nada.

---

## 3. Veredito

**Segurança e isolamento: prontos para vender.** O ponto que costuma afundar
SaaS multi-tenant — vazamento entre clientes — está coberto em duas camadas
(RLS no banco + `withTenant` na aplicação), com auto-descoberta que elimina o
erro humano de "esqueci de proteger a tabela nova", e com teste de isolamento
por módulo. O painel do operador foi construído respeitando essa fronteira.

**Operação: as quatro lacunas foram fechadas.** O agendador envia lembretes de
todas as barbearias e expira trials; o operador tem painel; Redis e S3 destravam
a segunda instância quando precisar. **30 suítes / 198 testes** no verde.

Já entregues depois desta auditoria: **realtime (Socket.io)** no inbox e agenda,
**observabilidade (Sentry)** opt-in, cadastro completo de barbeiro, planos por
intervalo, filtros de agenda, relatório de inativos e desconto/acréscimo no PDV.

Próximo não bloqueante: fiscal (NFC-e/NFS-e), via provedor terceiro.
