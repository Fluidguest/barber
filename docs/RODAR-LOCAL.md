# Rodar localmente (a partir do clone)

Guia para quem clonou o repositório e quer testar na própria máquina. As
integrações (WhatsApp, Mercado Pago, e-mail) vêm em modo **`fake`** por padrão —
**não precisa de nenhuma credencial** para testar tudo.

## Pré-requisitos

- **Docker Desktop** (para Postgres + Redis)
- **Node.js 20+**

## Passo a passo

```bash
# 1. clonar
git clone https://github.com/Fluidguest/barber.git
cd barber

# 2. subir Postgres (porta 15432) e Redis
docker compose up -d

# 3. backend: dependências + variáveis de ambiente
npm install
cp .env.example .env          # os valores já funcionam para dev local

# 4. provisionar o banco (schema + RLS + constraints) e popular demo
npm run db:setup
npm run db:seed

# 5. subir a API (http://localhost:3333/api)
npm run start:dev
```

Em **outro terminal**, o frontend:

```bash
cd web
npm install
cp .env.example .env.local     # já aponta para http://localhost:3333/api
npm run dev                     # http://localhost:3100
```

## Acesso de demonstração

Abra **http://localhost:3100** e entre com:

| Campo | Valor |
|---|---|
| Barbearia (slug) | `demo` |
| E-mail | `admin@demo.com` |
| Senha | `demo1234` |

Página pública de agendamento: **http://localhost:3100/agendar/demo**

## Rodar os testes (opcional)

```bash
npm run test:e2e     # 198 testes / 30 suítes contra o Postgres local
```

## Observações

- **Não precisa das chaves de produção.** O `.env` local usa valores de dev; o
  banco é criado do zero na máquina dele, então qualquer `ENCRYPTION_KEY` serve.
- **Integrações reais ficam desligadas** (modo `fake`) — envio de WhatsApp,
  cobrança PIX e e-mail apenas simulam/logam, sem cobrar nem enviar nada.
- **Resetar tudo:** `docker compose down -v && docker compose up -d && npm run db:setup && npm run db:seed`.
- Se a porta 15432 ou 3100/3333 estiver ocupada, ajuste no `docker-compose.yml` /
  variáveis de ambiente.
