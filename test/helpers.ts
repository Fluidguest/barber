import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Helpers de e2e — use em novos testes para evitar boilerplate e erros de
 * payload (ex.: barbershopName com menos de 2 chars).
 */
export async function bootstrap(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  return app;
}

/** Registra um tenant e devolve o accessToken do admin. */
export async function registerTenant(
  app: INestApplication,
  slug: string,
  email = `${slug}@x.com`,
): Promise<string> {
  const r = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({
      barbershopName: `Barbearia ${slug}`,
      slug,
      adminName: 'Admin Teste',
      email,
      password: 'password123',
    })
    .expect(201);
  return r.body.accessToken as string;
}

export const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Payload de barbeiro VÁLIDO (o cadastro exige CPF válido, endereço completo e
 * nascimento). Use `barberPayload('Nome', { ...overrides })` nos testes.
 * CPF 111.444.777-35 é válido pelos dígitos verificadores.
 */
export function barberPayload(name = 'Barbeiro Teste', overrides: Record<string, unknown> = {}) {
  return {
    name,
    document: '111.444.777-35',
    birthDate: '1990-01-15',
    address: {
      zip: '01001-000',
      street: 'Rua Teste',
      number: '100',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
    },
    ...overrides,
  };
}

/** Cria um barbeiro válido e devolve o body. */
export async function createBarber(
  app: INestApplication,
  token: string,
  name = 'Barbeiro Teste',
  overrides: Record<string, unknown> = {},
) {
  const r = await request(app.getHttpServer())
    .post('/api/barbers')
    .set(authHeader(token))
    .send(barberPayload(name, overrides))
    .expect(201);
  return r.body;
}
