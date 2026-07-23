import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Billing da plataforma: planos, assinatura/trial, webhook (aprovado/falhou/
 * suspender), bloqueio por inadimplência e isolamento.
 */
describe('Billing da plataforma (e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  const s = Date.now();
  const mk = (p: string) => `/api${p}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  let tokenA: string;
  let tokenB: string;
  let planId: string;
  let externalId: string;

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

    // Plano é catálogo da plataforma — inserido via conexão de dono (como o seed).
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    const plan = await owner.plan.create({
      data: { name: `Test ${s}`, slug: `test-${s}`, priceCents: 4900, interval: 'MONTHLY', maxUsers: 5, maxUnits: 1 },
    });
    planId = plan.id;

    tokenA = await register(`bill-a-${s}`, `a-${s}@x.com`);
    tokenB = await register(`bill-b-${s}`, `b-${s}@x.com`);
  });

  afterAll(async () => {
    await owner.$disconnect();
    await app.close();
  });

  it('lista planos e começa sem assinatura', async () => {
    const plans = await request(app.getHttpServer())
      .get(mk('/billing/plans')).set(auth(tokenA)).expect(200);
    expect(plans.body.map((p: any) => p.id)).toContain(planId);

    const sub = await request(app.getHttpServer())
      .get(mk('/billing/subscription')).set(auth(tokenA)).expect(200);
    expect(sub.body.status).toBeUndefined();
  });

  it('assina (trial) e cria fatura pendente', async () => {
    const r = await request(app.getHttpServer())
      .post(mk('/billing/subscribe')).set(auth(tokenA)).send({ planId }).expect(201);
    expect(r.body.status).toBe('TRIALING');
    expect(r.body.externalId).toMatch(/^mp_fake_/);
    externalId = r.body.externalId;
  });

  it('webhook aprovado -> ACTIVE', async () => {
    const r = await request(app.getHttpServer())
      .post(mk('/billing/webhook')).send({ externalId, event: 'approved' }).expect(201);
    expect(r.body.status).toBe('ACTIVE');
    // acesso normal continua liberado
    await request(app.getHttpServer()).get(mk('/clients')).set(auth(tokenA)).expect(200);
  });

  it('suspender bloqueia o acesso (402), mas billing/login seguem', async () => {
    const r = await request(app.getHttpServer())
      .post(mk('/billing/webhook')).send({ externalId, event: 'suspend' }).expect(201);
    expect(r.body.status).toBe('SUSPENDED');

    await request(app.getHttpServer()).get(mk('/clients')).set(auth(tokenA)).expect(402);
    // rotas @AllowSuspended continuam acessíveis:
    await request(app.getHttpServer()).get(mk('/billing/subscription')).set(auth(tokenA)).expect(200);
    await request(app.getHttpServer()).get(mk('/auth/me')).set(auth(tokenA)).expect(200);
  });

  it('novo pagamento reativa o acesso', async () => {
    await request(app.getHttpServer())
      .post(mk('/billing/webhook')).send({ externalId, event: 'approved' }).expect(201);
    await request(app.getHttpServer()).get(mk('/clients')).set(auth(tokenA)).expect(200);
  });

  it('cancelar bloqueia o acesso', async () => {
    const r = await request(app.getHttpServer())
      .post(mk('/billing/cancel')).set(auth(tokenA)).expect(201);
    expect(r.body.status).toBe('CANCELED');
    await request(app.getHttpServer()).get(mk('/clients')).set(auth(tokenA)).expect(402);
  });

  it('isolamento: B não é afetado pelo billing de A', async () => {
    const sub = await request(app.getHttpServer())
      .get(mk('/billing/subscription')).set(auth(tokenB)).expect(200);
    expect(sub.body.status).toBeUndefined();
    // B (ativo) acessa normalmente
    await request(app.getHttpServer()).get(mk('/clients')).set(auth(tokenB)).expect(200);
  });
});
