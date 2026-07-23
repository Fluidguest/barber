# RLS + contexto de tenant no NestJS/Prisma

O schema garante `tenant_id` em toda tabela de negócio; o `enable-rls.sql` garante
que o **Postgres** barra vazamento entre tenants. Falta o elo do meio: **setar o
tenant corrente em cada request**. Sem isso, o `app_role` não enxerga nenhuma linha
(fail-closed — proposital).

## Duas credenciais de banco (importante — segurança)

- **Runtime da app** conecta como `app_role` (NOSUPERUSER, NOBYPASSRLS). É quem sofre a RLS.
- **Migrations** conectam como o dono/admin (`DIRECT_URL`). Nunca sirva request como dono.

```
DATABASE_URL=postgresql://app_role:...@host:5432/barber   # app (RLS ativa)
DIRECT_URL=postgresql://barber_owner:...@host:5432/barber # migrate/RLS setup
```

## Fluxo por request

1. Guard de auth resolve o `tenantId` a partir do JWT.
2. Toda operação de banco roda dentro de **uma transação** cuja 1ª instrução é
   `set_config('app.current_tenant', <tenantId>, true)`.

O 3º argumento `true` = escopo de transação: o valor morre no fim da tx. Isso é
essencial num pool de conexões — senão uma conexão reciclada carregaria o tenant do
request anterior (vazamento entre tenants).

## ⚠️ Armadilha que corrigimos

O padrão “ingênuo” abaixo **não funciona e é inseguro**:

```ts
// ERRADO — set_config e a query caem em conexões diferentes do pool:
base.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
  return query(args); // <- roda no client base, NÃO na tx acima
});
```

Dentro de `$extends`, o `query(args)` executa na conexão do client estendido, não na
`tx`. O `set_config` fica numa conexão e a query real em outra → RLS sem contexto.

## ✅ Extensão correta (batch numa única transação)

```ts
// tenant-prisma.ts
import { PrismaClient, Prisma } from '@prisma/client';

const base = new PrismaClient();

/** Client cujas operações rodam com o tenant setado, na MESMA transação. */
export function forTenant(tenantId: string) {
  return base.$extends({
    query: {
      async $allOperations({ args, query }) {
        // O array-form de $transaction executa AMBAS as instruções na mesma
        // conexão/tx, então o set_config (local) vale para a query seguinte.
        const [, result] = await base.$transaction([
          base.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`,
          query(args) as Prisma.PrismaPromise<unknown>,
        ]);
        return result;
      },
    },
  });
}
```

## ✅ Caminho de performance (Service abre a tx e seta uma vez)

Para um fluxo com várias queries (ex.: fechar comanda + gerar comissão), não pague
uma transação por query. Abra a tx e use **`tx`** para tudo:

```ts
await base.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
  const sale = await tx.sale.update({ /* ... */ });      // usa tx
  await tx.commissionEntry.createMany({ /* ... */ });     // usa tx (mesmo contexto)
  return sale;
});
```

Regra de ouro: **todas as queries do request usam o mesmo handle** (`tx` ou o client
estendido do `forTenant`). Misturar handles = misturar conexões = RLS sem contexto.

## Por que RLS além do filtro na aplicação?

O filtro `where: { tenantId }` é a 1ª linha. Mas um único endpoint que esqueça o filtro
vaza dados de outra barbearia — o pior incidente possível num SaaS B2B. A RLS é a rede:
mesmo com o bug, o Postgres devolve zero linhas do tenant errado. Duas camadas =
defesa em profundidade.

## Login precisa resolver o tenant ANTES do email

`email` é único **por tenant** (`@@unique([tenantId, email])`), não global — a mesma
pessoa pode ter conta em duas barbearias. Logo o login resolve o tenant primeiro
(subdomínio/slug da barbearia) e só então busca o usuário por email dentro dele.

## Teste obrigatório (DoD)

Cada módulo precisa de um teste que:
1. cria dado no `tenant_A`;
2. seta contexto para `tenant_B`;
3. afirma que a leitura/edição do dado de A retorna vazio / falha.
