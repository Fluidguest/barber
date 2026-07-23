import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Serviços + Barbeiros: CRUD, validações e isolamento de tenant (DoD).
 */
describe('Catálogo: serviços e barbeiros (e2e)', () => {
  let app: INestApplication;
  const s = Date.now();
  let tokenA: string;
  let tokenB: string;
  let serviceAId: string;
  let serviceBId: string;

  const mk = (p: string) => `/api${p}`;

  async function register(slug: string, email: string): Promise<string> {
    const r = await request(app.getHttpServer())
      .post(mk('/auth/register'))
      .send({
        barbershopName: `Barb ${slug}`,
        slug,
        adminName: 'Admin Teste',
        email,
        password: 'password123',
      })
      .expect(201);
    return r.body.accessToken;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    tokenA = await register(`cat-a-${s}`, `a-${s}@x.com`);
    tokenB = await register(`cat-b-${s}`, `b-${s}@x.com`);
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  it('cria serviço com categoria (tenant A)', async () => {
    const cat = await request(app.getHttpServer())
      .post(mk('/services/categories/new'))
      .set(auth(tokenA))
      .send({ name: 'Cortes' })
      .expect(201);

    const svc = await request(app.getHttpServer())
      .post(mk('/services'))
      .set(auth(tokenA))
      .send({ name: 'Corte Masculino', durationMin: 30, priceCents: 5000, categoryId: cat.body.id })
      .expect(201);
    serviceAId = svc.body.id;
    expect(svc.body.priceCents).toBe(5000);
    expect(svc.body.categoryId).toBe(cat.body.id);
  });

  it('rejeita serviço com duração inválida (validação)', async () => {
    await request(app.getHttpServer())
      .post(mk('/services'))
      .set(auth(tokenA))
      .send({ name: 'X', durationMin: 1, priceCents: 100 })
      .expect(400);
  });

  it('rejeita categoria de outro tenant', async () => {
    const catA = await request(app.getHttpServer())
      .post(mk('/services/categories/new'))
      .set(auth(tokenA))
      .send({ name: 'Barba' })
      .expect(201);
    // B tenta usar a categoria de A -> 400
    await request(app.getHttpServer())
      .post(mk('/services'))
      .set(auth(tokenB))
      .send({ name: 'Serviço B', durationMin: 20, priceCents: 3000, categoryId: catA.body.id })
      .expect(400);
  });

  it('isolamento: A não vê serviço de B e vice-versa', async () => {
    const svcB = await request(app.getHttpServer())
      .post(mk('/services'))
      .set(auth(tokenB))
      .send({ name: 'Serviço só de B', durationMin: 25, priceCents: 4000 })
      .expect(201);
    serviceBId = svcB.body.id;

    const listA = await request(app.getHttpServer())
      .get(mk('/services'))
      .set(auth(tokenA))
      .expect(200);
    const ids = listA.body.map((x: any) => x.id);
    expect(ids).toContain(serviceAId);
    expect(ids).not.toContain(serviceBId);

    // B tenta ler serviço de A por id -> 404
    await request(app.getHttpServer())
      .get(mk(`/services/${serviceAId}`))
      .set(auth(tokenB))
      .expect(404);
  });

  it('cria barbeiro com especialidade e jornada (tenant A)', async () => {
    const barber = await request(app.getHttpServer())
      .post(mk('/barbers'))
      .set(auth(tokenA))
      .send({ name: 'João Barbeiro', specialtyIds: [serviceAId] })
      .expect(201);
    expect(barber.body.specialties).toEqual([{ serviceId: serviceAId }]);

    const sched = await request(app.getHttpServer())
      .put(mk(`/barbers/${barber.body.id}/schedule`))
      .set(auth(tokenA))
      .send({ items: [{ weekday: 1, startTime: '09:00', endTime: '18:00' }] })
      .expect(200);
    expect(sched.body).toHaveLength(1);

    const got = await request(app.getHttpServer())
      .get(mk(`/barbers/${barber.body.id}`))
      .set(auth(tokenA))
      .expect(200);
    expect(got.body.schedules).toHaveLength(1);
  });

  it('rejeita barbeiro com especialidade de outro tenant', async () => {
    // A tenta usar o serviço de B como especialidade -> 400
    await request(app.getHttpServer())
      .post(mk('/barbers'))
      .set(auth(tokenA))
      .send({ name: 'Barbeiro Fraude', specialtyIds: [serviceBId] })
      .expect(400);
  });
});
