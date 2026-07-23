import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bootstrap, registerTenant, authHeader } from './helpers';

/**
 * Usuários e Permissões: CRUD (admin), RBAC (não-admin bloqueado),
 * trava do último administrador e isolamento.
 */
describe('Usuários e Permissões (e2e)', () => {
  let app: INestApplication;
  const s = Date.now();
  const mk = (p: string) => `/api${p}`;
  const auth = authHeader;

  const slug = `usr-${s}`;
  let adminToken: string;
  let adminId: string;
  let receptionId: string;
  let receptionToken: string;
  let tokenB: string;

  beforeAll(async () => {
    app = await bootstrap();
    adminToken = await registerTenant(app, slug, `admin-${s}@x.com`);
    tokenB = await registerTenant(app, `usr-b-${s}`, `b-${s}@x.com`);
    adminId = (await request(app.getHttpServer()).get(mk('/auth/me')).set(auth(adminToken)).expect(200)).body.id;
  });

  afterAll(async () => { await app.close(); });

  it('admin cadastra um usuário (recepção)', async () => {
    const r = await request(app.getHttpServer())
      .post(mk('/users')).set(auth(adminToken))
      .send({ name: 'Maria Recepção', email: `maria-${s}@x.com`, password: 'password123', role: 'RECEPTION' })
      .expect(201);
    receptionId = r.body.id;
    expect(r.body.role).toBe('RECEPTION');
  });

  it('o novo usuário consegue logar', async () => {
    const r = await request(app.getHttpServer())
      .post(mk('/auth/login')).send({ slug, email: `maria-${s}@x.com`, password: 'password123' }).expect(201);
    receptionToken = r.body.accessToken;
  });

  it('RBAC: recepção NÃO acessa gestão de usuários (403)', async () => {
    await request(app.getHttpServer()).get(mk('/users')).set(auth(receptionToken)).expect(403);
    await request(app.getHttpServer())
      .post(mk('/users')).set(auth(receptionToken))
      .send({ name: 'x', email: `y-${s}@x.com`, password: 'password123', role: 'ADMIN' })
      .expect(403);
  });

  it('admin promove a recepção a gerente', async () => {
    const r = await request(app.getHttpServer())
      .patch(mk(`/users/${receptionId}`)).set(auth(adminToken))
      .send({ role: 'MANAGER' }).expect(200);
    expect(r.body.role).toBe('MANAGER');
  });

  it('trava: admin não pode rebaixar/desativar o último administrador', async () => {
    await request(app.getHttpServer())
      .patch(mk(`/users/${adminId}`)).set(auth(adminToken))
      .send({ role: 'RECEPTION' }).expect(400);
    await request(app.getHttpServer())
      .patch(mk(`/users/${adminId}`)).set(auth(adminToken))
      .send({ isActive: false }).expect(400);
  });

  it('admin lista os usuários do tenant', async () => {
    const r = await request(app.getHttpServer()).get(mk('/users')).set(auth(adminToken)).expect(200);
    expect(r.body.length).toBe(2); // admin + maria
  });

  it('isolamento: tenant B não vê usuários de A', async () => {
    const r = await request(app.getHttpServer()).get(mk('/users')).set(auth(tokenB)).expect(200);
    expect(r.body).toHaveLength(1); // só o próprio admin de B
    expect(r.body.map((u: any) => u.id)).not.toContain(receptionId);
  });
});
