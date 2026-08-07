export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Session {
  accessToken: string;
  // refreshToken NÃO é mais persistido no browser — mora só no cookie httpOnly
  // (inacessível a JS, resistente a XSS). O backend seta/lê o cookie.
  refreshToken?: string;
  tenantId: string;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("accessToken");
}

export function setSession(s: Session) {
  // Só o access token (curta duração) fica no localStorage. O refresh vive no
  // cookie httpOnly setado pelo backend.
  localStorage.setItem("accessToken", s.accessToken);
  localStorage.setItem("tenantId", s.tenantId);
}

export function clearSession() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("tenantId");
  // Legado: remove refresh eventualmente gravado por versões antigas.
  localStorage.removeItem("refreshToken");
}

function parseError(status: number, body: unknown): string {
  const b = body as { message?: string | string[] } | null;
  if (Array.isArray(b?.message)) return b.message.join(", ");
  return b?.message ?? `Erro ${status}`;
}

/**
 * Tenta renovar o access token usando o cookie httpOnly do refresh.
 * Retorna o novo access token, ou null se não deu (refresh inválido/expirado).
 */
async function tryRefresh(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // envia o cookie refresh_token
      body: "{}",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Session;
    setSession(body);
    return body.accessToken;
  } catch {
    return null;
  }
}

/**
 * Fetch autenticado. Em 401, tenta renovar via cookie uma vez e refaz a
 * requisição; se ainda falhar, limpa a sessão e manda para /login.
 */
export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
  _retried = false,
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (res.status === 401) {
    if (!_retried) {
      const fresh = await tryRefresh();
      if (fresh) return api<T>(path, options, true); // refaz com token novo
    }
    clearSession();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new ApiError(401, "Sessão expirada");
  }

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, parseError(res.status, body));
  return body as T;
}

/** Upload de arquivo (multipart) para o Storage. */
export async function uploadFile(file: File): Promise<{
  id: string;
  url: string;
  contentType: string;
  filename: string;
}> {
  const token = getToken();
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_BASE}/storage/upload`, {
    method: "POST",
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, parseError(res.status, body));
  return body;
}

/**
 * Baixa um arquivo de uma rota autenticada (ex.: relatório em CSV).
 *
 * Não dá para usar `<a href>` direto: a rota exige o header `Authorization`.
 * Então buscamos o conteúdo, viramos um blob e disparamos o download.
 */
export async function downloadFile(path: string, fallbackName: string) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, "Falha ao gerar o arquivo");

  // Usa o nome sugerido pelo servidor, se vier.
  const cd = res.headers.get("content-disposition") ?? "";
  const name = /filename="?([^"]+)"?/.exec(cd)?.[1] ?? fallbackName;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * URL absoluta de uma mídia do Storage para usar em <img>/<audio>.
 *
 * A API já devolve o caminho **assinado** (HMAC + expiração), então aqui só
 * prefixamos o host. Nada de token na query — ele vazaria em log/histórico.
 */
export function mediaSrc(mediaUrl: string): string {
  const origin = API_BASE.replace(/\/api$/, "");
  return `${origin}${mediaUrl}`;
}

/** Login não passa pelo redirect de 401 (para mostrar o erro na tela). */
export async function login(
  slug: string,
  email: string,
  password: string,
  code?: string,
) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", // recebe o cookie httpOnly do refresh
    body: JSON.stringify({ slug, email, password, code: code || undefined }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, parseError(res.status, body));
  setSession(body);
  return body as Session;
}

/** Cadastro público de barbearia: cria tenant+admin e já autentica (igual login). */
export async function register(data: {
  barbershopName: string;
  slug: string;
  adminName: string;
  email: string;
  password: string;
}) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", // recebe o cookie httpOnly do refresh
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, parseError(res.status, body));
  setSession(body);
  return body as Session;
}

/** Logout: revoga o refresh (backend) e limpa a sessão local. */
export async function logout() {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: "{}",
    });
  } catch {
    // ignora erro de rede — limpamos localmente de qualquer forma
  }
  clearSession();
  if (typeof window !== "undefined") window.location.href = "/login";
}
