// Session côté client. Le token d'accès (15 min) est conservé en
// sessionStorage ; le refresh token reste en cookie HttpOnly et est
// consommé par /api/auth/refresh (rotation, conception §4).

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
 * Décode l'`exp` du JWT (sans vérifier la signature, simple lecture client)
 * et indique s'il est expiré ou sur le point de l'être (marge de 10 s).
 * En cas de doute (jeton illisible) on renvoie false : la voie réactive 401
 * reste le filet de sécurité.
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

// Déduplique les rafraîchissements concurrents : plusieurs requêtes qui
// expirent en même temps partagent une seule rotation du refresh token
// (sinon les rotations se télescopent et invalident le cookie le plus récent).
let refreshing: Promise<boolean> | null = null;

/** Échange le cookie refresh contre un nouveau couple de jetons. */
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

/** Déconnexion : invalide le refresh côté serveur puis purge la session locale. */
export async function logoutSession(): Promise<void> {
  try {
    const s = getSession();
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: s ? { Authorization: `Bearer ${s.token}` } : undefined,
    });
  } catch {
    /* la purge locale suffit si le serveur est injoignable */
  }
  clearSession();
}

/** Télécharge un fichier servi par une route authentifiée (Bearer → blob). */
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

/** Télécharge le reçu PDF d'un paiement (requête authentifiée → blob). */
export function downloadRecu(paiementId: string): Promise<boolean> {
  return downloadAuthed(`/api/paiements/${paiementId}/recu`, `recu-${paiementId.slice(0, 8)}.pdf`);
}

/**
 * Téléverse un fichier vers /api/uploads (multipart). Ne fixe pas
 * Content-Type : le navigateur ajoute la boundary. Rejoue une fois sur 401
 * après rotation du refresh. Renvoie l'URL publique ou lève une erreur.
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
  // Rafraîchit en amont si le jeton est déjà expiré (évite un 401 inutile).
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

// Pas de rafraîchissement automatique sur les routes d'auth elles-mêmes.
const NO_REFRESH = ["/api/auth/login", "/api/auth/refresh", "/api/auth/logout"];

/**
 * fetch authentifié : attache le Bearer token et le Content-Type JSON.
 * Sur 401, tente une rotation du refresh token puis rejoue la requête (1 fois).
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<Response> {
  let s = getSession();
  // Rafraîchit en amont si le jeton est déjà expiré : la requête part avec un
  // jeton valide, ce qui évite le 401 transitoire (et son log console).
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
