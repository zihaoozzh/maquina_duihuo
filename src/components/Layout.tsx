import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { getLang, setLang, t } from "../lib/i18n";
import { useCloud } from "../lib/cloud";
import { useSyncState } from "../lib/sync";

const NAV = [
  { to: "/", label: "Inicio", icon: "⌂" },
  { to: "/escanear", label: "Escanear", icon: "▥" },
  { to: "/subir", label: "Subir albarán", icon: "⇪" },
  { to: "/albaranes", label: "Albaranes", icon: "☰" },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { session } = useCloud();
  const sync = useSyncState();
  const dot = !session ? "bg-slate-300" : sync.status === "error" ? "bg-red-400" : sync.status === "syncing" ? "bg-yellow-300" : "bg-green-400";
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-blue-700 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <Link to="/" className="text-lg font-bold tracking-wide">
          对货 · {t("Albaranes")}
        </Link>
        <div className="flex items-center gap-2">
        <Link to="/ajustes" className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold" aria-label={t("Ajustes")}>
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} />⚙
        </Link>
        <button
          type="button"
          className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold"
          onClick={() => setLang(getLang() === "es" ? "zh" : "es")}
          aria-label={t("Idioma")}
        >
          {getLang() === "es" ? "中文" : "Español"}
        </button>
        </div>
      </header>
      <main className="flex-1 px-4 py-4 pb-28">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-3xl grid-cols-4">
          {NAV.map((n) => {
            const active = n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex flex-col items-center gap-0.5 py-2 text-xs font-semibold ${active ? "text-blue-700" : "text-slate-500"}`}
              >
                <span className="text-xl leading-none">{n.icon}</span>
                {t(n.label)}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
