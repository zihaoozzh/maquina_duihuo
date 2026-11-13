import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getMeta } from "../lib/db";
import { t } from "../lib/i18n";

export default function HomePage() {
  const docCount = useLiveQuery(() => db.docs.count(), []);
  const catalog = useLiveQuery(() => getMeta<{ count: number; importedAt: number }>("catalog"), []);
  return (
    <div className="space-y-4">
      <Link to="/escanear" className="btn-primary w-full py-6 text-xl">
        <span className="text-2xl">▥</span> {t("Escanear producto")}
      </Link>
      <Link to="/subir" className="btn-secondary w-full py-5 text-lg">
        <span className="text-xl">⇪</span> {t("Subir albarán")}
      </Link>
      <div className="grid grid-cols-2 gap-3">
        <Link to="/albaranes" className="card block">
          <div className="text-sm font-semibold text-slate-500">{t("Albaranes")}</div>
          <div className="text-3xl font-bold">{docCount ?? "…"}</div>
        </Link>
        <Link to="/productos" className="card block">
          <div className="text-sm font-semibold text-slate-500">{t("Productos de la caja")}</div>
          <div className="text-3xl font-bold">{catalog?.count ?? 0}</div>
          <div className="text-xs text-slate-500">
            {catalog ? new Date(catalog.importedAt).toLocaleDateString() : t("Importar Excel de Bohao")}
          </div>
        </Link>
      </div>
      <p className="text-center text-xs text-slate-500">{t("Los datos se guardan en este móvil.")}</p>
    </div>
  );
}
