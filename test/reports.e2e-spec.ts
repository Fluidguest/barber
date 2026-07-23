import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Relatórios/BI: DRE, ranking de barbeiros, curva ABC de produtos.
 */
describe('Relatórios (e2e)', () => {
  let app: INestApplication;
  const s = Date.now();
  const mk = (p: string) => `/api${p}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  let token: string;
  let barberId: string;
  let productId: string;

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
      .send({ barbershopName: 'Barb Rep', slug: `rep-${s}`, adminName: 'Admin Teste', email: `a-${s}@x.com`, password: 'password123' })
      .expect(201);
    token = reg.body.accessToken;

    const svc = (await request(app.getHttpServer())
      .post(mk('/services')).set(auth(token)).send({ name: 'Corte', durationMin: 30, priceCents: 5000 }).expect(201)).body;
    barberId = (await request(app.getHttpServer())
      .post(mk('/barbers')).set(auth(token)).send({ name: 'João' }).expect(201)).body.id;
    await request(app.getHttpServer())
      .post(mk('/commission-rules')).set(auth(token)).send({ barberId, type: 'PERCENT', value: 4000 }).expect(201);
    productId = (await request(app.getHttpServer())
      .post(mk('/products')).set(auth(token)).send({ name: 'Pomada', priceCents: 3000, stockCurrent: 10 }).expect(201)).body.id;
    const cli = (await request(app.getHttpServer())
      .post(mk('/clients')).set(auth(token)).send({ name: 'Cliente' }).expect(201)).body;

    // Uma venda paga: serviço (barbeiro) + produto.
    await request(app.getHttpServer()).post(mk('/cash-sessions/open')).set(auth(token)).send({ openingCents: 0 }).expect(201);
    const sale = (await request(app.getHttpServer())
      .post(mk('/sales')).set(auth(token)).send({ clientId: cli.id, barberId }).expect(201)).body;
    await request(app.getHttpServer()).post(mk(`/sales/${sale.id}/items`)).set(auth(token)).send({ serviceId: svc.id, barberId }).expect(201);
    await request(app.getHttpServer()).post(mk(`/sales/${sale.id}/items`)).set(auth(token)).send({ productId }).expect(201);
    await request(app.getHttpServer()).post(mk(`/sales/${sale.id}/payments`)).set(auth(token)).send({ method: 'CASH', amountCents: 8000 }).expect(201);
    await request(app.getHttpServer()).post(mk(`/sales/${sale.id}/close`)).set(auth(token)).expect(201);

    // Uma despesa paga.
    const cat = (await request(app.getHttpServer())
      .post(mk('/finance/categories')).set(auth(token)).send({ name: 'Aluguel', kind: 'EXPENSE' }).expect(201)).body;
    const entry = (await request(app.getHttpServer())
      .post(mk('/finance/entries')).set(auth(token)).send({ type: 'PAYABLE', description: 'Aluguel', amountCents: 200000, dueDate: new Date().toISOString(), categoryId: cat.id }).expect(201)).body;
    await request(app.getHttpServer()).post(mk(`/finance/entries/${entry.id}/pay`)).set(auth(token)).send({ method: 'PIX' }).expect(201);
  });

  afterAll(async () => { await app.close(); });

  it('DRE agrega receita (PDV) e despesa', async () => {
    const r = await request(app.getHttpServer()).get(mk('/reports/dre')).set(auth(token)).expect(200);
    expect(r.body.totalIncomeCents).toBe(8000); // venda de 80,00
    expect(r.body.totalExpenseCents).toBe(200000); // aluguel
    expect(r.body.resultCents).toBe(8000 - 200000);
  });

  it('ranking de barbeiros mostra faturamento e comissão', async () => {
    const r = await request(app.getHttpServer()).get(mk('/reports/barbers')).set(auth(token)).expect(200);
    const row = r.body.rows.find((x: any) => x.barberId === barberId);
    expect(row.revenueCents).toBe(5000); // serviço (produto não tem barbeiro)
    expect(row.commissionCents).toBe(2000); // 40%
  });

  it('curva ABC de produtos classifica por faturamento', async () => {
    const r = await request(app.getHttpServer()).get(mk('/reports/products-abc')).set(auth(token)).expect(200);
    const row = r.body.rows.find((x: any) => x.productId === productId);
    expect(row.revenueCents).toBe(3000);
    expect(row.curve).toBe('A');
  });

  // ---- Exportação CSV ----

  it('exporta o DRE em CSV (download, BOM, ponto-e-vírgula)', async () => {
    const r = await request(app.getHttpServer())
      .get(mk('/reports/dre.csv')).set(auth(token)).expect(200);

    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.headers['content-disposition']).toContain('attachment');
    expect(r.headers['content-disposition']).toContain('dre_');
    // BOM para o Excel não corromper acentos
    expect(r.text.charCodeAt(0)).toBe(0xfeff);
    expect(r.text).toContain('Tipo;Categoria;Valor');
    // valores em centavos viram decimal com vírgula
    expect(r.text).toContain('Despesa;Aluguel;2000,00');
    expect(r.text).toContain('Total;Resultado;');
  });

  it('exporta ranking de barbeiros em CSV', async () => {
    const r = await request(app.getHttpServer())
      .get(mk('/reports/barbers.csv')).set(auth(token)).expect(200);
    expect(r.text).toContain('Barbeiro;Atendimentos;Faturamento;Comissao');
    expect(r.text).toContain('50,00'); // faturamento do serviço
    expect(r.text).toContain('20,00'); // comissão 40%
  });

  it('exporta curva ABC em CSV', async () => {
    const r = await request(app.getHttpServer())
      .get(mk('/reports/products-abc.csv')).set(auth(token)).expect(200);
    expect(r.text).toContain('Produto;Curva;Quantidade;Faturamento');
    expect(r.text).toContain(';A;');
    expect(r.text).toContain('30,00');
  });

  it('exportação exige autenticação (401)', async () => {
    await request(app.getHttpServer()).get(mk('/reports/dre.csv')).expect(401);
  });
});
