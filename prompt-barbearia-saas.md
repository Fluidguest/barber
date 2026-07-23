# Prompt de Desenvolvimento — SaaS de Gestão para Barbearias

> Versão revisada. Objetivo: sair do "documento impressionante" para software que
> entra em produção e gera receita. As decisões arquiteturais que importam já estão
> tomadas aqui; o que sobra é executar.

---

## 1. Missão e contexto

Você é o time de engenharia responsável por construir um **SaaS multi-tenant de gestão
para barbearias**. Cada barbearia é um *tenant* com dados isolados. O sistema é vendido
por assinatura mensal.

**Princípio nº 1 — entregar valor antes de completude.** É proibido tentar construir
"o sistema inteiro" de uma vez. O trabalho é organizado em ondas (MVP → V2 → V3). Nada
da onda seguinte começa antes da onda atual estar em produção e validada com pelo menos
uma barbearia real usando.

**Princípio nº 2 — decisão explícita, não implícita.** Onde houver mais de um caminho
técnico, a decisão já está registrada na seção "Decisões Arquiteturais" (ADRs). Só se
desvia de uma ADR com justificativa escrita e nova ADR.

---

## 2. Decisões Arquiteturais (ADRs) — já tomadas

Estas decisões **não são para debater no meio do código**. Estão fechadas.

### ADR-001 — Estratégia de multi-tenancy: **Row-Level (`tenant_id`) com Postgres RLS**
- Um único banco, uma schema. Toda tabela de negócio carrega `tenant_id NOT NULL`.
- Isolamento garantido por **Row-Level Security (RLS)** do Postgres, não só por
  `WHERE` na aplicação. A aplicação seta `SET app.current_tenant` por request; as
  policies do Postgres barram vazamento mesmo com bug de query.
- **Por quê:** schema-per-tenant e database-per-tenant não escalam para "milhares de
  empresas" sem virar pesadelo de migração e custo. Row-level + RLS é o padrão de
  mercado (é o que Basecamp, GitLab e a maioria dos SaaS B2B usam) e é barato de operar.
- **Regra inegociável:** nenhuma query de negócio pode confiar apenas no filtro da
  aplicação. RLS é a rede de segurança. Testes de isolamento entre tenants são
  obrigatórios (ver DoD).

### ADR-002 — Infraestrutura inicial: **Docker Compose num VPS. Kubernetes fica para depois.**
- Começamos com **Docker Compose** (app, Postgres, Redis, worker). "Kubernetes-ready"
  significa *containers stateless e config por env* — não significa provisionar K8s no dia 1.
- Migrar para K8s só quando houver problema real de escala que o Compose não resolva.
- **Por quê:** K8s no MVP é custo e complexidade sem retorno. Um VPS com Compose atende
  tranquilamente as primeiras dezenas/centenas de barbearias.

### ADR-003 — WhatsApp: **API Oficial da Meta (Cloud API) como padrão; WAHA como opção secundária.**
- O conector é uma **interface abstrata** (`WhatsAppProvider`) com duas implementações.
  A oficial (Meta Cloud API) é o default por não ter risco de ban.
- WAHA/Evolution ficam atrás da mesma interface, oferecidos como opção de menor custo
  para o cliente que aceitar o risco — nunca como única saída.
- **Por quê:** WAHA/Evolution são não-oficiais; número pode ser banido e a lib pode
  quebrar sem aviso. Amarrar o produto inteiro a isso é risco de negócio inaceitável.

### ADR-004 — Gateway de pagamento: **um provedor primeiro (Mercado Pago), atrás de interface.**
- Implementa-se **um** provedor de verdade no MVP (Mercado Pago — PIX + cartão + boleto +
  assinaturas via *preapproval*; SDK mais difundido e melhor documentado no mercado BR).
  Os demais (Asaas, Stripe, etc.) são *stubs* atrás da interface `PaymentProvider`,
  implementados sob demanda.
- **Por quê:** "conectores para 8 gateways" é meses de trabalho e manutenção. Um
  provedor que funciona vende; oito pela metade não vendem.

### ADR-005 — Agenda é timezone-aware por unidade.
- Todo horário é armazenado em **UTC**; toda unidade (filial) tem seu **timezone**.
  A UI converte. Feriados e horários de funcionamento são por unidade.
- **Por quê:** barbearia é um produto de agenda. Errar timezone/horário quebra a
  funcionalidade central. Isso costuma ser esquecido e vira retrabalho caro.

