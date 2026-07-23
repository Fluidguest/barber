import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { authenticator } from 'otplib';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * 2FA (TOTP): setup → enable → login exige código → disable.
 * Também verifica que o segredo TOTP fica CIFRADO no banco.
 */
describe('2FA / TOTP (e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  const s = Date.now();
  const mk = (p: string) => `/api${p}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  const slug = `tfa-${s}`;
  const email = `a-${s}@x.com`;
  const password = 'password123';
  let token: string;
  let secret: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

    const reg = await request(app.getHttpServer())
      .post(mk('/auth/register'))
      .send({ barbershopName: 'Barb 2FA', slug, adminName: 'Admin Teste', email, password })
      .expect(201);
    token = reg.body.accessToken;
  });

  afterAll(async () => {
    await owner.$disconnect();
    await app.close();
  });

  it('setup gera segredo e otpauth URL', async () => {
    const r = await request(app.getHttpServer())
      .post(mk('/auth/2fa/setup')).set(auth(token)).expect(201);
    expect(r.body.secret).toBeTruthy();
    expect(r.body.otpauthUrl).toContain('otpauth://');
    secret = r.body.secret;
  });

  it('o segredo TOTP está CIFRADO no banco', async () => {
    const rows = await owner.$queryRawUnsafe<{ totp_secret: string }[]>(
      `SELECT totp_secret FROM users WHERE email = '${email}' LIMIT 1`,
    );
    expect(rows[0].totp_secret).toMatch(/^enc:v1:/);
    expect(rows[0].totp_secret).not.toContain(secret);
  });

  it('enable com código válido ativa o 2FA', async () => {
    const r = await request(app.getHttpServer())
      .post(mk('/auth/2fa/enable')).set(auth(token))
      .send({ code: authenticator.generate(secret) }).expect(201);
    expect(r.body.enabled).toBe(true);
  });

  it('login SEM código agora falha (401)', async () => {
    await request(app.getHttpServer())
      .post(mk('/auth/login')).send({ slug, email, password }).expect(401);
  });

  it('login com código TOTP válido funciona', async () => {
    const r = await request(app.getHttpServer())
      .post(mk('/auth/login'))
      .send({ slug, email, password, code: authenticator.generate(secret) })
      .expect(201);
    expect(r.body.accessToken).toBeTruthy();
  });

  it('login com código errado falha (401)', async () => {
    await request(app.getHttpServer())
      .post(mk('/auth/login'))
      .send({ slug, email, password, code: '000000' }).expect(401);
  });

  it('disable desativa o 2FA e volta a logar sem código', async () => {
    await request(app.getHttpServer())
      .post(mk('/auth/2fa/disable')).set(auth(token))
      .send({ code: authenticator.generate(secret) }).expect(201);
    await request(app.getHttpServer())
      .post(mk('/auth/login')).send({ slug, email, password }).expect(201);
  });
});
