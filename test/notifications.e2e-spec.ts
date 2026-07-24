import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Lembrete de WhatsApp: agendamento automático na criação do atendimento,
 * envio manual, dispatch de mensagens vencidas e isolamento.
 */
describe('Notificações / WhatsApp (e2e)', () => {
  let app: INestApplication;
  const s = Date.now();
  const mk = (p: string) => `/api${p}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  let tokenA: string;
  let tokenB: string;
  let clientId: string;
  let serviceId: string;
  let barberId: string;

  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

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

    tokenA = await register(`not-a-${s}`, `a-${s}@x.com`);
    tokenB = await register(`not-b-${s}`, `b-${s}@x.com`);

    clientId = (await request(app.getHttpServer())
      .post(mk('/clients')).set(auth(tokenA))
      .send({ name: 'Cliente Not', whatsapp: '11999999999' }).expect(201)).body.id;
    serviceId = (await request(app.getHttpServer())
      .post(mk('/services')).set(auth(tokenA))
      .send({ name: 'Corte', durationMin: 30, priceCents: 5000 }).expect(201)).body.id;
    barberId = (await request(app.getHttpServer())
      .post(mk('/barbers')).set(auth(tokenA)).send({ name: 'Barbeiro Not', document: "111.444.777-35", birthDate: "1990-01-15", address: { zip: "01001-000", street: "Rua", number: "1", neighborhood: "Centro", city: "Sao Paulo", state: "SP" } }).expect(201)).body.id;
  });

  afterAll(async () => { await app.close(); });

  it('criar atendimento agenda um lembrete QUEUED', async () => {
    await request(app.getHttpServer())
      .post(mk('/appointments')).set(auth(tokenA))
      .send({ clientId, barberId, serviceId, startAt: inDays(3) }).expect(201);

    const list = await request(app.getHttpServer())
      .get(mk('/notifications')).set(auth(tokenA)).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].type).toBe('REMINDER');
    expect(list.body[0].status).toBe('QUEUED');
  });

  it('envia manualmente uma mensagem (fake provider)', async () => {
    const list = await request(app.getHttpServer())
      .get(mk('/notifications')).set(auth(tokenA)).expect(200);
    const id = list.body[0].id;
    const sent = await request(app.getHttpServer())
      .post(mk(`/notifications/${id}/send`)).set(auth(tokenA)).expect(201);
    expect(sent.body.status).toBe('SENT');
    expect(sent.body.providerMessageId).toMatch(/^fake_/);
  });

  it('dispatch envia lembretes já vencidos', async () => {
    // Atendimento no passado => lembrete vencido => dispatch envia.
    await request(app.getHttpServer())
      .post(mk('/appointments')).set(auth(tokenA))
      .send({ clientId, barberId, serviceId, startAt: inDays(-3) }).expect(201);

    const res = await request(app.getHttpServer())
      .post(mk('/notifications/dispatch')).set(auth(tokenA)).expect(201);
    expect(res.body.dispatched).toBeGreaterThanOrEqual(1);

    const sent = await request(app.getHttpServer())
      .get(mk('/notifications?status=SENT')).set(auth(tokenA)).expect(200);
    expect(sent.body.length).toBeGreaterThanOrEqual(2);
  });

  it('cliente sem contato não gera lembrete', async () => {
    const noContact = (await request(app.getHttpServer())
      .post(mk('/clients')).set(auth(tokenA)).send({ name: 'Sem Contato' }).expect(201)).body.id;
    const before = (await request(app.getHttpServer())
      .get(mk('/notifications')).set(auth(tokenA)).expect(200)).body.length;
    await request(app.getHttpServer())
      .post(mk('/appointments')).set(auth(tokenA))
      .send({ clientId: noContact, barberId, serviceId, startAt: inDays(5) }).expect(201);
    const after = (await request(app.getHttpServer())
      .get(mk('/notifications')).set(auth(tokenA)).expect(200)).body.length;
    expect(after).toBe(before); // nenhuma mensagem nova
  });

  it('isolamento: B não vê notificações de A', async () => {
    const list = await request(app.getHttpServer())
      .get(mk('/notifications')).set(auth(tokenB)).expect(200);
    expect(list.body).toHaveLength(0);
  });
});
