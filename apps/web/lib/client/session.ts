// Client-side session. The access token (15 min) is kept in sessionStorage;
// the refresh token stays in an HttpOnly cookie and is consumed by
// /api/auth/refresh (rotation, design §4).

export interface SessionUser {
  id: string;
  username: string;
  role: "admin" | "bailleur" | "locataire";
  fullName: string;
  firstLogin: boolean;
  language: string;
}

interface Session {
  token: string;
  user: SessionUser;
}

const KEY = "cg_session";

export function setSession(s: Session): void {
  sessionStorage.setItem(KEY, JSON.stringify(s));
}

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function updateSessionUser(patch: Partial<SessionUser>): void {
  const s = getSession();
  if (s) setSession({ token: s.token, user: { ...s.user, ...patch } });
}

export function clearSession(): void {
  sessionStorage.removeItem(KEY);
}

/**
 * Decodes the JWT `exp` (client-side read only, signature not verified) and
 * reports whether it is expired or about to be (10 s margin).
 * When in doubt (unreadable token) it returns false: the reactive 401 path
 * stays the safety net.
 */
function tokenExpired(token: string): boolean {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    if (typeof json.exp !== "number") return false;
    return json.exp * 1000 <= Date.now() + 10_000;
  } catch {
    return false;
  }
}

// Deduplicates concurrent refreshes: several requests expiring at the same
// time share a single refresh-token rotation (otherwise rotations collide and
// invalidate the most recent cookie).
let refreshing: Promise<boolean> | null = null;

/** Exchanges the refresh cookie for a new token pair. */
function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch("/api/auth/refresh", { method: "POST" });
        if (!res.ok) return false;
        const data = (await res.json()) as { accessToken: string; user: SessionUser };
        setSession({ token: data.accessToken, user: data.user });
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

/**
 * Returns the session, rebuilding it from the refresh cookie when
 * sessionStorage is empty. Essential in an installed PWA: the access token
 * does not survive closing the app whereas the cookie stays valid for 7
 * days — without this recovery, every launch went back through the login
 * screen.
 */
export async function restoreSession(): Promise<Session | null> {
  const existing = getSession();
  if (existing) return existing;
  return (await tryRefresh()) ? getSession() : null;
}

/** Logout: invalidates the refresh server-side then clears the local session. */
export async function logoutSession(): Promise<void> {
  try {
    const s = getSession();
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: s ? { Authorization: `Bearer ${s.token}` } : undefined,
    });
  } catch {
    /* clearing locally is enough when the server is unreachable */
  }
  clearSession();
}

/** Downloads a file served by an authenticated route (Bearer → blob). */
export async function downloadAuthed(path: string, filename: string): Promise<boolean> {
  const res = await apiFetch(path);
  if (!res.ok) return false;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return true;
}

/** Downloads a payment's PDF receipt (authenticated request → blob). */
export function downloadRecu(paiementId: string): Promise<boolean> {
  return downloadAuthed(`/api/paiements/${paiementId}/recu`, `recu-${paiementId.slice(0, 8)}.pdf`);
}

/** Downloads a line's personal PDF invoice (rent, water, housing…). */
export function downloadFactureLigne(ligneId: string, libelle: string): Promise<boolean> {
  const slug = libelle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return downloadAuthed(`/api/factures/lignes/${ligneId}/pdf`, `facture-${slug}.pdf`);
}

/**
 * Uploads a file to /api/uploads (multipart). Does not set Content-Type: the
 * browser adds the boundary. Replays once on 401 after a refresh rotation.
 * Returns the public URL, or throws.
 */
export async function uploadFile(file: File, kind: "image" | "document"): Promise<string> {
  async function send(): Promise<Response> {
    const s = getSession();
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("file", file);
    return fetch("/api/uploads", {
      method: "POST",
      headers: s ? { Authorization: `Bearer ${s.token}` } : undefined,
      body: fd,
    });
  }
  // Refresh up front when the token is already expired (avoids a useless 401).
  const cur = getSession();
  if (cur && tokenExpired(cur.token)) await tryRefresh();
  let res = await send();
  if (res.status === 401 && (await tryRefresh())) res = await send();
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Échec du téléversement.");
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}

// No automatic refresh on the auth routes themselves.
const NO_REFRESH = ["/api/auth/login", "/api/auth/refresh", "/api/auth/logout"];

/**
 * Authenticated fetch: attaches the Bearer token and the JSON Content-Type.
 * On 401, attempts a refresh-token rotation then replays the request (once).
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<Response> {
  let s = getSession();
  // Refresh up front when the token is already expired: the request leaves with
  // a valid token, avoiding the transient 401 (and its console log).
  if (s && retry && !NO_REFRESH.includes(path) && tokenExpired(s.token)) {
    if (await tryRefresh()) s = getSession();
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (s) headers["Authorization"] = `Bearer ${s.token}`;

  const res = await fetch(path, { ...options, headers });
  if (res.status === 401 && retry && !NO_REFRESH.includes(path)) {
    if (await tryRefresh()) return apiFetch(path, options, false);
  }
  return res;
}
