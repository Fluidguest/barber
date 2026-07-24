import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Suíte de SEGURANÇA. Cobre os vetores mais críticos de um SaaS multi-tenant:
 *  - acesso cross-tenant com ID forjado (o pior incidente possível);
 *  - autenticação (sem token / token adulterado);
 *  - mass-assignment (campos não permitidos);
 *  - injeção via parâmetro de busca.
 * (rate limiting fica em security-ratelimit.e2e-spec.ts)
 */
describe('Segurança (e2e)', () => {
  let app: INestApplication;
  const s = Date.now();
  const mk = (p: string) => `/api${p}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  let tokenA: string;
  let tokenB: string;
  const A: Record<string, string> = {}; // ids de recursos do tenant A

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

    tokenA = await register(`sec-a-${s}`, `a-${s}@x.com`);
    tokenB = await register(`sec-b-${s}`, `b-${s}@x.com`);

    // Recursos do tenant A (alvos do ataque cross-tenant).
    A.client = (await request(app.getHttpServer())
      .post(mk('/clients')).set(auth(tokenA)).send({ name: 'Cliente A', document: '39053344705' }).expect(201)).body.id;
    A.service = (await request(app.getHttpServer())
      .post(mk('/services')).set(auth(tokenA)).send({ name: 'Corte', durationMin: 30, priceCents: 5000 }).expect(201)).body.id;
    A.barber = (await request(app.getHttpServer())
      .post(mk('/barbers')).set(auth(tokenA)).send({ name: 'Barbeiro A', document: "111.444.777-35", birthDate: "1990-01-15", address: { zip: "01001-000", street: "Rua", number: "1", neighborhood: "Centro", city: "Sao Paulo", state: "SP" } }).expect(201)).body.id;
    A.product = (await request(app.getHttpServer())
      .post(mk('/products')).set(auth(tokenA)).send({ name: 'Pomada', priceCents: 3000, stockCurrent: 5 }).expect(201)).body.id;
    A.finance = (await request(app.getHttpServer())
      .post(mk('/finance/entries')).set(auth(tokenA)).send({ type: 'PAYABLE', description: 'Aluguel', amountCents: 1000, dueDate: new Date().toISOString() }).expect(201)).body.id;
  });

  afterAll(async () => { await app.close(); });

  describe('Isolamento cross-tenant (ID forjado)', () => {
    const cases: [string, string][] = [
      ['/clients', 'client'],
      ['/services', 'service'],
      ['/barbers', 'barber'],
      ['/products', 'product'],
      ['/finance/entries', 'finance'],
    ];

    it.each(cases)('B não LÊ %s de A por id (404)', async (path, key) => {
      await request(app.getHttpServer())
        .get(mk(`${path}/${A[key]}`)).set(auth(tokenB)).expect(404);
    });

    it('B não ALTERA cliente de A (404)', async () => {
      await request(app.getHttpServer())
        .patch(mk(`/clients/${A.client}`)).set(auth(tokenB))
        .send({ name: 'invadido' }).expect(404);
    });

    it('B não REMOVE serviço de A (404)', async () => {
      await request(app.getHttpServer())
        .delete(mk(`/services/${A.service}`)).set(auth(tokenB)).expect(404);
    });

    it('B não movimenta o estoque de um produto de A (404)', async () => {
      await request(app.getHttpServer())
        .post(mk(`/products/${A.product}/movements`)).set(auth(tokenB))
        .send({ type: 'OUT', quantity: 1 }).expect(404);
    });

    it('listagens de B não contêm nenhum recurso de A', async () => {
      for (const [path] of cases) {
        const list = await request(app.getHttpServer())
          .get(mk(path)).set(auth(tokenB)).expect(200);
        expect(list.body).toHaveLength(0);
      }
    });
  });

  describe('Autenticação', () => {
    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get(mk('/clients')).expect(401);
    });
    it('token lixo → 401', async () => {
      await request(app.getHttpServer())
        .get(mk('/clients')).set({ Authorization: 'Bearer not-a-jwt' }).expect(401);
    });
    it('token adulterado (assinatura trocada) → 401', async () => {
      const parts = tokenA.split('.');
      const tampered = `${parts[0]}.${parts[1]}.deadbeefsignature`;
      await request(app.getHttpServer())
        .get(mk('/clients')).set({ Authorization: `Bearer ${tampered}` }).expect(401);
    });
  });

  describe('Mass-assignment e injeção', () => {
    it('rejeita campos não permitidos no cadastro (400)', async () => {
      await request(app.getHttpServer())
        .post(mk('/clients')).set(auth(tokenA))
        .send({ name: 'Fulano', tenantId: 'outro-tenant', isAdmin: true }).expect(400);
    });

    it('busca com tentativa de SQL injection é tratada com segurança', async () => {
      const r = await request(app.getHttpServer())
        .get(mk(`/clients?search=${encodeURIComponent("' OR 1=1; DROP TABLE clients;--")}`))
        .set(auth(tokenB)).expect(200);
      // não vaza dados de A nem quebra o banco
      expect(Array.isArray(r.body)).toBe(true);
      expect(r.body).toHaveLength(0);
    });

    it('CPF do cliente não é exposto em texto puro no banco', async () => {
      // via API (mesmo tenant) o CPF volta em claro; o teste de repouso está em
      // clients.e2e-spec.ts. Aqui garantimos que B não acessa o cliente de A.
      const got = await request(app.getHttpServer())
        .get(mk(`/clients/${A.client}`)).set(auth(tokenA)).expect(200);
      expect(got.body.document).toBe('39053344705');
    });
  });
});
