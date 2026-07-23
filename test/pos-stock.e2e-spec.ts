import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Integração PDV ↔ Estoque: vender produto na comanda baixa o estoque;
 * remover o item estorna; venda acima do estoque é bloqueada.
 */
describe('PDV + Estoque (e2e)', () => {
  let app: INestApplication;
  const s = Date.now();
  const mk = (p: string) => `/api${p}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  let token: string;
  let productId: string;
  let saleId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    const reg = await request(app.getHttpServer())
      .post(mk('/auth/register'))
      .send({ barbershopName: 'Barb PS', slug: `ps-${s}`, adminName: 'Admin Teste', email: `a-${s}@x.com`, password: 'password123' })
      .expect(201);
    token = reg.body.accessToken;

    productId = (await request(app.getHttpServer())
      .post(mk('/products')).set(auth(token))
      .send({ name: 'Pomada', priceCents: 3000, stockCurrent: 5, stockMin: 1 }).expect(201)).body.id;

    await request(app.getHttpServer())
      .post(mk('/cash-sessions/open')).set(auth(token)).send({ openingCents: 0 }).expect(201);
    saleId = (await request(app.getHttpServer())
      .post(mk('/sales')).set(auth(token)).send({}).expect(201)).body.id;
  });

  afterAll(async () => { await app.close(); });

  it('vender produto baixa o estoque', async () => {
    const sale = await request(app.getHttpServer())
      .post(mk(`/sales/${saleId}/items`)).set(auth(token))
      .send({ productId, quantity: 2 }).expect(201);
    expect(sale.body.totalCents).toBe(6000);
    expect(sale.body.items[0].productId).toBe(productId);

    const prod = await request(app.getHttpServer())
      .get(mk(`/products/${productId}`)).set(auth(token)).expect(200);
    expect(prod.body.stockCurrent).toBe(3); // 5 - 2
  });

  it('bloqueia venda acima do estoque (400)', async () => {
    await request(app.getHttpServer())
      .post(mk(`/sales/${saleId}/items`)).set(auth(token))
      .send({ productId, quantity: 10 }).expect(400);
  });

  it('remover item de produto estorna o estoque', async () => {
    const sale = await request(app.getHttpServer())
      .get(mk(`/sales/${saleId}`)).set(auth(token)).expect(200);
    const itemId = sale.body.items[0].id;
    await request(app.getHttpServer())
      .delete(mk(`/sales/${saleId}/items/${itemId}`)).set(auth(token)).expect(200);

    const prod = await request(app.getHttpServer())
      .get(mk(`/products/${productId}`)).set(auth(token)).expect(200);
    expect(prod.body.stockCurrent).toBe(5); // estornado
  });
});
