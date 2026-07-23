import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bootstrap, registerTenant, authHeader } from './helpers';

/**
 * Storage: upload/download (tenant-scoped) + integração de mídia no WhatsApp.
 */
describe('Storage + mídia (e2e)', () => {
  let app: INestApplication;
  const s = Date.now();
  const mk = (p: string) => `/api${p}`;
  const auth = authHeader;

  let tokenA: string;
  let tokenB: string;
  let fileId: string;
  let signedPath: string;
  // PNG 1x1 (bytes reais)
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );

  beforeAll(async () => {
    app = await bootstrap();
    tokenA = await registerTenant(app, `sto-a-${s}`, `a-${s}@x.com`);
    tokenB = await registerTenant(app, `sto-b-${s}`, `b-${s}@x.com`);
  });

  afterAll(async () => { await app.close(); });

  it('faz upload e devolve id + url', async () => {
    const r = await request(app.getHttpServer())
      .post(mk('/storage/upload')).set(auth(tokenA))
      .attach('file', png, { filename: 'foto.png', contentType: 'image/png' })
      .expect(201);
    fileId = r.body.id;
    expect(r.body.url).toBe(`/api/storage/${fileId}`);
    expect(r.body.contentType).toBe('image/png');
  });

  it('baixa com header e nega sem autorização', async () => {
    const viaHeader = await request(app.getHttpServer())
      .get(mk(`/storage/${fileId}`)).set(auth(tokenA)).expect(200);
    expect(viaHeader.headers['content-type']).toContain('image/png');

    await request(app.getHttpServer())
      .get(mk(`/storage/${fileId}`)).expect(401);
  });

  it('access token na query NÃO autoriza mais (era vazamento em log/Referer)', async () => {
    await request(app.getHttpServer())
      .get(mk(`/storage/${fileId}?token=${tokenA}`)).expect(401);
  });

  it('isolamento: B não baixa arquivo de A (404)', async () => {
    await request(app.getHttpServer())
      .get(mk(`/storage/${fileId}`)).set(auth(tokenB)).expect(404);
  });

  it('envia a imagem numa conversa do WhatsApp', async () => {
    const sent = await request(app.getHttpServer())
      .post(mk('/whatsapp/messages')).set(auth(tokenA))
      .send({ to: '5511999990000', mediaId: fileId, body: 'Segue a foto' })
      .expect(201);
    expect(sent.body.contentType).toBe('IMAGE');
    expect(sent.body.mediaUrl).toBe(`/api/storage/${fileId}`);

    const convos = await request(app.getHttpServer())
      .get(mk('/whatsapp/conversations')).set(auth(tokenA)).expect(200);
    const conv = convos.body.find((c: any) => c.contactPhone === '5511999990000');
    const thread = await request(app.getHttpServer())
      .get(mk(`/whatsapp/conversations/${conv.id}`)).set(auth(tokenA)).expect(200);
    const media = thread.body.messages.find((m: any) => m.contentType === 'IMAGE');

    // A thread devolve a mídia com URL ASSINADA (para <img>/<audio>).
    expect(media.mediaUrl).toMatch(
      new RegExp(`^/api/storage/${fileId}\\?t=[^&]+&exp=\\d+&sig=.+$`),
    );
    signedPath = media.mediaUrl;
  });

  it('URL assinada baixa sem token; adulterada ou expirada → 401', async () => {
    // signedPath já vem com o prefixo /api
    // 1) a assinatura legítima funciona sem nenhum header
    const ok = await request(app.getHttpServer()).get(signedPath).expect(200);
    expect(ok.headers['content-type']).toContain('image/png');

    // 2) assinatura adulterada
    await request(app.getHttpServer())
      .get(signedPath.replace(/sig=.*/, 'sig=forjada'))
      .expect(401);

    // 3) trocar o tenant invalida (a assinatura cobre o tenant)
    await request(app.getHttpServer())
      .get(signedPath.replace(/t=[^&]+/, 't=outro-tenant'))
      .expect(401);

    // 4) expiração no passado
    await request(app.getHttpServer())
      .get(signedPath.replace(/exp=\d+/, 'exp=1'))
      .expect(401);
  });

  it('rejeita mensagem sem texto e sem mídia (400)', async () => {
    await request(app.getHttpServer())
      .post(mk('/whatsapp/messages')).set(auth(tokenA))
      .send({ to: '5511999990000' }).expect(400);
  });
});
