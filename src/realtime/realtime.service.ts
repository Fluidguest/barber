import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

/** Sala de um tenant. Todo socket autenticado entra só na sala do SEU tenant. */
export const tenantRoom = (tenantId: string) => `tenant:${tenantId}`;

/**
 * Emissor de eventos em tempo real. Fica separado do gateway para que qualquer
 * serviço (WhatsApp, agenda...) possa disparar um evento sem depender da
 * infraestrutura de socket — e sem risco de dependência circular.
 *
 * REGRA DE OURO multi-tenant: só emitimos para a **sala do tenant**. Nunca um
 * broadcast global — senão a barbearia A veria evento da barbearia B.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger('Realtime');
  private server?: Server;

  /** Chamado pelo gateway quando o servidor de socket sobe. */
  bind(server: Server) {
    this.server = server;
  }

  /** Envia um evento apenas para os sockets daquela barbearia. */
  emitToTenant(tenantId: string, event: string, payload: unknown) {
    if (!this.server || !tenantId) return; // sem socket (ex.: testes) → no-op
    this.server.to(tenantRoom(tenantId)).emit(event, payload);
  }
}