### ADR-006 — Billing do PRÓPRIO SaaS ≠ gateway dos clientes.
- Existem **duas** camadas de pagamento, e elas não se misturam:
  1. **Billing da plataforma:** a assinatura que a barbearia paga *para você* (planos,
     limites, trial, faturas, suspensão por inadimplência).
  2. **Gateway do cliente:** o meio da barbearia cobrar *os clientes dela*.
- **Por quê:** o modelo de negócio do SaaS mora na camada 1, e o prompt original nem
  mencionava isso. Sem billing, não há receita.

### ADR-007 — CQRS/Event-Driven só onde paga a complexidade.
- Arquitetura padrão: **REST + camadas (Controller → Service → Repository)** com NestJS.
- **Eventos/filas (BullMQ sobre Redis)** apenas para trabalho assíncrono real:
  notificações, envio de WhatsApp, fechamento de comissão, relatórios pesados, webhooks.
- **Nada de CQRS full** (bancos de leitura/escrita separados) no início. É overengineering.

---

## 3. Stack

| Camada | Escolha |
|---|---|
| Backend | NestJS + TypeScript |
| Frontend | Next.js (App Router) + React + TailwindCSS + shadcn/ui |
| Banco | PostgreSQL (com RLS) |
| ORM | Prisma |
| Cache / Filas | Redis + BullMQ |
| Realtime | Socket.io (namespaced por tenant) |
| Storage | S3-compatible (Cloudflare R2 ou AWS S3) |
| Auth | JWT de acesso curto + refresh token rotativo; 2FA (TOTP) |
| Deploy | Docker + Docker Compose (K8s-ready, ver ADR-002) |
| Observabilidade | Logs estruturados (pino), health checks, Sentry |

---

## 4. Modelo de execução (o "time" sem teatro)

Uma única linha de execução, que usa **chapéus** conforme a etapa exige — não 10 agentes
paralelos produzindo documento. Os chapéus e o que cada um garante:

- **Produto:** recorta o MVP, escreve histórias com critério de aceite. Não deixa escopo inflar.
- **Arquitetura:** dono das ADRs. Qualquer desvio passa por ele.
- **Backend / Frontend:** implementam por módulo, seguindo o DoD.
- **Segurança:** checklist OWASP + isolamento de tenant + LGPD, aplicado como gate, não como fase final.
- **QA:** escreve os testes junto com o código (não depois). Bloqueia merge sem DoD cumprido.
- **DevOps:** Compose, CI/CD, backups, env. Mantém o "deploy em 1 comando".

**Checkpoints humanos existem e são esperados.** O prompt original prometia "mínima
intervenção humana" *e* "validar cada etapa" — isso é contraditório. A verdade: ao fim de
cada onda e de cada módulo, há uma validação humana antes de seguir. Automatize os testes,
não a decisão de avançar.

---

## 5. Escopo em ondas (a parte mais importante)

### 🟢 MVP — "o que faz uma barbearia assinar"
O objetivo é uma barbearia conseguir operar o dia a dia e você conseguir cobrar por isso.

1. **Auth + Multi-tenant + RLS** — cadastro de barbearia (tenant), login, refresh,
   2FA opcional, perfis básicos (Admin, Recepção, Barbeiro).
2. **Billing da plataforma (ADR-006)** — planos, trial, fatura da assinatura via Mercado
   Pago, suspensão por inadimplência. Simples, mas real.
3. **Cadastro de clientes** — dados essenciais + histórico + tags.
4. **Serviços** — nome, duração, preço, categoria.
5. **Barbeiros** — cadastro, especialidades, horário de trabalho, folgas.
6. **Agenda** (ADR-005) — visão dia/semana, criar/arrastar/reagendar, bloqueio de horário,
   multi-barbeiro. É o coração; caprichar aqui.
7. **Atendimento/Comanda + Caixa básico** — registrar o serviço feito, valor, forma de
   pagamento; abrir/fechar caixa do dia.
8. **Comissão simples** — % por barbeiro sobre serviço; fechamento por período.
9. **Lembrete de agendamento via WhatsApp** (ADR-003) — 1 automação só: lembrete +
   confirmação. Prova a integração ponta a ponta sem construir o "chat completo".
10. **Dashboard mínimo** — faturamento do dia, agenda do dia, atendimentos, ticket médio.

**Fora do MVP (dizer "não" explicitamente):** estoque, DRE, funil/CRM, chat interno
completo, campanhas, IA, BI, API pública, múltiplas unidades, múltiplos gateways.

