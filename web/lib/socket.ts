"use client";

import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { API_BASE, getToken } from "@/lib/api";

/**
 * Conexão realtime (Socket.io) com o backend.
 *
 * O servidor coloca o socket na sala da própria barbearia (pelo token), então o
 * front só recebe eventos do seu tenant — o isolamento é garantido no servidor.
 */
const ORIGIN = API_BASE.replace(/\/api$/, "");

/**
 * Hook que assina um evento realtime enquanto o componente estiver montado.
 * Reconecta sozinho e limpa ao desmontar.
 *
 * @param event nome do evento (ex.: "whatsapp:message")
 * @param handler callback chamado a cada evento; use useCallback para estabilizar
 */
export function useRealtime<T = unknown>(
  event: string,
  handler: (payload: T) => void,
) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const socket = io(`${ORIGIN}/realtime`, {
      auth: { token },
      transports: ["websocket"],
    });
    socketRef.current = socket;
    socket.on(event, handler);

    return () => {
      socket.off(event, handler);
      socket.disconnect();
    };
    // handler deve ser estável (useCallback) para não reconectar a cada render
  }, [event, handler]);
}
