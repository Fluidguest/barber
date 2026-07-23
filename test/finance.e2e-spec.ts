import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Financeiro: contas a pagar/receber, pagamento, fluxo de caixa e isolamento.
 */
describe('Financeiro (e2e)', () => {
  let app: INestApplication;
  const s = Date.now();
  const mk = (p: string) => `/api${p}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  let tokenA: string;
  let tokenB: string;
  let categoryId: string;

  const iso = (d: Date) => d.toISOString();

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
    tokenA = await register(`fin-a-${s}`, `a-${s}@x.com`);
    tokenB = await register(`fin-b-${s}`, `b-${s}@x.com`);
  });

  afterAll(async () => { await app.close(); });

  it('cria categoria de despesa', async () => {
    const r = await request(app.getHttpServer())
      .post(mk('/finance/categories')).set(auth(tokenA))
      .send({ name: 'Aluguel', kind: 'EXPENSE' }).expect(201);
    categoryId = r.body.id;
    expect(r.body.kind).toBe('EXPENSE');
  });

  it('cria conta a pagar e conta a receber', async () => {
    const pay = await request(app.getHttpServer())
      .post(mk('/finance/entries')).set(auth(tokenA))
      .send({ type: 'PAYABLE', description: 'Aluguel julho', amountCents: 200000, dueDate: iso(new Date()), categoryId })
      .expect(201);
    expect(pay.body.status).toBe('PENDING');

    await request(app.getHttpServer())
      .post(mk('/finance/entries')).set(auth(tokenA))
      .send({ type: 'RECEIVABLE', description: 'Pacote mensal cliente', amountCents: 15000, dueDate: iso(new Date()) })
      .expect(201);
  });

  it('rejeita valor inválido (400)', async () => {
    await request(app.getHttpServer())
      .post(mk('/finance/entries')).set(auth(tokenA))
      .send({ type: 'PAYABLE', description: 'X', amountCents: 0, dueDate: iso(new Date()) })
      .expect(400);
  });

  it('paga uma conta a pagar', async () => {
    const list = await request(app.getHttpServer())
      .get(mk('/finance/entries?type=PAYABLE&status=PENDING')).set(auth(tokenA)).expect(200);
    const id = list.body[0].id;
    const paid = await request(app.getHttpServer())
      .post(mk(`/finance/entries/${id}/pay`)).set(auth(tokenA))
      .send({ method: 'PIX' }).expect(201);
    expect(paid.body.status).toBe('PAID');
    expect(paid.body.paidAt).toBeTruthy();
  });

  it('fluxo de caixa reflete realizado e previsto', async () => {
    const cf = await request(app.getHttpServer())
      .get(mk('/finance/cashflow')).set(auth(tokenA)).expect(200);
    // despesa realizada = 2000,00 (aluguel pago)
    expect(cf.body.realizedExpenseCents).toBe(200000);
    // receita prevista = 150,00 (pacote pendente)
    expect(cf.body.forecastIncomeCents).toBe(15000);
  });

  it('isolamento: B não vê lançamentos de A', async () => {
    const list = await request(app.getHttpServer())
      .get(mk('/finance/entries')).set(auth(tokenB)).expect(200);
    expect(list.body).toHaveLength(0);
    // B também não usa a categoria de A
    await request(app.getHttpServer())
      .post(mk('/finance/entries')).set(auth(tokenB))
      .send({ type: 'PAYABLE', description: 'x', amountCents: 100, dueDate: iso(new Date()), categoryId })
      .expect(400);
  });

  // ---- correções ----

  it('coerência tipo×categoria: categoria de despesa em conta a receber → 400', async () => {
    await request(app.getHttpServer())
      .post(mk('/finance/entries')).set(auth(tokenA))
      .send({ type: 'RECEIVABLE', description: 'errado', amountCents: 100, dueDate: iso(new Date()), categoryId })
      .expect(400); // categoryId é EXPENSE; RECEIVABLE exige INCOME
  });

  it('cancelar lançamento pendente (status CANCELED, some do fluxo)', async () => {
    const created = (await request(app.getHttpServer())
      .post(mk('/finance/entries')).set(auth(tokenA))
      .send({ type: 'PAYABLE', description: 'A cancelar', amountCents: 5000, dueDate: iso(new Date()) })
      .expect(201)).body;
    const canceled = await request(app.getHttpServer())
      .post(mk(`/finance/entries/${created.id}/cancel`)).set(auth(tokenA)).expect(201);
    expect(canceled.body.status).toBe('CANCELED');
    // não pode cancelar de novo
    await request(app.getHttpServer())
      .post(mk(`/finance/entries/${created.id}/cancel`)).set(auth(tokenA)).expect(400);
  });

  it('filtro por paidAt retorna os pagos do período', async () => {
    const from = iso(new Date(Date.now() - 86400000));
    const to = iso(new Date(Date.now() + 86400000));
    const pagos = await request(app.getHttpServer())
      .get(mk(`/finance/entries?dateField=paidAt&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`))
      .set(auth(tokenA)).expect(200);
    expect(pagos.body.every((e: any) => e.status === 'PAID')).toBe(true);
    expect(pagos.body.length).toBeGreaterThanOrEqual(1); // o aluguel pago
  });
});
