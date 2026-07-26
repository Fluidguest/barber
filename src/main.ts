import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { initSentry } from './common/sentry';

async function bootstrap() {
  // Sentry primeiro (antes de qualquer coisa que possa lançar). No-op sem DSN.
  initSentry();

  // bufferLogs: segura os logs do boot até o pino assumir, para nada sair
  // no formato antigo.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Todo log do Nest (inclusive o filtro de exceção) passa a sair pelo pino,
  // em JSON e com o reqId correlacionado.
  app.useLogger(app.get(Logger));

  app.use(helmet());

  // CORS restrito às origens do frontend (CSV em CORS_ORIGIN).
  // Sem a env, cai em localhost (dev). Em produção, defina CORS_ORIGIN.
  const origins = (process.env.CORS_ORIGIN ?? 'http://localhost:3100,http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins,
    credentials: true, // necessário p/ cookie httpOnly do refresh token
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // remove campos não declarados nos DTOs
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT ?? 3333);
  await app.listen(port);
  app.get(Logger).log(`API em http://localhost:${port}/api`);
}
bootstrap();

