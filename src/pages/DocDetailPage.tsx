import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import Scanner from "../components/Scanner";
import CheckSheet from "../components/CheckSheet";
import LinesEditor, { fromEditable, toEditable, type EditableLine } from "../components/LinesEditor";
import { checkLine, db, deleteDocument, updateDocument, type DocLine } from "../lib/db";
import { barcodeKey } from "../lib/ean";
import { formatEur, formatQty, withIva } from "../lib/num";
import { t } from "../lib/i18n";

export default function DocDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const doc = useLiveQuery(() => db.docs.get(id), [id]);
  const lines = useLiveQuery(() => db.lines.where("docId").equals(id).sortBy("pos"), [id]);
  const [checking, setChecking] = useState(false);
  const [open, setOpen] = useState<DocLine | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<{ meta: { supplier: string; number: string; date: string }; lines: EditableLine[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [typed, setTyped] = useState("");

  if (doc === undefined || lines === undefined) return <div className="card text-slate-500">…</div>;
  if (!doc) return <div className="card">—</div>;

  function onScan(code: string) {
    const key = barcodeKey(code);
    const ref = code.trim().toLowerCase();
    const matches = (l: DocLine) => (key !== "" && l.key === key) || (ref !== "" && l.ref.trim().toLowerCase() === ref);
    // La primera línea con ese código (o referencia) que aún no esté comprobada
    const line = lines!.find((l) => matches(l) && !l.checkedAt) ?? lines!.find(matches);
    if (!line) {
      navigator.vibrate?.([80, 60, 80]);
      setFlash({ ok: false, text: `${code} · ${t("No está en este albarán")}` });
      return;
    }
    setFlash(null);
    setOpen(line);
  }

  async function confirmLine(line: DocLine, received: number) {
    await checkLine(line.id, received);
    setOpen(null);
    setFlash({ ok: true, text: `✓ ${line.description} · ${formatQty(received)}` });
  }

  async function saveEdit() {
    if (!editing) return;
    const clean = editing.lines.map(fromEditable).filter((l) => l.description || l.ean || l.ref);
    if (clean.length === 0) return;
    setSaving(true);
    try {
      await updateDocument(id, editing.meta, clean);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="space-y-4">
        <div className="card space-y-3">
          <h2 className="font-bold">{t("Editar albarán")}</h2>
          <div>
            <label className="label">{t("Proveedor")}</label>
            <input className="input" value={editing.meta.supplier} onChange={(e) => setEditing({ ...editing, meta: { ...editing.meta, supplier: e.target.value } })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">{t("Número")}</label>
              <input className="input" value={editing.meta.number} onChange={(e) => setEditing({ ...editing, meta: { ...editing.meta, number: e.target.value } })} />
            </div>
            <div>
              <label className="label">{t("Fecha")}</label>
              <input className="input" type="date" value={editing.meta.date} onChange={(e) => setEditing({ ...editing, meta: { ...editing.meta, date: e.target.value } })} />
            </div>
          </div>
        </div>
        <LinesEditor lines={editing.lines} onChange={(l) => setEditing({ ...editing, lines: l })} pricesWithIva={doc.pricesWithIva} />
        <div className="sticky bottom-16 -mx-4 flex gap-2 bg-[var(--bg)]/95 px-4 py-3 backdrop-blur">
          <button type="button" className="btn-secondary flex-1" onClick={() => setEditing(null)}>
            {t("Cancelar")}
          </button>
          <button type="button" className="btn-primary flex-[2]" disabled={saving} onClick={saveEdit}>
            ✓ {t("Guardar")}
          </button>
        </div>
      </div>
    );
  }

  const done = lines.filter((l) => l.checkedAt).length;

  return (
    <div className="space-y-3">
      <div className="card">
        <div className="flex items-start justify-between gap-2">
          <div className="text-xl font-bold">{doc.supplier || doc.fileName}</div>
          <button
            type="button"
            className="shrink-0 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold"
            onClick={() => setEditing({ meta: { supplier: doc.supplier, number: doc.number, date: doc.date }, lines: lines.map(toEditable) })}
          >
            ✎ {t("Editar")}
          </button>
        </div>
        <div className="text-sm text-slate-600">{[doc.number, doc.date].filter(Boolean).join(" · ")}</div>
        <div className="mt-1 text-sm">
          {doc.lineCount} {t("líneas")} · {t("Total")}: <b>{formatEur(doc.total)}</b> · {t("Total con IVA")}{doc.pricesWithIva ? "" : " (21%)"}: <b>{formatEur(withIva(doc.total, doc.pricesWithIva))}</b>
          {done > 0 && (
            <span className="ml-2 font-semibold text-green-700">
              {t("Comprobado")} {done}/{lines.length}
            </span>
          )}
        </div>
      </div>

      <button type="button" className={checking ? "btn-secondary w-full" : "btn-primary w-full"} onClick={() => setChecking(!checking)}>
        {checking ? t("Volver") : `▥ ${t("Comprobar mercancía")}`}
      </button>

      {checking && (
        <div className="space-y-2">
          <p className="text-center text-sm text-slate-600">{t("Escanea un producto o toca una línea")}</p>
          <Scanner onCode={onScan} paused={!!open} />
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!typed.trim()) return;
              onScan(typed.trim());
              setTyped("");
            }}
          >
            <input className="input" placeholder={t("Escribir código")} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            <button className="btn-secondary shrink-0 whitespace-nowrap" type="submit">
              {t("Buscar")}
            </button>
          </form>
          {flash && (
            <p className={`rounded-xl p-3 text-center font-semibold ${flash.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{flash.text}</p>
          )}
          <p className="text-center text-sm font-semibold">
            {t("Comprobado")}: {done}/{lines.length}
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {lines.map((l) => {
          const diff = l.qty == null ? 0 : l.received - l.qty;
          return (
            <li key={l.id}>
              <button
                type="button"
                className={`card block w-full p-3 text-left ${l.checkedAt ? (diff === 0 ? "bg-green-50 ring-2 ring-green-400" : "ring-2 ring-amber-400") : ""}`}
                onClick={() => setOpen(l)}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold">{l.description || "—"}</span>
                  {l.checkedAt ? <span className="shrink-0 rounded-full bg-green-600 px-2 py-0.5 text-xs font-bold text-white">✓ {t("Comprobado")}</span> : null}
                </div>
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
                  <span>
                    {t("Precio unitario con IVA")}: <b className="text-blue-700">{formatEur(withIva(l.price, doc.pricesWithIva))}</b>
                  </span>
                  {l.discount ? (
                    <span>
                      {t("Dto %")}: {l.discount}
                    </span>
                  ) : null}
                  <span>
                    {t("Importe")}: {formatEur(l.total)}
                  </span>
                </div>
                {l.checkedAt ? (
                  <div className="mt-1 text-sm">
                    {t("Recibido")}: <b>{formatQty(l.received)}</b>
                    {diff < 0 && <span className="ml-2 font-semibold text-red-600">{t("Faltan")} {formatQty(-diff)}</span>}
                    {diff > 0 && <span className="ml-2 font-semibold text-amber-700">{t("Sobran")} {formatQty(diff)}</span>}
                  </div>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className="btn-danger w-full"
        onClick={async () => {
          if (!window.confirm(t("¿Borrar este albarán?"))) return;
          await deleteDocument(doc.id);
          navigate("/albaranes", { replace: true });
        }}
      >
        {t("Borrar")}
      </button>

      {open && (
        <CheckSheet
          key={open.id}
          line={open}
          pricesWithIva={doc.pricesWithIva}
          onClose={() => setOpen(null)}
          onConfirm={(n) => confirmLine(open, n)}
          onUncheck={async () => {
            await checkLine(open.id, null);
            setOpen(null);
          }}
        />
      )}
    </div>
  );
}
