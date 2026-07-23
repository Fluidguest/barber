import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bootstrap, registerTenant, authHeader } from './helpers';

/**
 * WhatsApp / Inbox (Fase 1): enviar texto, listar conversas/thread, receber
 * (simulado + webhook com mapeamento de número), marcar lido, isolamento.
 */
describe('WhatsApp inbox (e2e)', () => {
  let app: INestApplication;
  const s = Date.now();
  const mk = (p: string) => `/api${p}`;
  const auth = authHeader;

  let tokenA: string;
  let tokenB: string;
  let convId: string;
  const phoneNumberId = `pnid-${s}`;

  beforeAll(async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = 'verify-123';
    app = await bootstrap();
    tokenA = await registerTenant(app, `wa-a-${s}`, `a-${s}@x.com`);
    tokenB = await registerTenant(app, `wa-b-${s}`, `b-${s}@x.com`);
  });

  afterAll(async () => { await app.close(); });

  it('envia texto (cria conversa) e aparece na thread', async () => {
    const sent = await request(app.getHttpServer())
      .post(mk('/whatsapp/messages')).set(auth(tokenA))
      .send({ to: '5511999990000', body: 'Olá! Seu horário está confirmado?' })
      .expect(201);
    expect(sent.body.direction).toBe('OUTBOUND');
    expect(sent.body.status).toBe('SENT'); // fake provider

    const convos = await request(app.getHttpServer())
      .get(mk('/whatsapp/conversations')).set(auth(tokenA)).expect(200);
    expect(convos.body).toHaveLength(1);
    convId = convos.body[0].id;
    expect(convos.body[0].contactPhone).toBe('5511999990000');

    const thread = await request(app.getHttpServer())
      .get(mk(`/whatsapp/conversations/${convId}`)).set(auth(tokenA)).expect(200);
    expect(thread.body.messages).toHaveLength(1);
  });

  it('recebe mensagem (simulada) → incrementa não lidas', async () => {
    await request(app.getHttpServer())
      .post(mk('/whatsapp/simulate-inbound')).set(auth(tokenA))
      .send({ from: '5511999990000', name: 'Cliente', body: 'Sim, confirmado!' })
      .expect(201);

    const thread = await request(app.getHttpServer())
      .get(mk(`/whatsapp/conversations/${convId}`)).set(auth(tokenA)).expect(200);
    expect(thread.body.messages).toHaveLength(2);
    expect(thread.body.unreadCount).toBeGreaterThanOrEqual(1);
    const inbound = thread.body.messages.find((m: any) => m.direction === 'INBOUND');
    expect(inbound.body).toBe('Sim, confirmado!');
  });

  it('marcar como lida zera o contador', async () => {
    await request(app.getHttpServer())
      .post(mk(`/whatsapp/conversations/${convId}/read`)).set(auth(tokenA)).expect(201);
    const thread = await request(app.getHttpServer())
      .get(mk(`/whatsapp/conversations/${convId}`)).set(auth(tokenA)).expect(200);
    expect(thread.body.unreadCount).toBe(0);
  });

  it('webhook: verificação (GET) responde o challenge', async () => {
    const r = await request(app.getHttpServer())
      .get(mk('/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-123&hub.challenge=987654'))
      .expect(200);
    expect(r.text).toBe('987654');
  });

  it('webhook: mensagem recebida entra na conversa do tenant do número', async () => {
    // A registra seu número
    await request(app.getHttpServer())
      .post(mk('/whatsapp/numbers')).set(auth(tokenA))
      .send({ phoneNumberId, label: 'Principal' }).expect(201);

    // Meta envia um payload para esse número
    await request(app.getHttpServer())
      .post(mk('/whatsapp/webhook'))
      .send({
        entry: [{
          changes: [{
            value: {
              metadata: { phone_number_id: phoneNumberId },
              contacts: [{ profile: { name: 'Novo Contato' } }],
              messages: [{ from: '5511777776666', id: 'wamid.abc', type: 'text', text: { body: 'Tem horário amanhã?' } }],
            },
          }],
        }],
      })
      .expect(201);

    const convos = await request(app.getHttpServer())
      .get(mk('/whatsapp/conversations')).set(auth(tokenA)).expect(200);
    const nova = convos.body.find((c: any) => c.contactPhone === '5511777776666');
    expect(nova).toBeTruthy();
    expect(nova.contactName).toBe('Novo Contato');
  });

  it('isolamento: B não vê conversas de A', async () => {
    const convos = await request(app.getHttpServer())
      .get(mk('/whatsapp/conversations')).set(auth(tokenB)).expect(200);
    expect(convos.body).toHaveLength(0);
    await request(app.getHttpServer())
      .get(mk(`/whatsapp/conversations/${convId}`)).set(auth(tokenB)).expect(404);
  });
});
