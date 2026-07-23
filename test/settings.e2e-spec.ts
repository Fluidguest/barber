import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { bootstrap, registerTenant, authHeader } from './helpers';

/**
 * Configurações por tenant: admin edita; token cifrado no banco e mascarado na
 * API; RBAC (não-admin bloqueado); isolamento.
 */
describe('Configurações / integrações (e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  const s = Date.now();
  const mk = (p: string) => `/api${p}`;
  const auth = authHeader;
  const slug = `set-${s}`;
  let adminToken: string;
  let tokenB: string;

  beforeAll(async () => {
    app = await bootstrap();
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    adminToken = await registerTenant(app, slug, `admin-${s}@x.com`);
    tokenB = await registerTenant(app, `set-b-${s}`, `b-${s}@x.com`);
  });

  afterAll(async () => {
    await owner.$disconnect();
    await app.close();
  });

  it('admin lê defaults', async () => {
    const r = await request(app.getHttpServer())
      .get(mk('/settings')).set(auth(adminToken)).expect(200);
    expect(r.body.whatsappProvider).toBe('fake');
    expect(r.body.metaTokenSet).toBe(false);
  });

  it('admin salva token do WhatsApp; API devolve mascarado', async () => {
    const r = await request(app.getHttpServer())
      .put(mk('/settings')).set(auth(adminToken))
      .send({ whatsappProvider: 'meta', metaToken: 'EAAG-super-secret', metaPhoneId: '123456' })
      .expect(200);
    expect(r.body.whatsappProvider).toBe('meta');
    expect(r.body.metaPhoneId).toBe('123456');
    expect(r.body.metaTokenSet).toBe(true);
    expect(JSON.stringify(r.body)).not.toContain('EAAG-super-secret'); // secret não vaza
  });

  it('o token fica CIFRADO no banco', async () => {
    const rows = await owner.$queryRawUnsafe<{ meta_token: string }[]>(
      `SELECT ts.meta_token FROM tenant_settings ts JOIN tenants t ON t.id=ts.tenant_id WHERE t.slug='${slug}' LIMIT 1`,
    );
    expect(rows[0].meta_token).toMatch(/^enc:v1:/);
    expect(rows[0].meta_token).not.toContain('EAAG-super-secret');
  });

  it('omitir o token mantém o valor atual (write-only)', async () => {
    await request(app.getHttpServer())
      .put(mk('/settings')).set(auth(adminToken))
      .send({ metaPhoneId: '999' }).expect(200);
    const r = await request(app.getHttpServer())
      .get(mk('/settings')).set(auth(adminToken)).expect(200);
    expect(r.body.metaPhoneId).toBe('999');
    expect(r.body.metaTokenSet).toBe(true); // token preservado
  });

  it('RBAC: não-admin não acessa configurações (403)', async () => {
    await request(app.getHttpServer())
      .post(mk('/users')).set(auth(adminToken))
      .send({ name: 'Recep', email: `r-${s}@x.com`, password: 'password123', role: 'RECEPTION' })
      .expect(201);
    const rTok = (await request(app.getHttpServer())
      .post(mk('/auth/login')).send({ slug, email: `r-${s}@x.com`, password: 'password123' }).expect(201)).body.accessToken;
    await request(app.getHttpServer()).get(mk('/settings')).set(auth(rTok)).expect(403);
    await request(app.getHttpServer()).put(mk('/settings')).set(auth(rTok)).send({ whatsappProvider: 'fake' }).expect(403);
  });

  it('isolamento: B tem suas próprias configs (não as de A)', async () => {
    const r = await request(app.getHttpServer())
      .get(mk('/settings')).set(auth(tokenB)).expect(200);
    expect(r.body.whatsappProvider).toBe('fake'); // default, não "meta" de A
    expect(r.body.metaTokenSet).toBe(false);
  });
});
