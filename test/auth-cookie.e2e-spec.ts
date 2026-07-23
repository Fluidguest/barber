import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bootstrap } from './helpers';

/**
 * Segurança da sessão: o refresh token deve viver num cookie httpOnly
 * (resistente a XSS), o refresh deve funcionar via cookie, e o logout deve
 * revogá-lo.
 */
describe('Auth — refresh cookie httpOnly (e2e)', () => {
  let app: INestApplication;
  const s = Date.now();
  const slug = `cookie-${s}`;

  beforeAll(async () => {
    app = await bootstrap();
  });
  afterAll(async () => {
    await app.close();
  });

  function refreshCookie(setCookie: string[] | undefined): string | undefined {
    return (setCookie ?? []).find((c) => c.startsWith('refresh_token='));
  }

  it('register seta cookie refresh_token httpOnly', async () => {
    const r = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        barbershopName: `Barbearia ${slug}`,
        slug,
        adminName: 'Admin',
        email: `${slug}@x.com`,
        password: 'password123',
      })
      .expect(201);

    const cookie = refreshCookie(r.headers['set-cookie'] as unknown as string[]);
    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/auth');
    expect(r.body.accessToken).toBeTruthy();
  });

  it('refresh funciona apenas com o cookie (sem body)', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ slug, email: `${slug}@x.com`, password: 'password123' })
      .expect(201);
    const cookie = refreshCookie(login.headers['set-cookie'] as unknown as string[])!;

    const refreshed = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookie.split(';')[0]) // só o par nome=valor
      .send({})
      .expect(201);

    expect(refreshed.body.accessToken).toBeTruthy();
    // rotação: emite um novo cookie
    expect(refreshCookie(refreshed.headers['set-cookie'] as unknown as string[])).toBeDefined();
  });

  it('refresh sem cookie e sem body → 401', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({})
      .expect(401);
  });

  it('logout revoga o refresh (novo refresh com o mesmo cookie → 401)', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ slug, email: `${slug}@x.com`, password: 'password123' })
      .expect(201);
    const cookie = refreshCookie(login.headers['set-cookie'] as unknown as string[])!;
    const cookiePair = cookie.split(';')[0];

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', cookiePair)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookiePair)
      .send({})
      .expect(401);
  });
});
