"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, uploadFile, mediaSrc } from "@/lib/api";
import { useRealtime } from "@/lib/socket";

interface Conversation {
  id: string;
  contactPhone: string;
  contactName: string | null;
  unreadCount: number;
  lastPreview: string | null;
  lastMessageAt: string | null;
}
interface Message {
  id: string;
  direction: string;
  contentType: string;
  body: string | null;
  mediaUrl: string | null;
  status: string;
  createdAt: string;
}
interface Thread extends Conversation {
  messages: Message[];
}

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export default function ConversasPage() {
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newTo, setNewTo] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fail = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : "Erro inesperado");

  const loadConvos = useCallback(async () => {
    try {
      setConvos(await api<Conversation[]>("/whatsapp/conversations"));
    } catch (e) {
      fail(e);
    }
  }, []);

  const loadThread = useCallback(async (id: string) => {
    try {
      setThread(await api<Thread>(`/whatsapp/conversations/${id}`));
    } catch (e) {
      fail(e);
    }
  }, []);

  useEffect(() => {
    loadConvos();
  }, [loadConvos]);

  // Realtime: quando chega/sai uma mensagem, atualiza a lista e — se a conversa
  // afetada estiver aberta — recarrega a thread. Sem F5, como no WhatsApp Web.
  const onMessage = useCallback(
    (evt: { conversationId: string }) => {
      loadConvos();
      if (evt.conversationId === selectedId) loadThread(selectedId);
    },
    [selectedId, loadConvos, loadThread],
  );
  useRealtime<{ conversationId: string }>("whatsapp:message", onMessage);

  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [thread?.messages.length]);

  async function open(id: string) {
    setNewTo(null);
    setSelectedId(id);
    await loadThread(id);
    await api(`/whatsapp/conversations/${id}/read`, { method: "POST" }).catch(() => {});
    loadConvos();
  }

  function startNew() {
    const to = window.prompt("Número (com DDI+DDD, ex.: 5511999990000):");
    if (!to) return;
    setSelectedId(null);
    setThread(null);
    setNewTo(to.replace(/\D/g, ""));
  }

  async function send() {
    if (!body.trim()) return;
    setError("");
    try {
      await api("/whatsapp/messages", {
        method: "POST",
        body: JSON.stringify(
          selectedId ? { conversationId: selectedId, body } : { to: newTo, body },
        ),
      });
      setBody("");
      const list = await api<Conversation[]>("/whatsapp/conversations");
      setConvos(list);
      const id =
        selectedId ?? list.find((c) => c.contactPhone === newTo)?.id ?? null;
      if (id) {
        setSelectedId(id);
        setNewTo(null);
        await loadThread(id);
      }
    } catch (e) {
      fail(e);
    }
  }

  async function onAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setError("");
    try {
      const up = await uploadFile(file);
      const target = selectedId ? { conversationId: selectedId } : { to: newTo };
      await api("/whatsapp/messages", {
        method: "POST",
        body: JSON.stringify({ ...target, mediaId: up.id, body: body || undefined }),
      });
      setBody("");
      const list = await api<Conversation[]>("/whatsapp/conversations");
      setConvos(list);
      const id = selectedId ?? list.find((c) => c.contactPhone === newTo)?.id ?? null;
      if (id) {
        setSelectedId(id);
        setNewTo(null);
        await loadThread(id);
      }
    } catch (err) {
      fail(err);
    }
  }

  async function simulateReply() {
    if (!thread) return;
    await api("/whatsapp/simulate-inbound", {
      method: "POST",
      body: JSON.stringify({
        from: thread.contactPhone,
        name: thread.contactName ?? undefined,
        body: "Mensagem recebida de teste 👋",
      }),
    }).catch(fail);
    await loadThread(thread.id);
    loadConvos();
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4">
      {/* Lista de conversas */}
      <aside className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border p-3">
          <span className="font-medium">Conversas</span>
          <button
            onClick={startNew}
            className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-fg hover:opacity-90"
          >
            Nova
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {convos.map((c) => (
            <button
              key={c.id}
              onClick={() => open(c.id)}
              className={`flex w-full flex-col items-start border-b border-border px-3 py-2 text-left transition ${
                selectedId === c.id ? "bg-surface-2" : "hover:bg-surface-2"
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-sm font-medium">
                  {c.contactName ?? c.contactPhone}
                </span>
                {c.unreadCount > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-xs text-primary-fg">
                    {c.unreadCount}
                  </span>
                )}
              </div>
              <span className="truncate text-xs text-muted">{c.lastPreview ?? ""}</span>
            </button>
          ))}
          {convos.length === 0 && (
            <div className="p-4 text-center text-sm text-muted">Nenhuma conversa</div>
          )}
        </div>
      </aside>

      {/* Thread */}
      <section className="flex flex-1 flex-col rounded-xl border border-border bg-surface">
        {error && (
          <div className="border-b border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
            {error}
          </div>
        )}
        {!selectedId && !newTo ? (
          <div className="flex flex-1 items-center justify-center text-muted">
            Selecione uma conversa ou inicie uma nova
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border p-3">
              <span className="font-medium">
                {thread?.contactName ?? thread?.contactPhone ?? newTo}
              </span>
              {thread && (
                <button
                  onClick={simulateReply}
                  className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-foreground"
                  title="Demo: injeta uma mensagem recebida (sem depender do WhatsApp real)"
                >
                  simular recebida
                </button>
              )}
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {thread?.messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.direction === "OUTBOUND" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm ${
                      m.direction === "OUTBOUND"
                        ? "bg-primary text-primary-fg"
                        : "bg-surface-2"
                    }`}
                  >
                    {m.mediaUrl && (
                      <div className="mb-1">
                        {m.contentType === "IMAGE" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={mediaSrc(m.mediaUrl)} alt="" className="max-h-48 rounded-lg" />
                        ) : m.contentType === "AUDIO" ? (
                          <audio controls src={mediaSrc(m.mediaUrl)} className="max-w-full" />
                        ) : m.contentType === "VIDEO" ? (
                          <video controls src={mediaSrc(m.mediaUrl)} className="max-h-48 rounded-lg" />
                        ) : (
                          <a
                            href={mediaSrc(m.mediaUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                          >
                            📎 abrir arquivo
                          </a>
                        )}
                      </div>
                    )}
                    {m.body && <div>{m.body}</div>}
                    <div className="mt-1 text-right text-[10px] opacity-70">
                      {time(m.createdAt)}
                      {m.direction === "OUTBOUND" && ` · ${m.status.toLowerCase()}`}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="flex gap-2 border-t border-border p-3">
              <input
                ref={fileRef}
                type="file"
                onChange={onAttach}
                className="hidden"
                accept="image/*,audio/*,video/*,.pdf"
              />
              <button
                onClick={() => fileRef.current?.click()}
                title="Anexar mídia"
                className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-foreground"
              >
                📎
              </button>
              <input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Digite uma mensagem..."
                className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                onClick={send}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:opacity-90"
              >
                Enviar
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
