import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Agenda: criação, overbooking (409), reagendamento, cancelamento e isolamento.
 */
describe('Agenda de atendimentos (e2e)', () => {
  let app: INestApplication;
  const s = Date.now();
  const mk = (p: string) => `/api${p}`;

  let tokenA: string;
  let tokenB: string;
  let clientId: string;
  let barberId: string;
  let serviceId: string;
  let apt1: string;
  let apt2: string;

  const D = '2026-07-20';
  const at = (hhmm: string) => `${D}T${hhmm}:00.000Z`;

  async function register(slug: string, email: string) {
    const r = await request(app.getHttpServer())
      .post(mk('/auth/register'))
      .send({ barbershopName: `B ${slug}`, slug, adminName: 'Admin Teste', email, password: 'password123' })
      .expect(201);
    return r.body.accessToken as string;
  }
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    tokenA = await register(`ag-a-${s}`, `a-${s}@x.com`);
    tokenB = await register(`ag-b-${s}`, `b-${s}@x.com`);

    const c = await request(app.getHttpServer())
      .post(mk('/clients')).set(auth(tokenA)).send({ name: 'Cliente Ag' }).expect(201);
    clientId = c.body.id;
    const svc = await request(app.getHttpServer())
      .post(mk('/services')).set(auth(tokenA))
      .send({ name: 'Corte', durationMin: 30, priceCents: 5000 }).expect(201);
    serviceId = svc.body.id;
    const b = await request(app.getHttpServer())
      .post(mk('/barbers')).set(auth(tokenA))
      .send({ name: 'Barbeiro Ag', document: "111.444.777-35", birthDate: "1990-01-15", address: { zip: "01001-000", street: "Rua", number: "1", neighborhood: "Centro", city: "Sao Paulo", state: "SP" }, specialtyIds: [serviceId] }).expect(201);
    barberId = b.body.id;

    // 2026-07-20 é segunda-feira (weekday 1). Jornada 09:00-18:00 (local da unidade).
    await request(app.getHttpServer())
      .put(mk(`/barbers/${barberId}/schedule`)).set(auth(tokenA))
      .send({ items: [{ weekday: 1, startTime: '09:00', endTime: '18:00' }] })
      .expect(200);
  });

  afterAll(async () => { await app.close(); });

  it('cria atendimento e calcula endAt pela duração', async () => {
    const r = await request(app.getHttpServer())
      .post(mk('/appointments')).set(auth(tokenA))
      .send({ clientId, barberId, serviceId, startAt: at('13:00') })
      .expect(201);
    apt1 = r.body.id;
    expect(new Date(r.body.endAt).toISOString()).toBe(at('13:30'));
    expect(r.body.priceCents).toBe(5000);
    expect(r.body.status).toBe('SCHEDULED');
  });

  it('bloqueia overbooking no mesmo barbeiro (409)', async () => {
    await request(app.getHttpServer())
      .post(mk('/appointments')).set(auth(tokenA))
      .send({ clientId, barberId, serviceId, startAt: at('13:15') })
      .expect(409);
  });

  it('permite atendimento encostado (13:30)', async () => {
    const r = await request(app.getHttpServer())
      .post(mk('/appointments')).set(auth(tokenA))
      .send({ clientId, barberId, serviceId, startAt: at('13:30') })
      .expect(201);
    apt2 = r.body.id;
  });

  it('reagendar para cima de outro atendimento -> 409', async () => {
    await request(app.getHttpServer())
      .patch(mk(`/appointments/${apt2}/reschedule`)).set(auth(tokenA))
      .send({ startAt: at('13:15') })
      .expect(409);
  });

  it('cancelar libera o horário', async () => {
    await request(app.getHttpServer())
      .patch(mk(`/appointments/${apt1}/status`)).set(auth(tokenA))
      .send({ status: 'CANCELED' })
      .expect(200);
    // agora 13:00 volta a ficar livre
    await request(app.getHttpServer())
      .post(mk('/appointments')).set(auth(tokenA))
      .send({ clientId, barberId, serviceId, startAt: at('13:00') })
      .expect(201);
  });

  it('lista por janela de data', async () => {
    const r = await request(app.getHttpServer())
      .get(mk(`/appointments?from=${at('00:00')}&to=${at('23:59')}`))
      .set(auth(tokenA)).expect(200);
    expect(r.body.length).toBeGreaterThanOrEqual(2);
  });

  it('isolamento: B não vê nem acessa atendimentos de A', async () => {
    await request(app.getHttpServer())
      .get(mk(`/appointments/${apt2}`)).set(auth(tokenB)).expect(404);
    const listB = await request(app.getHttpServer())
      .get(mk(`/appointments?from=${at('00:00')}&to=${at('23:59')}`))
      .set(auth(tokenB)).expect(200);
    expect(listB.body).toHaveLength(0);
  });

  it('rejeita referência inválida (cliente de outro tenant)', async () => {
    await request(app.getHttpServer())
      .post(mk('/appointments')).set(auth(tokenB))
      .send({ clientId, barberId, serviceId, startAt: at('15:00') })
      .expect(400);
  });

  it('rejeita fora do horário de trabalho (22:00Z = 19:00 local, após 18:00)', async () => {
    await request(app.getHttpServer())
      .post(mk('/appointments')).set(auth(tokenA))
      .send({ clientId, barberId, serviceId, startAt: at('22:00') })
      .expect(400);
  });

  it('respeita bloqueio de horário (409)', async () => {
    // Bloqueia 16:00-17:00Z (13:00-14:00 local, dentro da jornada).
    await request(app.getHttpServer())
      .post(mk('/time-blocks')).set(auth(tokenA))
      .send({ barberId, startAt: at('16:00'), endAt: at('17:00'), reason: 'Almoço' })
      .expect(201);
    // Tentar agendar dentro do bloqueio -> 409.
    await request(app.getHttpServer())
      .post(mk('/appointments')).set(auth(tokenA))
      .send({ clientId, barberId, serviceId, startAt: at('16:00') })
      .expect(409);
    // Fora do bloqueio, dentro da jornada (12:00Z = 09:00 local) -> ok.
    await request(app.getHttpServer())
      .post(mk('/appointments')).set(auth(tokenA))
      .send({ clientId, barberId, serviceId, startAt: at('12:00') })
      .expect(201);
  });
});
