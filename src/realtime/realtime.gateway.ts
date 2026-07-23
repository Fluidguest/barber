import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import { RealtimeService, tenantRoom } from './realtime.service';

/**
 * Gateway WebSocket (Socket.io).
 *
 * Segurança multi-tenant na conexão:
 *  1. o cliente manda o MESMO access token do REST em `auth.token`;
 *  2. validamos o JWT — token inválido/ausente derruba o socket na hora;
 *  3. o socket entra APENAS na sala do seu `tenantId` (`tenant:<id>`).
 *
 * Como só emitimos para salas de tenant (ver RealtimeService), um socket nunca
 * recebe evento de outra barbearia — o isolamento do REST vale aqui também.
 *
 * O token de PLATAFORMA (sem `tenantId`) não entra: não tem sala para ele.
 */
@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: (process.env.CORS_ORIGIN ?? '').split(',').map((o) => o.trim()).filter(Boolean), credentials: true },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger('RealtimeGateway');

  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(server: Server) {
    this.realtime.bind(server);
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ??
        // fallback: querystring (?token=) para clientes que não usam auth
        (client.handshake.query?.token as string | undefined);
      if (!token) throw new Error('sem token');

      const payload = await this.jwt.verifyAsync(token);
      if (!payload.tenantId) throw new Error('token sem tenant');

      // O socket só enxerga a própria barbearia.
      await client.join(tenantRoom(payload.tenantId));
      client.data.tenantId = payload.tenantId;
    } catch {
      // Não damos detalhe do motivo (evita sondagem). Só desconecta.
      client.disconnect(true);
    }
  }
}
