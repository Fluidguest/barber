# Barber SaaS — Frontend (Next.js)

Interface administrativa em Next.js 16 (App Router) + React 19 + Tailwind v4,
consumindo a API do backend. Tema escuro, autenticação por JWT (client-side).

## Rodar

Precisa do **backend rodando** (ver `../README.md`) em `http://localhost:3333`.

```bash
npm install
npm run dev -- -p 3100     # http://localhost:3100
```

> No ambiente de dev a porta **3000 estava ocupada** por outro projeto; por isso
> a 3100. A URL da API vem de `NEXT_PUBLIC_API_URL` em `.env.local`
> (default `http://localhost:3333/api`).

> As credenciais de acesso são criadas pelo seed (`npm run db:seed`) ou pelo
> cadastro. Não versione logins reais aqui.

## Estrutura

```
app/
  page.tsx              redireciona p/ /dashboard ou /login
  login/page.tsx        formulário de login (guarda o JWT)
  (app)/
    layout.tsx          sidebar + guarda de autenticação (/auth/me)
    dashboard/page.tsx  KPIs do dia (/dashboard/today)
    agenda/page.tsx     agenda de hoje (/appointments + nomes)
    clients/page.tsx    lista + cadastro (/clients)
lib/
  api.ts                fetch autenticado (JWT, trata 401)
  format.ts             moeda BRL, horário, status
```

## Telas implementadas

- **Login** — resolve tenant pelo slug + email/senha.
- **Dashboard** — faturamento, ticket, comandas, comissões, atendimentos, caixa.
- **Agenda** — atendimentos do dia com nome do cliente/barbeiro e status.
- **Caixa / PDV** — abrir/fechar caixa, comanda, itens, pagamento, fechar (gera comissão).
- **Clientes** — listagem e cadastro rápido.
- **Serviços** — cadastro (nome, duração, preço) e remoção.
- **Barbeiros** — cadastro com especialidades, jornada rápida (Seg–Sex) e remoção.

Com isso a barbearia é configurável 100% pela interface. Próximas telas naturais:
tela de comissões, área de billing/assinatura, e a agenda interativa (drag & drop).
