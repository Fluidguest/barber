import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { captureError } from './sentry';

/**
 * Filtro global de exceção — dá um shape ÚNICO a todo erro que chega ao cliente
 * e evita vazar stack/detalhes internos (500 vira mensagem genérica).
 *
 * Formato de resposta:
 *   { statusCode, error, message, path, timestamp, requestId? }
 *
 * - HttpException: repassa status e mensagem (as validações do class-validator
 *   caem aqui com 400 e a lista de mensagens).
 * - Erros conhecidos do Prisma: mapeados para status HTTP adequados.
 * - Qualquer outro: 500 genérico, com o erro real apenas no log do servidor.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Erro interno do servidor';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        message = (b.message as string | string[]) ?? exception.message;
        error = (b.error as string) ?? error;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      ({ status, message, error } = mapPrismaError(exception));
    }

    // Log completo fica só no servidor. 5xx com stack; 4xx em nível baixo.
    const requestId = (req.headers['x-request-id'] as string) || undefined;
    const logCtx = `${req.method} ${req.url}${requestId ? ` [${requestId}]` : ''}`;
    if (status >= 500) {
      this.logger.error(logCtx, (exception as Error)?.stack ?? String(exception));
      // Sentry: só erros de servidor (5xx). 4xx são "culpa do cliente" e não
      // devem gerar alerta. No-op se o Sentry não estiver configurado.
      const who = (req as Request & { user?: { tenantId?: string; userId?: string; role?: string } }).user;
      captureError(exception, { requestId, method: req.method, url: req.url, who });
    } else {
      this.logger.warn(`${logCtx} → ${status} ${JSON.stringify(message)}`);
    }

    res.status(status).json({
      statusCode: status,
      error,
      message,
      path: req.url,
      timestamp: new Date().toISOString(),
      ...(requestId ? { requestId } : {}),
    });
  }
}

function mapPrismaError(e: Prisma.PrismaClientKnownRequestError): {
  status: number;
  message: string;
  error: string;
} {
  switch (e.code) {
    case 'P2002': // violação de unicidade
      return {
        status: HttpStatus.CONFLICT,
        message: 'Registro já existe (violação de unicidade).',
        error: 'Conflict',
      };
    case 'P2025': // registro não encontrado
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'Registro não encontrado.',
        error: 'Not Found',
      };
    case 'P2003': // violação de FK
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Referência inválida (chave estrangeira).',
        error: 'Bad Request',
      };
    default:
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Erro interno do servidor',
        error: 'Internal Server Error',
      };
  }
}
