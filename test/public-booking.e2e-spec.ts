import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bootstrap, authHeader } from './helpers';

/**
 * Agendamento online (endpoints públicos, sem autenticação).
 * Cobre o caminho feliz + as travas: não vaza dado interno, respeita jornada,
 * bloqueia overbooking e recusa barbearia inexistente.
 */
describe('Agendamento online (e2e)', () => {
  let app: INestApplication;
  const s = Date.now();
  const slug = `agenda-online-${s}`;
  const mk = (p: string) => `/api${p}`;
  const pub = (p = '') => mk(`/public/${slug}${p}`);

  let token: string;
  let serviceId: string;
  let barberId: string;
  let date: string; // próxima segunda-feira (dia com jornada)

  beforeAll(async () => {
    app = await bootstrap();

    // Barbearia + admin
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

    // Serviço de 30 min
    const svc = await request(app.getHttpServer())
      .post(mk('/services')).set(authHeader(token))
      .send({ name: 'Corte', durationMin: 30, priceCents: 5000 })
      .expect(201);
    serviceId = svc.body.id;

    // Barbeiro
    const barber = await request(app.getHttpServer())
      .post(mk('/barbers')).set(authHeader(token))
      .send({ name: 'João', document: "111.444.777-35", birthDate: "1990-01-15", address: { zip: "01001-000", street: "Rua", number: "1", neighborhood: "Centro", city: "Sao Paulo", state: "SP" } })
      .expect(201);
    barberId = barber.body.id;

    // Jornada seg-sex 09:00-18:00
    await request(app.getHttpServer())
      .put(mk(`/barbers/${barberId}/schedule`)).set(authHeader(token))
      .send({
        items: [1, 2, 3, 4, 5].map((weekday) => ({
          weekday,
          startTime: '09:00',
          endTime: '18:00',
        })),
      })
      .expect(200);

    // Próxima segunda-feira (garante dia com jornada e no futuro)
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
    date = d.toISOString().slice(0, 10);
  });

  afterAll(async () => {
    await app.close();
  });

  it('mostra a barbearia sem autenticação', async () => {
    const r = await request(app.getHttpServer()).get(pub()).expect(200);
    expect(r.body.name).toContain(slug);
    expect(r.body.unit).toBeTruthy();
  });

  it('barbearia inexistente → 404', async () => {
    await request(app.getHttpServer())
      .get(mk(`/public/nao-existe-${s}`))
      .expect(404);
  });

  it('lista serviços e profissionais publicamente', async () => {
    const svcs = await request(app.getHttpServer()).get(pub('/services')).expect(200);
    expect(svcs.body).toHaveLength(1);
    expect(svcs.body[0].name).toBe('Corte');
    // não vaza campos internos
    expect(svcs.body[0].tenantId).toBeUndefined();

    const barbers = await request(app.getHttpServer()).get(pub('/barbers')).expect(200);
    expect(barbers.body[0].name).toBe('João');
    expect(barbers.body[0].tenantId).toBeUndefined();
  });

  it('devolve horários livres dentro da jornada', async () => {
    const r = await request(app.getHttpServer())
      .get(pub(`/availability?date=${date}&serviceId=${serviceId}`))
      .expect(200);
    expect(r.body.slots.length).toBeGreaterThan(0);
    expect(r.body.durationMin).toBe(30);
    // primeiro slot às 09:00 locais; último termina até 18:00
    const horas = r.body.slots.map((x: any) =>
      new Date(x.startAt).toLocaleTimeString('pt-BR', {
        timeZone: r.body.timezone,
        hour: '2-digit',
        minute: '2-digit',
      }),
    );
    expect(horas[0]).toBe('09:00');
    expect(horas).not.toContain('18:00'); // 18:00 + 30min estouraria a jornada
  });

  it('data inválida → 400', async () => {
    await request(app.getHttpServer())
      .get(pub(`/availability?date=10-08-2026&serviceId=${serviceId}`))
      .expect(400);
  });

  it('agenda de verdade e o horário some da lista', async () => {
    const antes = await request(app.getHttpServer())
      .get(pub(`/availability?date=${date}&serviceId=${serviceId}`))
      .expect(200);
    const escolhido = antes.body.slots[0].startAt;

    const criado = await request(app.getHttpServer())
      .post(pub('/appointments'))
      .send({
        name: 'Cliente Teste',
        phone: '(11) 98888-7777',
        serviceId,
        barberId,
        startAt: escolhido,
      })
      .expect(201);
    expect(criado.body.id).toBeTruthy();
    expect(criado.body.status).toBe('SCHEDULED');
    // resposta não expõe dados internos
    expect(criado.body.tenantId).toBeUndefined();
    expect(criado.body.clientId).toBeUndefined();

    const depois = await request(app.getHttpServer())
      .get(pub(`/availability?date=${date}&serviceId=${serviceId}`))
      .expect(200);
    expect(depois.body.slots.map((x: any) => x.startAt)).not.toContain(escolhido);
  });

  it('não deixa dois clientes pegarem o mesmo horário (409)', async () => {
    const disp = await request(app.getHttpServer())
      .get(pub(`/availability?date=${date}&serviceId=${serviceId}`))
      .expect(200);
    const slot = disp.body.slots[0].startAt;

    await request(app.getHttpServer())
      .post(pub('/appointments'))
      .send({ name: 'Primeiro', phone: '11911110000', serviceId, barberId, startAt: slot })
      .expect(201);

    await request(app.getHttpServer())
      .post(pub('/appointments'))
      .send({ name: 'Segundo', phone: '11922220000', serviceId, barberId, startAt: slot })
      .expect(409);
  });

  it('recusa horário no passado', async () => {
    await request(app.getHttpServer())
      .post(pub('/appointments'))
      .send({
        name: 'Atrasado',
        phone: '11933330000',
        serviceId,
        barberId,
        startAt: new Date(Date.now() - 3600_000).toISOString(),
      })
      .expect(400);
  });

  it('recusa horário fora do expediente (03:00)', async () => {
    await request(app.getHttpServer())
      .post(pub('/appointments'))
      .send({
        name: 'Madrugada',
        phone: '11944440000',
        serviceId,
        barberId,
        startAt: `${date}T06:00:00.000Z`, // 03:00 em São Paulo
      })
      .expect(409);
  });

  it('valida os dados do formulário (400)', async () => {
    await request(app.getHttpServer())
      .post(pub('/appointments'))
      .send({ name: 'A', phone: 'abc', serviceId, barberId, startAt: 'ontem' })
      .expect(400);
  });

  it('o agendamento online aparece na agenda interna', async () => {
    const agenda = await request(app.getHttpServer())
      .get(mk(`/appointments?from=${date}T00:00:00.000Z&to=${date}T23:59:59.000Z`))
      .set(authHeader(token))
      .expect(200);
    expect(agenda.body.length).toBeGreaterThan(0);
  });
});
