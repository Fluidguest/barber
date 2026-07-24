import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Realtime (Socket.io). O foco é o ISOLAMENTO: um socket só recebe eventos da
 * própria barbearia, e um socket sem token válido é derrubado.
 */
describe('Realtime (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const s = Date.now();
  const mk = (p: string) => `/api${p}`;

  let tokenA: string;
  let tokenB: string;

  async function register(slug: string) {
    const r = await request(app.getHttpServer())
      .post(mk('/auth/register'))
      .send({
        barbershopName: `Barbearia ${slug}`,
        slug,
        adminName: 'Admin',
        email: `${slug}@x.com`,
        password: 'password123',
      })
      .expect(201);
    return r.body.accessToken as string;
  }

  /** Abre um socket autenticado e espera conectar (ou falhar). */
  function connect(token?: string): Socket {
    return io(`${baseUrl}/realtime`, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: false,
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.listen(0); // porta aleatória — precisamos de servidor HTTP real p/ o socket
    const addr = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${addr.port}`;

    tokenA = await register(`rt-a-${s}`);
    tokenB = await register(`rt-b-${s}`);
  });

  afterAll(async () => {
    await app.close();
  });

  it('conecta com token válido', async () => {
    const sock = connect(tokenA);
    await new Promise<void>((resolve, reject) => {
      sock.on('connect', resolve);
      sock.on('connect_error', reject);
      setTimeout(() => reject(new Error('timeout')), 3000);
    });
    expect(sock.connected).toBe(true);
    sock.disconnect();
  });

  it('derruba socket sem token', async () => {
    const sock = connect(); // sem token
    const desconectou = await new Promise<boolean>((resolve) => {
      sock.on('disconnect', () => resolve(true));
      // se conectar e ficar, o teste falha por timeout
      setTimeout(() => resolve(sock.connected === false), 2500);
    });
    expect(desconectou).toBe(true);
    sock.disconnect();
  });

  it('ISOLAMENTO: mensagem de WhatsApp de A não chega no socket de B', async () => {
    const sockA = connect(tokenA);
    const sockB = connect(tokenB);
    await Promise.all([
      new Promise<void>((r) => sockA.on('connect', () => r())),
      new Promise<void>((r) => sockB.on('connect', () => r())),
    ]);

    const recebidosA: any[] = [];
    const recebidosB: any[] = [];
    sockA.on('whatsapp:message', (m) => recebidosA.push(m));
    sockB.on('whatsapp:message', (m) => recebidosB.push(m));

    // A envia uma mensagem (gera evento no tenant A)
    await request(app.getHttpServer())
      .post(mk('/whatsapp/messages')).set({ Authorization: `Bearer ${tokenA}` })
      .send({ to: '5511988887777', body: 'Olá do tenant A' })
      .expect(201);

    // dá tempo do evento propagar
    await new Promise((r) => setTimeout(r, 800));

    expect(recebidosA.length).toBeGreaterThan(0);      // A recebe o próprio evento
    expect(recebidosA[0].message.body).toBe('Olá do tenant A');
    expect(recebidosB.length).toBe(0);                 // B NÃO recebe nada de A

    sockA.disconnect();
    sockB.disconnect();
  });

  it('ISOLAMENTO: novo agendamento de A não chega no socket de B', async () => {
    const sockA = connect(tokenA);
    const sockB = connect(tokenB);
    await Promise.all([
      new Promise<void>((r) => sockA.on('connect', () => r())),
      new Promise<void>((r) => sockB.on('connect', () => r())),
    ]);

    const eventosA: any[] = [];
    const eventosB: any[] = [];
    sockA.on('appointment:changed', (e) => eventosA.push(e));
    sockB.on('appointment:changed', (e) => eventosB.push(e));

    // cria um agendamento no tenant A
    const auth = { Authorization: `Bearer ${tokenA}` };
    const svc = (await request(app.getHttpServer()).post(mk('/services')).set(auth)
      .send({ name: 'Corte', durationMin: 30, priceCents: 5000 }).expect(201)).body;
    const barber = (await request(app.getHttpServer()).post(mk('/barbers')).set(auth)
      .send({ name: 'João', document: "111.444.777-35", birthDate: "1990-01-15", address: { zip: "01001-000", street: "Rua", number: "1", neighborhood: "Centro", city: "Sao Paulo", state: "SP" } }).expect(201)).body;
    const client = (await request(app.getHttpServer()).post(mk('/clients')).set(auth)
      .send({ name: 'Cliente', phone: '11999990000' }).expect(201)).body;
    await request(app.getHttpServer()).post(mk('/appointments')).set(auth)
      .send({
        clientId: client.id, barberId: barber.id, serviceId: svc.id,
        startAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
      }).expect(201);

    await new Promise((r) => setTimeout(r, 800));

    expect(eventosA.some((e) => e.action === 'created')).toBe(true);
    expect(eventosB.length).toBe(0);

    sockA.disconnect();
    sockB.disconnect();
  });
});
