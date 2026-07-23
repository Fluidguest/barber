import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Estoque: produtos, movimentações, estoque insuficiente, inventário, alertas.
 */
describe('Estoque (e2e)', () => {
  let app: INestApplication;
  const s = Date.now();
  const mk = (p: string) => `/api${p}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  let tokenA: string;
  let tokenB: string;
  let productId: string;

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
    tokenA = await register(`stk-a-${s}`, `a-${s}@x.com`);
    tokenB = await register(`stk-b-${s}`, `b-${s}@x.com`);
  });

  afterAll(async () => { await app.close(); });

  it('cria produto com estoque inicial', async () => {
    const r = await request(app.getHttpServer())
      .post(mk('/products')).set(auth(tokenA))
      .send({ name: 'Pomada Modeladora', priceCents: 3500, costCents: 1800, stockCurrent: 10, stockMin: 3, barcode: '789000111' })
      .expect(201);
    productId = r.body.id;
    expect(r.body.stockCurrent).toBe(10);
  });

  it('entrada e saída movimentam o estoque', async () => {
    const after_in = await request(app.getHttpServer())
      .post(mk(`/products/${productId}/movements`)).set(auth(tokenA))
      .send({ type: 'IN', quantity: 5, reason: 'compra' }).expect(201);
    expect(after_in.body.stockCurrent).toBe(15);

    const after_out = await request(app.getHttpServer())
      .post(mk(`/products/${productId}/movements`)).set(auth(tokenA))
      .send({ type: 'OUT', quantity: 4, reason: 'venda' }).expect(201);
    expect(after_out.body.stockCurrent).toBe(11);
  });

  it('bloqueia saída maior que o estoque (400)', async () => {
    await request(app.getHttpServer())
      .post(mk(`/products/${productId}/movements`)).set(auth(tokenA))
      .send({ type: 'OUT', quantity: 999, reason: 'venda' }).expect(400);
  });

  it('inventário ajusta para o valor contado', async () => {
    const r = await request(app.getHttpServer())
      .post(mk(`/products/${productId}/adjust`)).set(auth(tokenA))
      .send({ targetStock: 8, notes: 'Contagem física' }).expect(201);
    expect(r.body.stockCurrent).toBe(8);
  });

  it('histórico registra as movimentações', async () => {
    const r = await request(app.getHttpServer())
      .get(mk(`/products/${productId}/movements`)).set(auth(tokenA)).expect(200);
    // inicial(IN) + IN + OUT + ajuste(OUT) = 4
    expect(r.body.length).toBe(4);
  });

  it('alerta de baixo estoque', async () => {
    // baixa até <= mínimo (3)
    await request(app.getHttpServer())
      .post(mk(`/products/${productId}/movements`)).set(auth(tokenA))
      .send({ type: 'OUT', quantity: 6, reason: 'venda' }).expect(201); // 8 -> 2
    const alerts = await request(app.getHttpServer())
      .get(mk('/products/alerts')).set(auth(tokenA)).expect(200);
    expect(alerts.body.lowStock.map((p: any) => p.id)).toContain(productId);
  });

  it('isolamento: B não vê produtos de A', async () => {
    const list = await request(app.getHttpServer())
      .get(mk('/products')).set(auth(tokenB)).expect(200);
    expect(list.body).toHaveLength(0);
    await request(app.getHttpServer())
      .get(mk(`/products/${productId}`)).set(auth(tokenB)).expect(404);
  });
});
