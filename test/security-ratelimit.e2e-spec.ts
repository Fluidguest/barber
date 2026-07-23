import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Rate limiting (anti brute-force / abuso). Liga o throttle com limite baixo
 * ANTES de compilar o módulo e verifica o 429.
 */
describe('Segurança: rate limiting (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.THROTTLE_DISABLED = 'false';
    process.env.THROTTLE_LIMIT = '5';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    process.env.THROTTLE_DISABLED = 'true';
    await app.close();
  });

  it('bloqueia com 429 após exceder o limite de requisições', async () => {
    const server = app.getHttpServer();
    let got429 = false;
    // limite = 5/min; a 6ª+ deve retornar 429
    for (let i = 0; i < 8; i++) {
      const res = await request(server).get('/api/health');
      if (res.status === 429) got429 = true;
    }
    expect(got429).toBe(true);
  });
});
