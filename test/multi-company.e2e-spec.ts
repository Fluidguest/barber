import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { bootstrap, authHeader } from './helpers';
import { SystemPrismaService } from '../src/prisma/system-prisma.service';

/**
 * Multiempresa (conta-dono). Foco: um dono alterna entre SUAS empresas, e
 * NINGUÉM entra em empresa de terceiro por coincidência de e-mail.
 */
describe('Multiempresa (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const s = Date.now();
  const mk = (p: string) => `/api${p}`;

  let ownerToken: string; // dono da rede
  const ownerEmail = `dono-${s}@x.com`;

  async function register(slug: string, email: string) {
    const r = await request(app.getHttpServer())
      .post(mk('/auth/register'))
      .send({
        barbershopName: `Barbearia ${slug}`,
        slug,
        adminName: 'Dono',
        email,
        password: 'password123',
      })
      .expect(201);
    return r.body.accessToken as string;
  }

  beforeAll(async () => {
    app = await bootstrap();
    system = app.get(SystemPrismaService);
    ownerToken = await register(`mc-a-${s}`, ownerEmail);
  });
  afterAll(async () => { await app.close(); });

  it('lista só a própria empresa inicialmente', async () => {
    const r = await request(app.getHttpServer())
      .get(mk('/auth/companies')).set(authHeader(ownerToken)).expect(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0].current).toBe(true);
  });

  it('cria uma segunda empresa vinculada à conta-dono', async () => {
    await request(app.getHttpServer())
      .post(mk('/auth/companies')).set(authHeader(ownerToken))
      .send({ barbershopName: 'Filial 2', slug: `mc-b-${s}` }).expect(201);

    const r = await request(app.getHttpServer())
      .get(mk('/auth/companies')).set(authHeader(ownerToken)).expect(200);
    expect(r.body).toHaveLength(2);
  });

  it('alterna para a segunda empresa e o token novo opera nela', async () => {
    const companies = (await request(app.getHttpServer())
      .get(mk('/auth/companies')).set(authHeader(ownerToken)).expect(200)).body;
    const filial = companies.find((c: any) => !c.current);

    const sw = await request(app.getHttpServer())
      .post(mk('/auth/switch-company')).set(authHeader(ownerToken))
      .send({ tenantId: filial.id }).expect(201);
    expect(sw.body.tenantId).toBe(filial.id);

    // o novo token vê a empresa nova (que não tem clientes → lista vazia)
    const clientes = await request(app.getHttpServer())
      .get(mk('/clients')).set(authHeader(sw.body.accessToken)).expect(200);
    expect(clientes.body).toHaveLength(0);

    // e agora "current" é a filial
    const after = (await request(app.getHttpServer())
      .get(mk('/auth/companies')).set(authHeader(sw.body.accessToken)).expect(200)).body;
    expect(after.find((c: any) => c.current).id).toBe(filial.id);
  });

  it('SEGURANÇA: coincidência de e-mail NÃO dá acesso à empresa de terceiro', async () => {
    // Um atacante se auto-registra usando o MESMO e-mail do dono.
    const attackerToken = await register(`mc-atk-${s}`, ownerEmail);

    // As empresas do dono NÃO aparecem para o atacante (ownerAccountId diferente).
    const list = (await request(app.getHttpServer())
      .get(mk('/auth/companies')).set(authHeader(attackerToken)).expect(200)).body;
    expect(list).toHaveLength(1); // só a do próprio atacante

    // E tentar pular direto para uma empresa do dono é negado.
    const ownerCompanies = (await request(app.getHttpServer())
      .get(mk('/auth/companies')).set(authHeader(ownerToken)).expect(200)).body;
    for (const c of ownerCompanies) {
      await request(app.getHttpServer())
        .post(mk('/auth/switch-company')).set(authHeader(attackerToken))
        .send({ tenantId: c.id }).expect(401);
    }
  });

  it('renomeia uma empresa da conta-dono', async () => {
    const companies = (await request(app.getHttpServer())
      .get(mk('/auth/companies')).set(authHeader(ownerToken)).expect(200)).body;
    const alvo = companies[0];
    const r = await request(app.getHttpServer())
      .patch(mk(`/auth/companies/${alvo.id}`)).set(authHeader(ownerToken))
      .send({ name: 'Nome Novo' }).expect(200);
    expect(r.body.name).toBe('Nome Novo');
  });

  // ---- Operador da plataforma entra em qualquer empresa ----
  it('operador entra numa empresa e recebe token de acesso a ela', async () => {
    const adminEmail = `op-mc-${s}@plat.com`;
    await system.platformAdmin.create({
      data: { email: adminEmail, name: 'Op', passwordHash: await argon2.hash('SenhaOperador123') },
    });
    const pToken = (await request(app.getHttpServer())
      .post(mk('/platform/auth/login'))
      .send({ email: adminEmail, password: 'SenhaOperador123' }).expect(201)).body.accessToken;

    const tenant = (await request(app.getHttpServer())
      .get(mk(`/platform/tenants?search=mc-a-${s}`)).set(authHeader(pToken)).expect(200)).body[0];

    const entered = await request(app.getHttpServer())
      .post(mk(`/platform/tenants/${tenant.id}/enter`)).set(authHeader(pToken)).expect(201);
    expect(entered.body.accessToken).toBeTruthy();
    const opToken = entered.body.accessToken;

    // LEITURA: o operador consegue inspecionar a barbearia
    await request(app.getHttpServer())
      .get(mk('/clients')).set(authHeader(opToken)).expect(200);

    // ESCRITA: a sessão de suporte é somente leitura → 403
    await request(app.getHttpServer())
      .post(mk('/clients')).set(authHeader(opToken))
      .send({ name: 'Não deveria criar', phone: '11900000000' })
      .expect(403);
    await request(app.getHttpServer())
      .post(mk('/services')).set(authHeader(opToken))
      .send({ name: 'X', durationMin: 30, priceCents: 1000 })
      .expect(403);

    await system.platformAdmin.deleteMany({ where: { email: adminEmail } });
  });
});
