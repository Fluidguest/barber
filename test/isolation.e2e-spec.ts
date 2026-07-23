import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Teste de isolamento de tenant via HTTP real (DoD, ADR-001).
 * Prova que a barbearia B nunca vê/afeta dados da barbearia A, atravessando
 * toda a pilha: controller -> guard -> withTenant -> RLS do Postgres.
 */
describe('Isolamento de tenant (e2e)', () => {
  let app: INestApplication;
  const s = Date.now();

  const A = {
    barbershopName: 'Barbearia A',
    slug: `iso-a-${s}`,
    adminName: 'Ana Admin',
    email: `ana-${s}@a.com`,
    password: 'password123',
  };
  const B = {
    barbershopName: 'Barbearia B',
    slug: `iso-b-${s}`,
    adminName: 'Bento Admin',
    email: `bento-${s}@b.com`,
    password: 'password123',
  };

  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('cadastra as duas barbearias e faz login', async () => {
    const rA = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(A)
      .expect(201);
    tokenA = rA.body.accessToken;
    expect(tokenA).toBeDefined();
    expect(rA.body.refreshToken).toContain(rA.body.tenantId);

    const rB = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(B)
      .expect(201);
    tokenB = rB.body.accessToken;
    expect(tokenB).toBeDefined();
  });

  it('bloqueia acesso sem token', async () => {
    await request(app.getHttpServer()).get('/api/clients').expect(401);
  });

  it('cada barbearia cria o seu cliente', async () => {
    await request(app.getHttpServer())
      .post('/api/clients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Alice (de A)' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/clients')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Bruno (de B)' })
      .expect(201);
  });

  it('A só enxerga clientes de A; B só de B', async () => {
    const listA = await request(app.getHttpServer())
      .get('/api/clients')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const namesA = listA.body.map((c: any) => c.name);
    expect(namesA).toContain('Alice (de A)');
    expect(namesA).not.toContain('Bruno (de B)');

    const listB = await request(app.getHttpServer())
      .get('/api/clients')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    const namesB = listB.body.map((c: any) => c.name);
    expect(namesB).toContain('Bruno (de B)');
    expect(namesB).not.toContain('Alice (de A)');
  });

  it('/auth/me devolve o usuário do tenant correto', async () => {
    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(me.body.email).toBe(A.email);
    expect(me.body.role).toBe('ADMIN');
  });
});
