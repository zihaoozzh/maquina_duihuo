import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import Scanner from "../components/Scanner";
import { changeReceived, db, deleteDocument, type DocLine } from "../lib/db";
import { barcodeKey } from "../lib/ean";
import { formatEur, formatQty } from "../lib/num";
import { t } from "../lib/i18n";

export default function DocDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const doc = useLiveQuery(() => db.docs.get(id), [id]);
  const lines = useLiveQuery(() => db.lines.where("docId").equals(id).sortBy("pos"), [id]);
  const [checking, setChecking] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  if (doc === undefined || lines === undefined) return <div className="card text-slate-500">…</div>;
  if (!doc) return <div className="card">—</div>;

  async function onScan(code: string) {
    const key = barcodeKey(code);
    // Primero una línea que aún no esté completa
    const line = lines!.find((l) => l.key === key && l.received < (l.qty ?? Infinity)) ?? lines!.find((l) => l.key === key);
    if (!line) {
      navigator.vibrate?.([80, 60, 80]);
      setFlash({ ok: false, text: `${code} · ${t("No está en este albarán")}` });
      return;
    }
    // changeReceived lee el valor actual (al escanear rápido la lista puede ir atrasada)
    const received = await changeReceived(line.id, 1);
    setFlash({ ok: true, text: `${line.description} · ${received}/${formatQty(line.qty)}` });
  }

  const setReceived = (l: DocLine, v: number) => changeReceived(l.id, { set: v });
  const done = lines.filter((l) => l.qty != null && l.received === l.qty).length;

  return (
    <div className="space-y-3">
      <div className="card">
        <div className="text-xl font-bold">{doc.supplier || doc.fileName}</div>
        <div className="text-sm text-slate-600">
          {[doc.number, doc.date].filter(Boolean).join(" · ")}
        </div>
        <div className="mt-1 text-sm">
          {doc.lineCount} {t("líneas")} · {t("Total")}: <b>{formatEur(doc.total)}</b>
        </div>
      </div>

      <button type="button" className={checking ? "btn-secondary w-full" : "btn-primary w-full"} onClick={() => setChecking(!checking)}>
        {checking ? t("Volver") : `▥ ${t("Comprobar mercancía")}`}
      </button>

      {checking && (
        <div className="space-y-2">
          <p className="text-center text-sm text-slate-600">{t("Escanea los productos que han llegado")}</p>
          <Scanner onCode={onScan} />
          {flash && (
            <p className={`rounded-xl p-3 text-center font-semibold ${flash.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{flash.text}</p>
          )}
          <p className="text-center text-sm">
            {t("Completo")}: {done}/{lines.length}
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {lines.map((l) => {
          const diff = l.qty == null ? 0 : l.received - l.qty;
          const status = !checking && l.received === 0 ? null : diff === 0 ? "ok" : diff < 0 ? "missing" : "extra";
          return (
            <li key={l.id} className={`card p-3 ${status === "ok" ? "ring-2 ring-green-400" : status === "extra" ? "ring-2 ring-amber-400" : ""}`}>
              <div className="font-semibold">{l.description || "—"}</div>
              <div className="font-mono text-xs text-slate-500">
                {l.ean || t("Sin código")} {l.ref && `· ${l.ref}`}
              </div>
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
              {(checking || l.received > 0) && (
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <span>{t("Recibido")}:</span>
                  <button type="button" className="rounded-lg bg-slate-100 px-3 py-1 font-bold" onClick={() => setReceived(l, l.received - 1)}>
                    −
                  </button>
                  <b className="w-8 text-center">{l.received}</b>
                  <button type="button" className="rounded-lg bg-slate-100 px-3 py-1 font-bold" onClick={() => setReceived(l, l.received + 1)}>
                    +
                  </button>
                  {status === "missing" && <span className="font-semibold text-red-600">{t("Faltan")} {-diff}</span>}
                  {status === "extra" && <span className="font-semibold text-amber-700">{t("Sobran")} {diff}</span>}
                  {status === "ok" && <span className="font-semibold text-green-700">✓</span>}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className="btn-danger w-full"
        onClick={async () => {
          if (!confirm(t("¿Borrar este albarán?"))) return;
          await deleteDocument(doc.id);
          navigate("/albaranes", { replace: true });
        }}
      >
        {t("Borrar")}
      </button>
    </div>
  );
}
