import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Dashboard: indicadores do dia agregando agenda, caixa e comissão + isolamento.
 */
describe('Dashboard (e2e)', () => {
  let app: INestApplication;
  const s = Date.now();
  const mk = (p: string) => `/api${p}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  let tokenA: string;
  let tokenB: string;
  let clientId: string;
  let serviceId: string;
  let barberId: string;

  // Data local de "hoje" no fuso da unidade.
  const todayLocal = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

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

    tokenA = await register(`dash-a-${s}`, `a-${s}@x.com`);
    tokenB = await register(`dash-b-${s}`, `b-${s}@x.com`);

    clientId = (await request(app.getHttpServer())
      .post(mk('/clients')).set(auth(tokenA)).send({ name: 'Cliente Dash' }).expect(201)).body.id;
    serviceId = (await request(app.getHttpServer())
      .post(mk('/services')).set(auth(tokenA))
      .send({ name: 'Corte', durationMin: 30, priceCents: 5000 }).expect(201)).body.id;
    barberId = (await request(app.getHttpServer())
      .post(mk('/barbers')).set(auth(tokenA)).send({ name: 'Barbeiro Dash', document: "111.444.777-35", birthDate: "1990-01-15", address: { zip: "01001-000", street: "Rua", number: "1", neighborhood: "Centro", city: "Sao Paulo", state: "SP" } }).expect(201)).body.id;

    // Regra de comissão 40%.
    await request(app.getHttpServer())
      .post(mk('/commission-rules')).set(auth(tokenA))
      .send({ barberId, type: 'PERCENT', value: 4000 }).expect(201);

    // Caixa + comanda paga hoje (faturamento + comissão).
    await request(app.getHttpServer())
      .post(mk('/cash-sessions/open')).set(auth(tokenA)).send({ openingCents: 0 }).expect(201);
    const saleId = (await request(app.getHttpServer())
      .post(mk('/sales')).set(auth(tokenA)).send({ clientId, barberId }).expect(201)).body.id;
    await request(app.getHttpServer())
      .post(mk(`/sales/${saleId}/items`)).set(auth(tokenA)).send({ serviceId, barberId }).expect(201);
    await request(app.getHttpServer())
      .post(mk(`/sales/${saleId}/payments`)).set(auth(tokenA)).send({ method: 'PIX', amountCents: 5000 }).expect(201);
    await request(app.getHttpServer())
      .post(mk(`/sales/${saleId}/close`)).set(auth(tokenA)).expect(201);

    // Um agendamento para hoje (13:00Z = 10:00 local).
    await request(app.getHttpServer())
      .post(mk('/appointments')).set(auth(tokenA))
      .send({ clientId, barberId, serviceId, startAt: `${todayLocal}T13:00:00.000Z` }).expect(201);
  });

  afterAll(async () => { await app.close(); });

  it('agrega os indicadores do dia', async () => {
    const r = await request(app.getHttpServer())
      .get(mk('/dashboard/today')).set(auth(tokenA)).expect(200);
    expect(r.body.revenueCents).toBe(5000);
    expect(r.body.paidSales).toBe(1);
    expect(r.body.averageTicketCents).toBe(5000);
    expect(r.body.commissionsGeneratedCents).toBe(2000);
    expect(r.body.activeBarbers).toBe(1);
    expect(r.body.newClients).toBeGreaterThanOrEqual(1);
    expect(r.body.appointments.total).toBeGreaterThanOrEqual(1);
    expect(r.body.cashOpen).not.toBeNull();
    expect(Array.isArray(r.body.agenda)).toBe(true);
  });

  it('isolamento: dashboard de B está zerado', async () => {
    const r = await request(app.getHttpServer())
      .get(mk('/dashboard/today')).set(auth(tokenB)).expect(200);
    expect(r.body.revenueCents).toBe(0);
    expect(r.body.paidSales).toBe(0);
    expect(r.body.commissionsGeneratedCents).toBe(0);
    expect(r.body.appointments.total).toBe(0);
    expect(r.body.cashOpen).toBeNull();
  });
});
