import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bootstrap, authHeader } from './helpers';
import { SchedulerService } from '../src/scheduler/scheduler.service';
import { SystemPrismaService } from '../src/prisma/system-prisma.service';

/**
 * Jobs da plataforma: envio automático de lembretes (todas as barbearias) e
 * expiração de trial. Chamamos os métodos direto — o cron em si é do Nest.
 */
describe('Agendador da plataforma (e2e)', () => {
  let app: INestApplication;
  let scheduler: SchedulerService;
  let system: SystemPrismaService;
  const s = Date.now();
  const mk = (p: string) => `/api${p}`;

  let tokenA: string;
  let tokenB: string;
  let tenantA: string;
  let tenantB: string;

  /** Cria barbearia com um atendimento futuro (que agenda o lembrete). */
  async function setupBarbearia(slug: string) {
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
    const token = reg.body.accessToken as string;

    const svc = await request(app.getHttpServer())
      .post(mk('/services')).set(authHeader(token))
      .send({ name: 'Corte', durationMin: 30, priceCents: 5000 }).expect(201);
    const barber = await request(app.getHttpServer())
      .post(mk('/barbers')).set(authHeader(token))
      .send({ name: 'João', document: "111.444.777-35", birthDate: "1990-01-15", address: { zip: "01001-000", street: "Rua", number: "1", neighborhood: "Centro", city: "Sao Paulo", state: "SP" } }).expect(201);
    const client = await request(app.getHttpServer())
      .post(mk('/clients')).set(authHeader(token))
      .send({ name: 'Cliente', phone: '11999990000' }).expect(201);

    await request(app.getHttpServer())
      .post(mk('/appointments')).set(authHeader(token))
      .send({
        clientId: client.body.id,
        barberId: barber.body.id,
        serviceId: svc.body.id,
        startAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
      })
      .expect(201);

    return { token, tenantId: reg.body.tenantId as string };
  }

  beforeAll(async () => {
    app = await bootstrap();
    scheduler = app.get(SchedulerService);
    system = app.get(SystemPrismaService);

    const a = await setupBarbearia(`sched-a-${s}`);
    const b = await setupBarbearia(`sched-b-${s}`);
    tokenA = a.token;
    tenantA = a.tenantId;
    tokenB = b.token;
    tenantB = b.tenantId;

    // O lembrete nasce agendado para 24h ANTES do atendimento (já passou),
    // então está vencido e deve sair no próximo ciclo.
    process.env.SCHEDULER_ENABLED = 'true';
  });

  afterAll(async () => {
    delete process.env.SCHEDULER_ENABLED;
    await app.close();
  });

  it('dispara lembretes de TODAS as barbearias num único ciclo', async () => {
    const pendentes = async (token: string) =>
      (await request(app.getHttpServer())
        .get(mk('/notifications?status=QUEUED')).set(authHeader(token)).expect(200)
      ).body.length;

    expect(await pendentes(tokenA)).toBeGreaterThan(0);
    expect(await pendentes(tokenB)).toBeGreaterThan(0);

    await scheduler.dispatchReminders();

    // As duas barbearias foram atendidas pelo mesmo ciclo — sem ninguém
    // clicar em "disparar" barbearia por barbearia.
    expect(await pendentes(tokenA)).toBe(0);
    expect(await pendentes(tokenB)).toBe(0);
  });

  it('não faz nada quando o agendador está desligado', async () => {
    process.env.SCHEDULER_ENABLED = 'false';
    // Não deve lançar nem processar.
    await expect(scheduler.dispatchReminders()).resolves.toBeUndefined();
    process.env.SCHEDULER_ENABLED = 'true';
  });

  it('suspende quem ASSINOU o teste e venceu; mantém quem está em dia', async () => {
    const plano = (await request(app.getHttpServer())
      .get(mk('/billing/plans')).set(authHeader(tokenA)).expect(200)).body[0];

    // As duas assinam o teste...
    for (const t of [tokenA, tokenB]) {
      await request(app.getHttpServer())
        .post(mk('/billing/subscribe')).set(authHeader(t))
        .send({ planId: plano.id }).expect(201);
    }
    // ...mas o de A venceu ontem e o de B vence daqui a 10 dias.
    await system.subscription.updateMany({
      where: { tenantId: tenantA },
      data: { status: 'TRIALING', trialEndsAt: new Date(Date.now() - 86_400_000) },
    });
    await system.subscription.updateMany({
      where: { tenantId: tenantB },
      data: { status: 'TRIALING', trialEndsAt: new Date(Date.now() + 10 * 86_400_000) },
    });
    // `subscribe` pode ativar o tenant; volta para TRIAL p/ testar a expiração.
    await system.tenant.updateMany({
      where: { id: { in: [tenantA, tenantB] } },
      data: { status: 'TRIAL' },
    });

    await scheduler.expireTrials();

    const a = await system.tenant.findUnique({ where: { id: tenantA }, select: { status: true } });
    const b = await system.tenant.findUnique({ where: { id: tenantB }, select: { status: true } });
    expect(a?.status).toBe('SUSPENDED');
    expect(b?.status).toBe('TRIAL'); // em dia, segue usando
  });

  it('suspende quem NUNCA assinou e passou do período de teste', async () => {
    // Caso real: cadastro self-service que nunca tocou em billing — não tem
    // `trialEndsAt`, então o prazo conta da criação da barbearia.
    const semAssinatura = await setupBarbearia(`sched-c-${s}`);
    await system.tenant.update({
      where: { id: semAssinatura.tenantId },
      data: { createdAt: new Date(Date.now() - 30 * 86_400_000) }, // 30 dias atrás
    });

    await scheduler.expireTrials();

    const c = await system.tenant.findUnique({
      where: { id: semAssinatura.tenantId },
      select: { status: true },
    });
    expect(c?.status).toBe('SUSPENDED');
  });

  it('não suspende cadastro recente sem assinatura', async () => {
    const novo = await setupBarbearia(`sched-d-${s}`);
    await scheduler.expireTrials();
    const d = await system.tenant.findUnique({
      where: { id: novo.tenantId },
      select: { status: true },
    });
    expect(d?.status).toBe('TRIAL');
  });

  it('barbearia suspensa por trial vencido recebe 402 na API', async () => {
    await request(app.getHttpServer())
      .get(mk('/clients')).set(authHeader(tokenA)).expect(402);
    // a que está em dia continua funcionando
    await request(app.getHttpServer())
      .get(mk('/clients')).set(authHeader(tokenB)).expect(200);
  });

  it('expirar trial é idempotente (rodar de novo não muda nada)', async () => {
    await scheduler.expireTrials();
    const a = await system.tenant.findUnique({ where: { id: tenantA }, select: { status: true } });
    expect(a?.status).toBe('SUSPENDED');
  });
});
