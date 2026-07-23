import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Clientes: cadastro completo + CPF cifrado em repouso (LGPD) + isolamento.
 */
describe('Clientes / LGPD (e2e)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  const s = Date.now();
  const mk = (p: string) => `/api${p}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  let token: string;
  const CPF = '39053344705';

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
      .send({ barbershopName: 'Barb Cli', slug: `cli-${s}`, adminName: 'Admin Teste', email: `a-${s}@x.com`, password: 'password123' })
      .expect(201);
    token = reg.body.accessToken;
  });

  afterAll(async () => {
    await owner.$disconnect();
    await app.close();
  });

  it('cadastra cliente com CPF e endereço; a API devolve o CPF em claro', async () => {
    const created = await request(app.getHttpServer())
      .post(mk('/clients')).set(auth(token))
      .send({
        name: 'João da Silva',
        document: CPF,
        birthDate: '1990-05-20',
        address: { city: 'Sao Paulo', state: 'SP' },
      })
      .expect(201);
    expect(created.body.document).toBe(CPF);

    const got = await request(app.getHttpServer())
      .get(mk(`/clients/${created.body.id}`)).set(auth(token)).expect(200);
    expect(got.body.document).toBe(CPF);
    expect(got.body.address.city).toBe('Sao Paulo');
  });

  it('no banco, o CPF está CIFRADO (não em texto puro)', async () => {
    const rows = await owner.$queryRawUnsafe<{ document: string }[]>(
      `SELECT document FROM clients WHERE name = 'João da Silva' LIMIT 1`,
    );
    const raw = rows[0].document;
    expect(raw).toMatch(/^enc:v1:/); // formato cifrado
    expect(raw).not.toContain(CPF); // o CPF não aparece em claro
  });
});
