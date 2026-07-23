import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bootstrap, registerTenant, authHeader } from './helpers';

/**
 * Pagamento no PDV: cobrança PIX, aprovação (webhook/simulada) virando
 * `Payment` da comanda, idempotência e isolamento entre barbearias.
 */
describe('Pagamento no PDV (e2e)', () => {
  let app: INestApplication;
  const s = Date.now();
  const mk = (p: string) => `/api${p}`;

  let tokenA: string;
  let tokenB: string;
  let saleId: string;
  let chargeId: string;
  const PRECO = 5000;

  beforeAll(async () => {
    app = await bootstrap();
    tokenA = await registerTenant(app, `pay-a-${s}`, `pay-a-${s}@x.com`);
    tokenB = await registerTenant(app, `pay-b-${s}`, `pay-b-${s}@x.com`);

    // Caixa aberto + comanda com um serviço de R$ 50
    await request(app.getHttpServer())
      .post(mk('/cash-sessions/open')).set(authHeader(tokenA))
      .send({ openingCents: 0 }).expect(201);

    const svc = await request(app.getHttpServer())
      .post(mk('/services')).set(authHeader(tokenA))
      .send({ name: 'Corte', durationMin: 30, priceCents: PRECO }).expect(201);

    const sale = await request(app.getHttpServer())
      .post(mk('/sales')).set(authHeader(tokenA)).send({}).expect(201);
    saleId = sale.body.id;

    await request(app.getHttpServer())
      .post(mk(`/sales/${saleId}/items`)).set(authHeader(tokenA))
      .send({ serviceId: svc.body.id, quantity: 1 }).expect(201);
  });

  afterAll(async () => { await app.close(); });

  it('gera cobrança PIX com QR code pelo saldo da comanda', async () => {
    const r = await request(app.getHttpServer())
      .post(mk(`/sales/${saleId}/charges`)).set(authHeader(tokenA))
      .send({}).expect(201);

    expect(r.body.status).toBe('PENDING');
    expect(r.body.amountCents).toBe(PRECO); // saldo restante
    expect(r.body.method).toBe('PIX');
    expect(r.body.qrCode).toBeTruthy();
    expect(r.body.expiresAt).toBeTruthy();
    chargeId = r.body.id;
  });

  it('recusa cobrança acima do saldo', async () => {
    await request(app.getHttpServer())
      .post(mk(`/sales/${saleId}/charges`)).set(authHeader(tokenA))
      .send({ amountCents: PRECO * 10 }).expect(400);
  });

  it('consulta a cobrança (polling do PDV)', async () => {
    const r = await request(app.getHttpServer())
      .get(mk(`/sales/${saleId}/charges/${chargeId}`)).set(authHeader(tokenA))
      .expect(200);
    expect(r.body.status).toBe('PENDING');
  });

  it('isolamento: B não vê nem aprova cobrança de A', async () => {
    await request(app.getHttpServer())
      .get(mk(`/sales/${saleId}/charges/${chargeId}`)).set(authHeader(tokenB))
      .expect(404);
    await request(app.getHttpServer())
      .post(mk(`/sales/${saleId}/charges/${chargeId}/simulate-approval`))
      .set(authHeader(tokenB)).expect(404);
  });

  it('aprovação vira Payment da comanda', async () => {
    const aprovada = await request(app.getHttpServer())
      .post(mk(`/sales/${saleId}/charges/${chargeId}/simulate-approval`))
      .set(authHeader(tokenA)).expect(201);
    expect(aprovada.body.status).toBe('APPROVED');
    expect(aprovada.body.paidAt).toBeTruthy();

    // O pagamento entrou na comanda
    const sale = await request(app.getHttpServer())
      .get(mk(`/sales/${saleId}`)).set(authHeader(tokenA)).expect(200);
    const total = sale.body.payments.reduce(
      (acc: number, p: any) => acc + p.amountCents, 0);
    expect(total).toBe(PRECO);
    expect(sale.body.payments[0].method).toBe('PIX');
  });

  it('não duplica pagamento ao reprocessar (idempotência)', async () => {
    // cobrança já aprovada não pode ser aprovada de novo
    await request(app.getHttpServer())
      .post(mk(`/sales/${saleId}/charges/${chargeId}/simulate-approval`))
      .set(authHeader(tokenA)).expect(400);

    const sale = await request(app.getHttpServer())
      .get(mk(`/sales/${saleId}`)).set(authHeader(tokenA)).expect(200);
    expect(sale.body.payments).toHaveLength(1); // continua um só
  });

  it('comanda paga fecha normalmente', async () => {
    const fechada = await request(app.getHttpServer())
      .post(mk(`/sales/${saleId}/close`)).set(authHeader(tokenA)).expect(201);
    expect(fechada.body.status).toBe('PAID');
  });

  it('não cria cobrança em comanda fechada', async () => {
    await request(app.getHttpServer())
      .post(mk(`/sales/${saleId}/charges`)).set(authHeader(tokenA))
      .send({}).expect(400);
  });

  it('webhook desconhecido não quebra (200)', async () => {
    await request(app.getHttpServer())
      .post(mk('/payments/webhook'))
      .send({ type: 'payment', data: { id: 'nao-existe-999' } })
      .expect(200);
  });
});
