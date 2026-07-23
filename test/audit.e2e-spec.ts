import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Auditoria: ações de escrita autenticadas são registradas; leituras não;
 * isolamento por tenant.
 */
describe('Auditoria (e2e)', () => {
  let app: INestApplication;
  const s = Date.now();
  const mk = (p: string) => `/api${p}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  let tokenA: string;
  let tokenB: string;
  let clientId: string;

  async function register(slug: string, email: string) {
    const r = await request(app.getHttpServer())
      .post(mk('/auth/register'))
      .send({ barbershopName: `B ${slug}`, slug, adminName: 'Admin Teste', email, password: 'password123' })
      .expect(201);
    return r.body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    tokenA = await register(`aud-a-${s}`, `a-${s}@x.com`);
    tokenB = await register(`aud-b-${s}`, `b-${s}@x.com`);
  });

  afterAll(async () => { await app.close(); });

  it('registra criação e atualização (POST/PATCH)', async () => {
    clientId = (await request(app.getHttpServer())
      .post(mk('/clients')).set(auth(tokenA)).send({ name: 'Cliente Aud' }).expect(201)).body.id;
    await request(app.getHttpServer())
      .patch(mk(`/clients/${clientId}`)).set(auth(tokenA)).send({ phone: '11999' }).expect(200);

    const log = await request(app.getHttpServer())
      .get(mk('/audit?entity=clients')).set(auth(tokenA)).expect(200);
    const actions = log.body.map((l: any) => l.action);
    expect(actions).toContain('POST');
    expect(actions).toContain('PATCH');
    const created = log.body.find((l: any) => l.action === 'POST');
    expect(created.entityId).toBe(clientId);
    expect(created.userId).toBeTruthy();
  });

  it('NÃO registra leituras (GET)', async () => {
    await request(app.getHttpServer()).get(mk('/clients')).set(auth(tokenA)).expect(200);
    const log = await request(app.getHttpServer())
      .get(mk('/audit')).set(auth(tokenA)).expect(200);
    expect(log.body.every((l: any) => l.action !== 'GET')).toBe(true);
  });

  it('isolamento: B não vê a auditoria de A', async () => {
    const log = await request(app.getHttpServer())
      .get(mk('/audit')).set(auth(tokenB)).expect(200);
    expect(log.body).toHaveLength(0);
  });

  it('paginação opt-in: ?page retorna envelope { items, total, totalPages }', async () => {
    // sem page → array (compatível)
    const arr = await request(app.getHttpServer())
      .get(mk('/audit')).set(auth(tokenA)).expect(200);
    expect(Array.isArray(arr.body)).toBe(true);

    // com page → envelope
    const pageRes = await request(app.getHttpServer())
      .get(mk('/audit?page=1&pageSize=1')).set(auth(tokenA)).expect(200);
    expect(Array.isArray(pageRes.body.items)).toBe(true);
    expect(pageRes.body.items).toHaveLength(1);
    expect(pageRes.body.total).toBeGreaterThanOrEqual(2);
    expect(pageRes.body.totalPages).toBeGreaterThanOrEqual(2);
  });
});
