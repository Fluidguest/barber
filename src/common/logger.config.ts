import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';

/**
 * Logging estruturado (pino).
 *
 * Por quê: em produção multi-tenant, log em texto solto é inútil. Aqui cada
 * linha é JSON com `reqId`, `tenantId` e `userId` — dá para rastrear uma
 * requisição inteira e filtrar por barbearia no agregador (Loki/Datadog/CW).
 *
 * - **reqId**: reusa o header `x-request-id` (se vier de um proxy/load balancer)
 *   ou gera um UUID; devolve no response para o cliente correlacionar.
 * - **Redação**: token, cookie, senha e CPF NUNCA vão para o log.
 * - **Dev**: saída colorida e legível (`pino-pretty`). **Prod**: JSON puro.
 * - **Teste**: silencioso, para não poluir a saída do Jest.
 */

const isProd = () => process.env.NODE_ENV === 'production';
const isTest = () =>
  process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;

function level(): string {
  if (isTest()) return 'silent';
  return process.env.LOG_LEVEL ?? (isProd() ? 'info' : 'debug');
}

export const loggerParams: Params = {
  pinoHttp: {
    level: level(),

    // Correlação: honra o id vindo do proxy; senão gera um.
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const existing = req.headers['x-request-id'];
      const id = (Array.isArray(existing) ? existing[0] : existing) || randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },

    // Contexto de negócio: quem fez a chamada e de qual barbearia.
    customProps: (req: IncomingMessage) => {
      const user = (req as any).user;
      return user
        ? { tenantId: user.tenantId, userId: user.userId, role: user.role }
        : {};
    },

    // Nunca logar segredo/PII.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        'req.body.password',
        'req.body.currentPassword',
        'req.body.newPassword',
        'req.body.document',
        'req.body.code',
        'req.body.token',
      ],
      remove: true,
    },

    // Log enxuto: sem despejar todos os headers.
    serializers: {
      req(req: any) {
        return { id: req.id, method: req.method, url: req.url };
      },
      res(res: any) {
        return { statusCode: res.statusCode };
      },
    },

    // Health check não polui o log.
    autoLogging: {
      ignore: (req: IncomingMessage) => req.url === '/api/health',
    },

    // Dev: legível. Prod: JSON de uma linha (o agregador parseia).
    transport:
      !isProd() && !isTest()
        ? {
            target: 'pino-pretty',
            options: {
              singleLine: true,
              translateTime: 'SYS:HH:MM:ss',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
  },
};
