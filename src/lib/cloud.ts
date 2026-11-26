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

// Proyecto de Supabase de la app. La URL y la clave publicable son públicas por diseño:
// los datos solo se leen con la sesión de cada tienda (políticas RLS por shop_id).
const DEFAULT_CONFIG: CloudConfig = {
  url: import.meta.env.VITE_SUPABASE_URL ?? "https://trlzbqpxcvrhbkpuaxdg.supabase.co",
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "sb_publishable_zK633GwVVmnujAuIe5dRsQ_B2BFNEBc",
};

function loadConfig(): CloudConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const c = JSON.parse(raw);
    return typeof c?.url === "string" && typeof c?.anonKey === "string" ? c : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

const config = loadConfig();
let client: SupabaseClient | null = null;
let session: Session | null = null;

const listeners = new Set<() => void>();
const emit = () => {
  snapshot = { config, session };
  listeners.forEach((f) => f());
};
let snapshot: { config: CloudConfig; session: Session | null } = { config, session };

function makeClient() {
  client = createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "tienda-auth", storage: window.localStorage },
  });
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

/** Id de la cuenta con la sesión iniciada (cada cuenta es una tienda). */
export function getUserId(): string | null {
  return session?.user.id ?? null;
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
