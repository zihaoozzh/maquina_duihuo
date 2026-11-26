import { useState } from "react";
import { signIn, signOut, useCloud } from "../lib/cloud";
import { syncNow, useSyncState } from "../lib/sync";
import { t } from "../lib/i18n";

export default function SettingsPage() {
  const { config, session } = useCloud();
  const sync = useSyncState();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <h2 className="text-lg font-bold">{t("Base de datos compartida")}</h2>
        <p className="text-sm text-slate-600">
          {t("Con ella todos los móviles de la tienda ven los mismos albaranes.")}
        </p>

        {!session && (
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
          </form>
        )}

        {session && (
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
