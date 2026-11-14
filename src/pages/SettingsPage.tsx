import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { decodeShopCode, encodeShopCode, normalizeUrl, saveConfig, signIn, signOut, useCloud } from "../lib/cloud";
import { db } from "../lib/db";
import { syncNow, useSyncState } from "../lib/sync";
import { t } from "../lib/i18n";

export default function SettingsPage() {
  const { config, session } = useCloud();
  const sync = useSyncState();
  const [params] = useSearchParams();
  const fromLink = decodeShopCode(params.get("tienda") ?? "");
  const [url, setUrl] = useState(fromLink?.url ?? config?.url ?? "");
  const [anonKey, setAnonKey] = useState(fromLink?.anonKey ?? config?.anonKey ?? "");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function connect(c: { url: string; anonKey: string }) {
    if (!c.url || !c.anonKey) return setMessage(t("Faltan la dirección o la clave."));
    // Proyecto distinto: volver a bajar todo desde el principio
    if (config?.url !== c.url) await db.meta.delete("pulledAt");
    saveConfig(c);
    setMessage("");
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await signIn(email, password);
      setPassword("");
    } catch (err) {
      setMessage(`${t("No se pudo iniciar sesión.")} ${err instanceof Error ? t(err.message) : ""}`);
    } finally {
      setBusy(false);
    }
  }

  const shareLink = config ? `${location.origin}${location.pathname}#/ajustes?tienda=${encodeShopCode(config)}` : "";

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <h2 className="text-lg font-bold">{t("Base de datos compartida")}</h2>
        <p className="text-sm text-slate-600">
          {t("Con ella todos los móviles de la tienda ven los mismos albaranes.")}
        </p>

        {!config && (
          <>
            <div>
              <label className="label">{t("Código de tienda")}</label>
              <div className="flex gap-2">
                <input className="input font-mono text-xs" value={code} onChange={(e) => setCode(e.target.value)} />
                <button
                  type="button"
                  className="btn-secondary shrink-0"
                  onClick={() => {
                    const c = decodeShopCode(code);
                    if (c) connect(c);
                    else setMessage(t("El código de tienda no es válido."));
                  }}
                >
                  {t("Aceptar")}
                </button>
              </div>
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold text-slate-600">{t("O escribe la dirección y la clave de Supabase")}</summary>
              <div className="mt-2 space-y-2">
                <input className="input" placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} />
                <input className="input font-mono text-xs" placeholder={t("Clave anon / publishable")} value={anonKey} onChange={(e) => setAnonKey(e.target.value)} />
                <button type="button" className="btn-primary w-full" onClick={() => connect({ url: normalizeUrl(url), anonKey: anonKey.trim() })}>
                  {t("Conectar")}
                </button>
              </div>
            </details>
          </>
        )}

        {config && !session && (
          <form className="space-y-2" onSubmit={login}>
            <p className="text-sm">
              {t("Inicia sesión con la cuenta de la tienda")} · <span className="font-mono text-xs text-slate-500">{new URL(config.url).host}</span>
            </p>
            <input className="input" type="email" autoComplete="username" placeholder={t("Email")} value={email} onChange={(e) => setEmail(e.target.value)} />
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              placeholder={t("Contraseña")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="btn-primary w-full" disabled={busy} type="submit">
              {t("Entrar")}
            </button>
            <button type="button" className="w-full text-sm text-slate-500 underline" onClick={() => saveConfig(null)}>
              {t("Cambiar de base de datos")}
            </button>
          </form>
        )}

        {config && session && (
          <div className="space-y-3">
            <p className="text-sm">
              ✓ {t("Conectado como")} <b>{session.user.email}</b>
            </p>
            <p className="text-sm">
              {t("Sincronización")}:{" "}
              <b className={sync.status === "error" ? "text-red-700" : ""}>
                {sync.status === "syncing" ? t("sincronizando…") : sync.status === "error" ? `${t("error")}: ${t(sync.error)}` : sync.lastSync ? new Date(sync.lastSync).toLocaleTimeString() : "—"}
              </b>
            </p>
            <button type="button" className="btn-secondary w-full" onClick={() => syncNow()}>
              ⟳ {t("Sincronizar ahora")}
            </button>
            <div>
              <label className="label">{t("Para conectar otro móvil")}</label>
              <p className="mb-2 text-xs text-slate-500">{t("Envía este enlace al otro móvil (por WhatsApp, por ejemplo), ábrelo y entra con la misma cuenta.")}</p>
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={async () => {
                  try {
                    if (navigator.share) await navigator.share({ title: "对货", url: shareLink });
                    else {
                      await navigator.clipboard.writeText(shareLink);
                      setMessage(t("Enlace copiado."));
                    }
                  } catch {
                    /* cancelado */
                  }
                }}
              >
                🔗 {t("Compartir enlace de la tienda")}
              </button>
            </div>
            <button type="button" className="w-full text-sm text-slate-500 underline" onClick={() => signOut()}>
              {t("Cerrar sesión")}
            </button>
          </div>
        )}
        {message && <p className="text-sm font-semibold text-red-700">{message}</p>}
      </div>
    </div>
  );
}
