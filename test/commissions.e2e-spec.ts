import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Comissões: geração automática no fechamento da comanda, regra específica vs.
 * padrão, resumo, fechamento de período e isolamento.
 */
describe('Comissões (e2e)', () => {
  let app: INestApplication;
  const s = Date.now();
  const mk = (p: string) => `/api${p}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  let tokenA: string;
  let tokenB: string;
  let clientId: string;
  let serviceId: string;
  let barber1: string;
  let barber2: string;

  // "YYYY-MM" no mesmo fuso usado pelo serviço.
  const periodRef = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .slice(0, 7);

  async function register(slug: string, email: string) {
    const r = await request(app.getHttpServer())
      .post(mk('/auth/register'))
      .send({ barbershopName: `B ${slug}`, slug, adminName: 'Admin Teste', email, password: 'password123' })
      .expect(201);
    return r.body.accessToken as string;
  }

  async function paidSale(token: string, barberId: string) {
    const saleId = (await request(app.getHttpServer())
      .post(mk('/sales')).set(auth(token)).send({ clientId, barberId }).expect(201)).body.id;
    await request(app.getHttpServer())
      .post(mk(`/sales/${saleId}/items`)).set(auth(token)).send({ serviceId, barberId }).expect(201);
    await request(app.getHttpServer())
      .post(mk(`/sales/${saleId}/payments`)).set(auth(token)).send({ method: 'PIX', amountCents: 5000 }).expect(201);
    await request(app.getHttpServer())
      .post(mk(`/sales/${saleId}/close`)).set(auth(token)).expect(201);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    tokenA = await register(`com-a-${s}`, `a-${s}@x.com`);
    tokenB = await register(`com-b-${s}`, `b-${s}@x.com`);

    clientId = (await request(app.getHttpServer())
      .post(mk('/clients')).set(auth(tokenA)).send({ name: 'Cliente Com' }).expect(201)).body.id;
    serviceId = (await request(app.getHttpServer())
      .post(mk('/services')).set(auth(tokenA))
      .send({ name: 'Corte', durationMin: 30, priceCents: 5000 }).expect(201)).body.id;
    barber1 = (await request(app.getHttpServer())
      .post(mk('/barbers')).set(auth(tokenA)).send({ name: 'Barbeiro 1' }).expect(201)).body.id;
    barber2 = (await request(app.getHttpServer())
      .post(mk('/barbers')).set(auth(tokenA)).send({ name: 'Barbeiro 2' }).expect(201)).body.id;

    await request(app.getHttpServer())
      .post(mk('/cash-sessions/open')).set(auth(tokenA)).send({ openingCents: 0 }).expect(201);
  });

  afterAll(async () => { await app.close(); });

  it('regra específica: barbeiro 1 recebe 40% (2000 de 5000)', async () => {
    await request(app.getHttpServer())
      .post(mk('/commission-rules')).set(auth(tokenA))
      .send({ barberId: barber1, type: 'PERCENT', value: 4000 }).expect(201);

    await paidSale(tokenA, barber1);

    const list = await request(app.getHttpServer())
      .get(mk(`/commissions?barberId=${barber1}`)).set(auth(tokenA)).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].baseCents).toBe(5000);
    expect(list.body[0].amountCents).toBe(2000);
    expect(list.body[0].status).toBe('PENDING');
  });

  it('regra padrão: barbeiro 2 (sem regra própria) recebe 50%', async () => {
    await request(app.getHttpServer())
      .post(mk('/commission-rules')).set(auth(tokenA))
      .send({ type: 'PERCENT', value: 5000 }).expect(201); // sem barberId => padrão

    await paidSale(tokenA, barber2);

    const list = await request(app.getHttpServer())
      .get(mk(`/commissions?barberId=${barber2}`)).set(auth(tokenA)).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].amountCents).toBe(2500);
  });

  it('rejeita percentual acima de 100% (400)', async () => {
    await request(app.getHttpServer())
      .post(mk('/commission-rules')).set(auth(tokenA))
      .send({ type: 'PERCENT', value: 12000 }).expect(400);
  });

  it('resumo do período agrega por barbeiro', async () => {
    const sum = await request(app.getHttpServer())
      .get(mk(`/commissions/summary?periodRef=${periodRef}`)).set(auth(tokenA)).expect(200);
    const total = sum.body.reduce((a: number, g: any) => a + g.amountCents, 0);
    expect(total).toBe(4500); // 2000 + 2500
  });

  it('fecha o período (PENDING -> CLOSED)', async () => {
    const res = await request(app.getHttpServer())
      .post(mk('/commissions/close')).set(auth(tokenA)).send({ periodRef }).expect(201);
    expect(res.body.closed).toBe(2);
    const closed = await request(app.getHttpServer())
      .get(mk(`/commissions?status=CLOSED`)).set(auth(tokenA)).expect(200);
    expect(closed.body.length).toBe(2);
  });

  it('isolamento: B não vê comissões de A', async () => {
    const list = await request(app.getHttpServer())
      .get(mk('/commissions')).set(auth(tokenB)).expect(200);
    expect(list.body).toHaveLength(0);
  });
});
