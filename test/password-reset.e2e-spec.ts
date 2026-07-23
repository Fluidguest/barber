import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bootstrap } from './helpers';
import { FakeMailProvider } from '../src/mail/fake-mail.provider';

/**
 * "Esqueci minha senha": token por e-mail, uso único, expiração, revogação de
 * sessões e não-enumeração de contas.
 */
describe('Reset de senha (e2e)', () => {
  let app: INestApplication;
  const s = Date.now();
  const slug = `reset-${s}`;
  const email = `${slug}@x.com`;
  const mk = (p: string) => `/api${p}`;

  beforeAll(async () => {
    app = await bootstrap();
    await request(app.getHttpServer())
      .post(mk('/auth/register'))
      .send({
        barbershopName: `Barbearia ${slug}`,
        slug,
        adminName: 'Admin',
        email,
        password: 'senhaAntiga123',
      })
      .expect(201);
  });
  afterAll(async () => {
    await app.close();
  });

  /** Extrai o token do link presente no e-mail "enviado". */
  function tokenFromOutbox(): string {
    const msg = FakeMailProvider.outbox[0];
    const m = msg?.text.match(/reset-password\?token=([^\s]+)/);
    if (!m) throw new Error('token não encontrado no e-mail');
    return decodeURIComponent(m[1]);
  }

  it('pedido de reset envia e-mail e responde 204', async () => {
    FakeMailProvider.outbox.length = 0;
    await request(app.getHttpServer())
      .post(mk('/auth/forgot-password'))
      .send({ slug, email })
      .expect(204);

    expect(FakeMailProvider.outbox).toHaveLength(1);
    expect(FakeMailProvider.outbox[0].to).toBe(email);
  });

  it('não revela contas inexistentes (204 e nenhum e-mail)', async () => {
    FakeMailProvider.outbox.length = 0;
    await request(app.getHttpServer())
      .post(mk('/auth/forgot-password'))
      .send({ slug, email: `nao-existe-${s}@x.com` })
      .expect(204);
    expect(FakeMailProvider.outbox).toHaveLength(0);

    // slug inexistente também responde 204
    await request(app.getHttpServer())
      .post(mk('/auth/forgot-password'))
      .send({ slug: `nao-existe-${s}`, email })
      .expect(204);
  });

  it('token inválido → 400', async () => {
    await request(app.getHttpServer())
      .post(mk('/auth/reset-password'))
      .send({ token: 'lixo.invalido', password: 'novaSenha123' })
      .expect(400);
  });

  it('senha curta → 400', async () => {
    FakeMailProvider.outbox.length = 0;
    await request(app.getHttpServer())
      .post(mk('/auth/forgot-password'))
      .send({ slug, email })
      .expect(204);
    await request(app.getHttpServer())
      .post(mk('/auth/reset-password'))
      .send({ token: tokenFromOutbox(), password: 'curta' })
      .expect(400);
  });

  it('redefine a senha, invalida a antiga e o token é de uso único', async () => {
    FakeMailProvider.outbox.length = 0;
    await request(app.getHttpServer())
      .post(mk('/auth/forgot-password'))
      .send({ slug, email })
      .expect(204);
    const token = tokenFromOutbox();

    await request(app.getHttpServer())
      .post(mk('/auth/reset-password'))
      .send({ token, password: 'senhaNova456' })
      .expect(204);

    // senha antiga não serve mais
    await request(app.getHttpServer())
      .post(mk('/auth/login'))
      .send({ slug, email, password: 'senhaAntiga123' })
      .expect(401);

    // senha nova funciona
    await request(app.getHttpServer())
      .post(mk('/auth/login'))
      .send({ slug, email, password: 'senhaNova456' })
      .expect(201);

    // token não pode ser reusado
    await request(app.getHttpServer())
      .post(mk('/auth/reset-password'))
      .send({ token, password: 'outraSenha789' })
      .expect(400);
  });

  it('reset revoga as sessões ativas do usuário', async () => {
    // sessão viva antes do reset
    const login = await request(app.getHttpServer())
      .post(mk('/auth/login'))
      .send({ slug, email, password: 'senhaNova456' })
      .expect(201);
    const refreshToken = login.body.refreshToken as string;

    FakeMailProvider.outbox.length = 0;
    await request(app.getHttpServer())
      .post(mk('/auth/forgot-password'))
      .send({ slug, email })
      .expect(204);
    await request(app.getHttpServer())
      .post(mk('/auth/reset-password'))
      .send({ token: tokenFromOutbox(), password: 'senhaFinal789' })
      .expect(204);

    // o refresh emitido antes do reset morreu
    await request(app.getHttpServer())
      .post(mk('/auth/refresh'))
      .send({ refreshToken })
      .expect(401);
  });
});
