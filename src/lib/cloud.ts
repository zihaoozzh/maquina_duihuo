/**
 * Conexión con la base de datos compartida (Supabase).
 * La dirección y la clave pública se guardan en el móvil (Ajustes). La sesión es la
 * cuenta de la tienda (email + contraseña), así nadie más puede leer los datos.
 */
import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";

export interface CloudConfig {
  url: string;
  anonKey: string;
}

const CONFIG_KEY = "cloud-config";

function loadConfig(): CloudConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    return typeof c?.url === "string" && typeof c?.anonKey === "string" ? c : null;
  } catch {
    return null;
  }
}

let config = loadConfig();
let client: SupabaseClient | null = null;
let session: Session | null = null;

const listeners = new Set<() => void>();
const emit = () => {
  snapshot = { config, session };
  listeners.forEach((f) => f());
};
let snapshot: { config: CloudConfig | null; session: Session | null } = { config, session };

function makeClient() {
  client = config
    ? createClient(config.url, config.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: "tienda-auth", storage: window.localStorage },
      })
    : null;
  session = null;
  if (client) {
    client.auth.getSession().then(({ data }) => {
      session = data.session;
      emit();
    });
    // La sesión solo se cierra con "Cerrar sesión" (SIGNED_OUT); cualquier otro evento
    // (refresco de token, falta de red al arrancar...) no debe sacar al usuario.
    client.auth.onAuthStateChange((event, s) => {
      if (!s && event !== "SIGNED_OUT") return;
      session = s;
      emit();
    });
  }
}
makeClient();

// Pedir al navegador que no borre los datos guardados (incluida la sesión) y renovar el token al volver a la app.
try {
  navigator.storage?.persist?.();
} catch {
  /* ignorar */
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && client) client.auth.getSession().catch(() => {});
});

export function getClient(): SupabaseClient | null {
  return client;
}

export function isReady(): boolean {
  return !!client && !!session;
}

export function normalizeUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, "");
  if (u && !/^https?:\/\//.test(u)) u = `https://${u}`;
  return u;
}

export function saveConfig(c: CloudConfig | null) {
  try {
    if (c) localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
    else localStorage.removeItem(CONFIG_KEY);
  } catch {
    /* ignorar */
  }
  config = c;
  makeClient();
  emit();
}

export async function signIn(email: string, password: string) {
  if (!client) throw new Error("Falta configurar la base de datos.");
  const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

export async function signOut() {
  await client?.auth.signOut();
}

export function subscribeCloud(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useCloud() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot,
  );
}

// --- "Código de tienda": para configurar el segundo móvil sin copiar claves a mano

export function encodeShopCode(c: CloudConfig): string {
  return btoa(JSON.stringify({ u: c.url, k: c.anonKey })).replace(/=+$/, "");
}

export function decodeShopCode(code: string): CloudConfig | null {
  try {
    const o = JSON.parse(atob(code.trim()));
    if (typeof o?.u === "string" && typeof o?.k === "string") return { url: normalizeUrl(o.u), anonKey: o.k };
  } catch {
    /* no válido */
  }
  return null;
}
