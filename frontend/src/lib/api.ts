// Central API access layer.
//
// Every call site goes through here so the backend origin lives in exactly one
// place (NEXT_PUBLIC_API_URL, as already set by docker-compose) and so the
// bearer token issued at login is actually attached to requests.

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

// The actual page-composition tool ("page maker") is a separate application
// (D:\newspaper_generater), not part of this codebase. The dashboard hands off
// to it by URL once the wallet balance check passes.
export const GENERATOR_URL = process.env.NEXT_PUBLIC_GENERATOR_URL || "http://localhost:3000";

const TOKEN_KEY = "newspaper_token";
const USER_KEY = "newspaper_user";
const ROLE_KEY = "newspaper_role";
const PUBLISHER_KEY = "newspaper_publisher_id";

export interface Session {
  token: string;
  username: string;
  role: string;
  publisher_id?: string;
}

export function saveSession(data: Session) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, data.username);
  localStorage.setItem(ROLE_KEY, data.role || "PUBLISHER");
  if (data.publisher_id) localStorage.setItem(PUBLISHER_KEY, data.publisher_id);
}

export function clearSession() {
  if (typeof window === "undefined") return;
  [TOKEN_KEY, USER_KEY, ROLE_KEY, PUBLISHER_KEY].forEach((k) => localStorage.removeItem(k));
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getRole(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ROLE_KEY);
}

export function getUsername(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(USER_KEY);
}

/** The signed-in publisher's real UUID, established at login. */
export function getPublisherId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PUBLISHER_KEY);
}

/**
 * fetch() against the API with the bearer token attached.
 * `path` is relative to API_BASE, e.g. "/publisher/wallet/<id>".
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers || {});
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

/** apiFetch + JSON decode. Throws on non-2xx so callers can show the API's message. */
export async function apiJson<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}
