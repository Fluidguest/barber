import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bootstrap, authHeader } from './helpers';
import { signAppointmentToken } from '../src/common/appointment-token';

/**
 * Auto-atendimento pelo link do lembrete: o cliente confirma ou desmarca
 * sozinho. Autorização é o token assinado — sem login.
 */
describe('Confirmação/cancelamento pelo cliente (e2e)', () => {
  let app: INestApplication;
  const s = Date.now();
  const slug = `confirma-${s}`;
  const mk = (p: string) => `/api${p}`;

  let token: string;
  let tenantId: string;
  let apptId: string;
  let startAt: Date;
  let link: string;

  beforeAll(async () => {
    app = await bootstrap();

    const reg = await request(app.getHttpServer())
      .post(mk('/auth/register'))
      .send({
        barbershopName: `Barbearia ${slug}`,
        slug,
        adminName: 'Admin',
        email: `${slug}@x.com`,
        password: 'password123',
      })
      .expect(201);
    token = reg.body.accessToken;
    tenantId = reg.body.tenantId;

    const svc = await request(app.getHttpServer())
      .post(mk('/services')).set(authHeader(token))
      .send({ name: 'Corte', durationMin: 30, priceCents: 5000 }).expect(201);
    const barber = await request(app.getHttpServer())
      .post(mk('/barbers')).set(authHeader(token))
      .send({ name: 'João' }).expect(201);
    const client = await request(app.getHttpServer())
      .post(mk('/clients')).set(authHeader(token))
      .send({ name: 'Cliente', phone: '11999998888' }).expect(201);

    startAt = new Date(Date.now() + 48 * 3600_000); // depois de amanhã
    const appt = await request(app.getHttpServer())
      .post(mk('/appointments')).set(authHeader(token))
      .send({
        clientId: client.body.id,
        barberId: barber.body.id,
        serviceId: svc.body.id,
        startAt: startAt.toISOString(),
      })
      .expect(201);
    apptId = appt.body.id;
    link = signAppointmentToken(tenantId, apptId, startAt);
  });

  afterAll(async () => { await app.close(); });

  it('abre o link e vê os dados do agendamento (sem login)', async () => {
    const r = await request(app.getHttpServer())
      .get(mk(`/public/appointments/${link}`)).expect(200);

    expect(r.body.serviceName).toBe('Corte');
    expect(r.body.barberName).toBe('João');
    expect(r.body.status).toBe('SCHEDULED');
    expect(r.body.canConfirm).toBe(true);
    expect(r.body.canCancel).toBe(true);
    // não vaza dado interno
    expect(r.body.clientId).toBeUndefined();
    expect(r.body.priceCents).toBeUndefined();
  });

  it('token inválido ou adulterado → 404', async () => {
    await request(app.getHttpServer())
      .get(mk('/public/appointments/lixo.invalido.123.abc')).expect(404);
    await request(app.getHttpServer())
      .get(mk(`/public/appointments/${link.slice(0, -3)}xyz`)).expect(404);
  });

  it('token de outro agendamento não serve', async () => {
    const outro = signAppointmentToken(tenantId, 'id-que-nao-existe', startAt);
    await request(app.getHttpServer())
      .get(mk(`/public/appointments/${outro}`)).expect(404);
  });

  it('cliente confirma a presença', async () => {
    const r = await request(app.getHttpServer())
      .post(mk(`/public/appointments/${link}/confirm`)).expect(201);
    expect(r.body.status).toBe('CONFIRMED');

    // reflete na agenda interna
    const interno = await request(app.getHttpServer())
      .get(mk(`/appointments/${apptId}`)).set(authHeader(token)).expect(200);
    expect(interno.body.status).toBe('CONFIRMED');
  });

  it('confirmar de novo é idempotente', async () => {
    const r = await request(app.getHttpServer())
      .post(mk(`/public/appointments/${link}/confirm`)).expect(201);
    expect(r.body.status).toBe('CONFIRMED');
  });

  it('cliente cancela e o horário volta a ficar livre', async () => {
    const r = await request(app.getHttpServer())
      .post(mk(`/public/appointments/${link}/cancel`)).expect(201);
    expect(r.body.status).toBe('CANCELED');
    expect(r.body.canCancel).toBe(false);

    const interno = await request(app.getHttpServer())
      .get(mk(`/appointments/${apptId}`)).set(authHeader(token)).expect(200);
    expect(interno.body.status).toBe('CANCELED');
  });

  it('não cancela duas vezes (400)', async () => {
    await request(app.getHttpServer())
      .post(mk(`/public/appointments/${link}/cancel`)).expect(400);
  });

  it('link de horário já passado não permite ação (400)', async () => {
    const passado = new Date(Date.now() - 3600_000);
    const apptPassado = await request(app.getHttpServer())
      .post(mk('/appointments')).set(authHeader(token))
      .send({
        clientId: (await request(app.getHttpServer())
          .get(mk('/clients')).set(authHeader(token))).body[0].id,
        barberId: (await request(app.getHttpServer())
          .get(mk('/barbers')).set(authHeader(token))).body[0].id,
        serviceId: (await request(app.getHttpServer())
          .get(mk('/services')).set(authHeader(token))).body[0].id,
        startAt: passado.toISOString(),
      })
      .expect(201);

    const linkPassado = signAppointmentToken(
      tenantId, apptPassado.body.id, passado,
    );
    await request(app.getHttpServer())
      .post(mk(`/public/appointments/${linkPassado}/confirm`)).expect(400);
  });
});
