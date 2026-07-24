import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Comanda + Caixa: abertura/fechamento de caixa, itens, pagamentos, conclusão
 * de venda, integração com a agenda e isolamento de tenant.
 */
describe('Comanda + Caixa (e2e)', () => {
  let app: INestApplication;
  const s = Date.now();
  const mk = (p: string) => `/api${p}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  let tokenA: string;
  let tokenB: string;
  let clientId: string;
  let barberId: string;
  let serviceId: string;
  let sessionId: string;
  let saleId: string;

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

    tokenA = await register(`pos-a-${s}`, `a-${s}@x.com`);
    tokenB = await register(`pos-b-${s}`, `b-${s}@x.com`);

    clientId = (await request(app.getHttpServer())
      .post(mk('/clients')).set(auth(tokenA)).send({ name: 'Cliente POS' }).expect(201)).body.id;
    serviceId = (await request(app.getHttpServer())
      .post(mk('/services')).set(auth(tokenA))
      .send({ name: 'Corte', durationMin: 30, priceCents: 5000 }).expect(201)).body.id;
    barberId = (await request(app.getHttpServer())
      .post(mk('/barbers')).set(auth(tokenA))
      .send({ name: 'Barbeiro POS', document: "111.444.777-35", birthDate: "1990-01-15", address: { zip: "01001-000", street: "Rua", number: "1", neighborhood: "Centro", city: "Sao Paulo", state: "SP" } }).expect(201)).body.id;
  });

  afterAll(async () => { await app.close(); });

  it('não deixa abrir comanda sem caixa aberto (409)', async () => {
    await request(app.getHttpServer())
      .post(mk('/sales')).set(auth(tokenA)).send({ clientId }).expect(409);
  });

  it('abre o caixa e recusa segunda abertura (409)', async () => {
    const r = await request(app.getHttpServer())
      .post(mk('/cash-sessions/open')).set(auth(tokenA))
      .send({ openingCents: 10000 }).expect(201);
    sessionId = r.body.id;
    expect(r.body.status).toBe('OPEN');
    await request(app.getHttpServer())
      .post(mk('/cash-sessions/open')).set(auth(tokenA))
      .send({ openingCents: 0 }).expect(409);
  });

  it('cria comanda e soma itens (serviço + avulso)', async () => {
    saleId = (await request(app.getHttpServer())
      .post(mk('/sales')).set(auth(tokenA)).send({ clientId, barberId }).expect(201)).body.id;

    const afterService = await request(app.getHttpServer())
      .post(mk(`/sales/${saleId}/items`)).set(auth(tokenA))
      .send({ serviceId, barberId }).expect(201);
    expect(afterService.body.totalCents).toBe(5000);
    expect(afterService.body.items[0].description).toBe('Corte');

    const afterAvulso = await request(app.getHttpServer())
      .post(mk(`/sales/${saleId}/items`)).set(auth(tokenA))
      .send({ description: 'Pomada', unitPriceCents: 3000, quantity: 2 }).expect(201);
    expect(afterAvulso.body.totalCents).toBe(11000);
  });

  it('rejeita item avulso sem preço (400)', async () => {
    await request(app.getHttpServer())
      .post(mk(`/sales/${saleId}/items`)).set(auth(tokenA))
      .send({ description: 'Sem preço' }).expect(400);
  });

  it('não fecha comanda com pagamento insuficiente (400)', async () => {
    await request(app.getHttpServer())
      .post(mk(`/sales/${saleId}/payments`)).set(auth(tokenA))
      .send({ method: 'CASH', amountCents: 5000 }).expect(201);
    await request(app.getHttpServer())
      .post(mk(`/sales/${saleId}/close`)).set(auth(tokenA)).expect(400);
  });

  it('completa o pagamento e fecha a comanda', async () => {
    await request(app.getHttpServer())
      .post(mk(`/sales/${saleId}/payments`)).set(auth(tokenA))
      .send({ method: 'CASH', amountCents: 6000 }).expect(201);
    const closed = await request(app.getHttpServer())
      .post(mk(`/sales/${saleId}/close`)).set(auth(tokenA)).expect(201);
    expect(closed.body.status).toBe('PAID');
  });

  it('fechar comanda vinda da agenda conclui o atendimento', async () => {
    const apt = (await request(app.getHttpServer())
      .post(mk('/appointments')).set(auth(tokenA))
      .send({ clientId, barberId, serviceId, startAt: '2026-07-20T13:00:00.000Z' }).expect(201)).body;
    const sale2 = (await request(app.getHttpServer())
      .post(mk('/sales')).set(auth(tokenA)).send({ clientId, barberId, appointmentId: apt.id }).expect(201)).body;
    await request(app.getHttpServer())
      .post(mk(`/sales/${sale2.id}/items`)).set(auth(tokenA)).send({ serviceId }).expect(201);
    await request(app.getHttpServer())
      .post(mk(`/sales/${sale2.id}/payments`)).set(auth(tokenA)).send({ method: 'PIX', amountCents: 5000 }).expect(201);
    await request(app.getHttpServer())
      .post(mk(`/sales/${sale2.id}/close`)).set(auth(tokenA)).expect(201);
    const got = await request(app.getHttpServer())
      .get(mk(`/appointments/${apt.id}`)).set(auth(tokenA)).expect(200);
    expect(got.body.status).toBe('DONE');
  });

  it('fecha o caixa com resumo conferido', async () => {
    const closed = await request(app.getHttpServer())
      .patch(mk(`/cash-sessions/${sessionId}/close`)).set(auth(tokenA))
      .send({ closingCents: 21000 }).expect(200);
    // fundo 10000 + CASH 11000 = 21000 esperado
    expect(closed.body.expectedCashCents).toBe(21000);
    expect(closed.body.cashDifferenceCents).toBe(0);
    // total pago inclui a comanda via PIX (5000) da agenda
    expect(closed.body.totalPaidCents).toBe(16000);
  });

  it('isolamento: B não acessa comanda de A', async () => {
    await request(app.getHttpServer())
      .get(mk(`/sales/${saleId}`)).set(auth(tokenB)).expect(404);
  });
});
