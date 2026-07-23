import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { bootstrap, registerTenant, authHeader } from './helpers';
import { SystemPrismaService } from '../src/prisma/system-prisma.service';

/**
 * Painel do operador da plataforma. O foco dos testes é a FRONTEIRA: token de
 * barbearia não entra no painel, e token de plataforma não acessa dados de
 * barbearia.
 */
describe('Painel da plataforma (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const s = Date.now();
  const mk = (p: string) => `/api${p}`;

  const adminEmail = `operador-${s}@plataforma.com`;
  const adminSenha = 'SenhaDoOperador123';

  let platformToken: string;
  let tenantToken: string;
  let tenantId: string;

  beforeAll(async () => {
    app = await bootstrap();
    system = app.get(SystemPrismaService);

    await system.platformAdmin.create({
      data: {
        email: adminEmail,
        name: 'Operador Teste',
        passwordHash: await argon2.hash(adminSenha),
      },
    });

    tenantToken = await registerTenant(app, `plat-${s}`, `plat-${s}@x.com`);
    const me = await request(app.getHttpServer())
      .get(mk('/auth/me')).set(authHeader(tenantToken)).expect(200);
    tenantId = me.body.tenantId;
  });

  afterAll(async () => {
    await system.platformAdmin.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('login do operador devolve token', async () => {
    const r = await request(app.getHttpServer())
      .post(mk('/platform/auth/login'))
      .send({ email: adminEmail, password: adminSenha })
      .expect(201);
    expect(r.body.accessToken).toBeTruthy();
    expect(r.body.name).toBe('Operador Teste');
    platformToken = r.body.accessToken;
  });

  it('senha errada → 401', async () => {
    await request(app.getHttpServer())
      .post(mk('/platform/auth/login'))
      .send({ email: adminEmail, password: 'errada' })
      .expect(401);
  });

  it('e-mail inexistente → 401 (não revela se existe)', async () => {
    await request(app.getHttpServer())
      .post(mk('/platform/auth/login'))
      .send({ email: `nao-existe-${s}@x.com`, password: adminSenha })
      .expect(401);
  });

  // ---- FRONTEIRA DE IDENTIDADE (o ponto crítico) ----

  it('token de BARBEARIA não entra no painel da plataforma', async () => {
    await request(app.getHttpServer())
      .get(mk('/platform/tenants')).set(authHeader(tenantToken)).expect(401);
    await request(app.getHttpServer())
      .get(mk('/platform/stats')).set(authHeader(tenantToken)).expect(401);
    await request(app.getHttpServer())
      .post(mk(`/platform/tenants/${tenantId}/suspend`))
      .set(authHeader(tenantToken)).expect(401);
  });

  it('token de PLATAFORMA não acessa dados de barbearia', async () => {
    await request(app.getHttpServer())
      .get(mk('/clients')).set(authHeader(platformToken)).expect(401);
    await request(app.getHttpServer())
      .get(mk('/finance/entries')).set(authHeader(platformToken)).expect(401);
  });

  it('sem token → 401', async () => {
    await request(app.getHttpServer()).get(mk('/platform/tenants')).expect(401);
  });

  // ---- Funcionalidade ----

  it('lista barbearias e mostra estatísticas', async () => {
    const stats = await request(app.getHttpServer())
      .get(mk('/platform/stats')).set(authHeader(platformToken)).expect(200);
    expect(stats.body.total).toBeGreaterThan(0);

    const lista = await request(app.getHttpServer())
      .get(mk(`/platform/tenants?search=plat-${s}`))
      .set(authHeader(platformToken)).expect(200);
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0].slug).toBe(`plat-${s}`);
    expect(lista.body[0].users).toBe(1);
  });

  it('detalhe traz volumes agregados, não conteúdo do cliente', async () => {
    const r = await request(app.getHttpServer())
      .get(mk(`/platform/tenants/${tenantId}`))
      .set(authHeader(platformToken)).expect(200);

    expect(r.body.volumes).toBeDefined();
    expect(typeof r.body.volumes.clients).toBe('number');
    // não expõe a lista de clientes nem nada de negócio
    expect(r.body.clients).toBeUndefined();
    expect(JSON.stringify(r.body)).not.toContain('cpf');
  });

  it('suspende e reativa uma barbearia', async () => {
    // barbearia funcionando
    await request(app.getHttpServer())
      .get(mk('/clients')).set(authHeader(tenantToken)).expect(200);

    await request(app.getHttpServer())
      .post(mk(`/platform/tenants/${tenantId}/suspend`))
      .set(authHeader(platformToken)).expect(201);

    // suspensa → 402 na API da barbearia
    await request(app.getHttpServer())
      .get(mk('/clients')).set(authHeader(tenantToken)).expect(402);

    await request(app.getHttpServer())
      .post(mk(`/platform/tenants/${tenantId}/reactivate`))
      .set(authHeader(platformToken)).expect(201);

    await request(app.getHttpServer())
      .get(mk('/clients')).set(authHeader(tenantToken)).expect(200);
  });

  it('operador desativado perde acesso imediatamente', async () => {
    await system.platformAdmin.updateMany({
      where: { email: adminEmail },
      data: { isActive: false },
    });
    // token ainda é válido criptograficamente, mas o guard reconfere no banco
    await request(app.getHttpServer())
      .get(mk('/platform/tenants')).set(authHeader(platformToken)).expect(401);

    await system.platformAdmin.updateMany({
      where: { email: adminEmail },
      data: { isActive: true },
    });
  });

  it('barbearia inexistente → 404', async () => {
    await request(app.getHttpServer())
      .get(mk('/platform/tenants/nao-existe'))
      .set(authHeader(platformToken)).expect(404);
  });
});