### 🟡 V2 — "profissionaliza a operação"
- Financeiro completo (fluxo de caixa, categorias, centro de custo, contas, recorrências, DRE).
- Estoque e produtos (movimentações, alertas, curva ABC).
- Gateway do cliente completo (ainda só Mercado Pago): PIX, cartão, link, assinaturas dos clientes.
- CRM + funil de leads em Kanban.
- Chat de WhatsApp interno (multi-atendente, mídia, respostas prontas) + mais automações.
- Comissionamento avançado (por produto, meta, categoria, campanha).
- Relatórios exportáveis (Excel/PDF/CSV) e mais indicadores.
- Notificações multicanal (push, email, interno).

### 🔵 V3 — "escala e diferenciação"
- Módulo de IA (atendimento, marketing, insights) — OpenAI/Claude/Gemini atrás de interface.
- Campanhas e disparos segmentados.
- API pública documentada (Swagger) + webhooks + preparação de SDK.
- BI avançado (100+ indicadores).
- Múltiplas unidades por tenant.
- Segundo/terceiro gateway (Asaas, Stripe) conforme demanda real.
- Integrações Google/Meta, N8N/Make/Zapier.
- Migração para Kubernetes, se e quando a escala exigir (ADR-002).

---

## 6. Definition of Done (DoD) — por módulo

Um módulo só está "pronto" quando **todos** os itens abaixo estão verdes. Sem isso,
"validar cada etapa" não tem critério objetivo.

- [ ] Endpoints com Controller → Service → Repository, DTOs validados (class-validator).
- [ ] Toda tabela nova tem `tenant_id`, `created_at`, `updated_at`, `deleted_at` (soft delete)
      e RLS policy ativa.
- [ ] **Teste de isolamento de tenant**: um tenant não enxerga/edita dado de outro (obrigatório).
- [ ] Testes unitários das regras de negócio + ao menos 1 teste de integração do fluxo feliz
      e 1 de erro.
- [ ] Erros tratados e padronizados; nada de stack trace vazando para o cliente.
- [ ] Paginação, filtro e busca nos endpoints de listagem.
- [ ] Ações relevantes geram registro de **auditoria** (quem, quando, IP, o quê mudou).
- [ ] Permissões aplicadas por perfil.
- [ ] UI responsiva (mobile-first), com estados de loading/erro/vazio.
- [ ] Passou pelo gate de segurança (seção 7).
- [ ] Migração Prisma versionada + seed de exemplo.
- [ ] Rodável com `docker compose up` sem passo manual escondido.

---

## 7. Segurança e LGPD — gate contínuo, não fase final

Aplicado em cada módulo, não deixado para o fim:

- Isolamento de tenant por RLS (ADR-001) — é a defesa principal.
- OWASP Top 10: injeção (Prisma parametrizado), XSS (escaping no React + CSP), CSRF em
  rotas com cookie, autorização quebrada (checar tenant + perfil em todo endpoint).
- Rate limiting (por IP e por tenant) e proteção de brute force no login.
- Senhas com argon2/bcrypt; refresh token rotativo com revogação; 2FA TOTP.
- Segredos só por variável de ambiente; nada de credencial no repositório.
- LGPD: base legal e consentimento, exportação e exclusão de dados do titular,
  minimização, e criptografia de dados sensíveis em repouso (CPF, etc.).
- Logs de segurança e trilha de auditoria com capacidade de rollback quando possível.
- Backup automatizado do Postgres + teste de restauração.

---

## 8. Processo de entrega (por onda)

Para **cada onda**, nesta ordem, sem pular:

1. Recorte de histórias + critérios de aceite (chapéu Produto).
2. Ajuste de modelagem no schema Prisma (só o necessário para a onda).
3. Backend do módulo (seguindo DoD).
4. Frontend do módulo.
5. Testes automatizados (escritos junto, não depois).
6. Gate de segurança + isolamento de tenant.
7. Deploy em homologação + validação humana com dado real.
8. Registro de decisões novas (ADRs) e atualização da documentação.
9. Só então: próximo módulo/onda.

---

## 9. Diretriz final

Antes de implementar qualquer coisa, faça **uma** pergunta: *"isso é MVP?"* Se não for,
não é agora. Prefira um módulo que funciona de ponta a ponta a dez módulos pela metade.
Código limpo, modular, testado e rodável em um comando vale mais que um documento que
descreve um ERP perfeito que ninguém consegue executar. Não avance de onda sem uma
barbearia real validando a anterior, e mantenha as ADRs como registro vivo das decisões.
