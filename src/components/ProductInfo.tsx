import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, findLinesByCode } from "../lib/db";
import { barcodeKey } from "../lib/ean";
import { formatEur, formatQty } from "../lib/num";
import { t } from "../lib/i18n";

/** Todo lo que se sabe de un código: producto de la caja + líneas de albaranes. */
export default function ProductInfo({ code }: { code: string }) {
  const product = useLiveQuery(() => db.catalog.get(barcodeKey(code)), [code]);
  const lines = useLiveQuery(() => findLinesByCode(code), [code]);
  if (lines === undefined) return <div className="card text-slate-500">…</div>;

  const latest = lines[0];
  const name = product?.name || latest?.description || "";
  // Coste neto por unidad: si hay descuento, importe / cantidad
  const netCost =
    latest?.total != null && latest.qty ? latest.total / latest.qty : latest?.price != null ? latest.price * (1 - (latest.discount ?? 0) / 100) : null;
  const lastCost = netCost ?? product?.cost ?? null;
  const margin = product?.pvp && lastCost ? ((product.pvp / 1.21 - lastCost) / lastCost) * 100 : null;

  return (
    <div className="space-y-3">
      <div className="card">
        <div className="font-mono text-sm text-slate-500">{code}</div>
        <div className="text-xl font-bold">{name || "—"}</div>
        {product ? (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat label={t("PVP")} value={formatEur(product.pvp)} strong />
            <Stat label={t("Último coste")} value={formatEur(lastCost)} />
            <Stat label={t("Stock")} value={formatQty(product.stock)} />
          </div>
        ) : (
          <>
            {latest && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                <Stat label={t("Último coste")} value={formatEur(lastCost)} strong />
                <Stat label={t("Cantidad")} value={formatQty(latest.qty)} />
              </div>
            )}
            <p className="mt-2 text-sm text-amber-700">{t("No está en los productos de la caja.")}</p>
          </>
        )}
        {margin != null && (
          <p className="mt-2 text-xs text-slate-500">
            {t("Margen")}: {margin.toFixed(0)}% ({t("PVP sin IVA 21%")})
          </p>
        )}
      </div>

      <div className="card">
        <h3 className="mb-2 font-bold">{t("En albaranes")}</h3>
        {lines.length === 0 ? (
          <p className="text-slate-500">{t("No aparece en ningún albarán.")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {lines.map((l) => (
              <li key={l.id} className="py-2">
                <Link to={`/albaranes/${l.docId}`} className="block">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold">{l.doc?.supplier || "—"}</span>
                    <span className="shrink-0 text-sm text-slate-500">{l.doc?.date || ""}</span>
                  </div>
                  <div className="text-sm text-slate-600">{l.description}</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 text-sm">
                    <span>
                      {t("Cantidad")}: <b>{formatQty(l.qty)}</b>
                    </span>
                    <span>
                      {t("Precio")}: <b>{formatEur(l.price)}</b>
                    </span>
                    {l.discount ? <span>{t("Dto %")}: {l.discount}</span> : null}
                    <span>
                      {t("Importe")}: {formatEur(l.total)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className={strong ? "text-xl font-bold text-blue-700" : "text-lg font-semibold"}>{value}</div>
    </div>
  );
}
