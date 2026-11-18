import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import LinesEditor, { emptyLine, fromEditable, toEditable, type EditableLine } from "../components/LinesEditor";
import { parseDocument, type ParsedDocument } from "../lib/parse";
import { formatEur } from "../lib/num";
import { checkTotals, type TotalsCheck } from "../lib/totals";
import { saveDocument, type DocSource } from "../lib/db";
import { t } from "../lib/i18n";

type Step = { kind: "pick" } | { kind: "reading" } | { kind: "review" };

function kindOf(file: File): DocSource {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (/\.(xlsx|xls|xlsm|ods|csv)$/.test(name) || file.type.includes("sheet") || file.type.includes("excel") || file.type === "text/csv") return "excel";
  if (file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/.test(name)) return "photo";
  return "pdf";
}

const EMPTY: ParsedDocument = { lines: [], supplier: "", number: "", date: "", mode: "heuristic", footerTotals: [], adjustments: 0, dropped: 0 };

interface ReadResult {
  doc: ParsedDocument;
  notice: string;
}

const MANUAL = "No se puede leer automáticamente (foto o PDF escaneado). Añade las líneas a mano.";

/** Lectura automática (sin IA): PDF con texto o Excel. Fotos y escaneados → a mano. */
async function readFiles(files: File[]): Promise<ReadResult> {
  const file = files[0];
  const kind = kindOf(file);
  if (kind === "photo") return { doc: EMPTY, notice: t(MANUAL) };
  const data = await file.arrayBuffer();
  let doc: ParsedDocument;
  if (kind === "excel") {
    const { readSpreadsheet } = await import("../lib/excel");
    // La hoja con más líneas de producto
    doc = readSpreadsheet(data).map((s) => parseDocument(s.rows)).sort((a, b) => b.lines.length - a.lines.length)[0] ?? EMPTY;
  } else {
    const { readPdf } = await import("../lib/pdf");
    const pdf = await readPdf(data);
    if (pdf.scanned) return { doc: EMPTY, notice: t(MANUAL) };
    doc = parseDocument(pdf.rows);
  }
  const dropped = doc.dropped > 0 ? `${t("Filas sin código de barras descartadas (revísalas en el documento)")}: ${doc.dropped}` : "";
  return { doc, notice: doc.lines.length ? dropped : t("No se ha encontrado ninguna línea de producto.") };
}

export default function UploadPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [files, setFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState("");
  const [footer, setFooter] = useState<{ totals: number[]; adjustments: number }>({ totals: [], adjustments: 0 });
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [meta, setMeta] = useState({ supplier: "", number: "", date: "" });
  const [saving, setSaving] = useState(false);

  const check = useMemo(
    () => checkTotals(lines.map(fromEditable), footer.totals, footer.adjustments),
    [lines, footer],
  );

  async function onFiles(list: FileList | null | undefined) {
    const picked = list ? Array.from(list) : [];
    if (picked.length === 0) return;
    setFiles(picked);
    setStep({ kind: "reading" });
    try {
      const { doc, notice } = await readFiles(picked);
      setNotice(notice);
      setFooter({ totals: doc.footerTotals, adjustments: doc.adjustments });
      setLines(doc.lines.length ? doc.lines.map(toEditable) : [emptyLine()]);
      setMeta({ supplier: doc.supplier, number: doc.number, date: doc.date || new Date().toISOString().slice(0, 10) });
      setStep({ kind: "review" });
    } catch (e) {
      console.error(e);
      setNotice(`${t("No se pudo leer el archivo.")} ${e instanceof Error ? t(e.message) : ""}`);
      setStep({ kind: "pick" });
    }
  }

  async function save() {
    const clean = lines.map(fromEditable).filter((l) => l.description || l.ean || l.ref);
    if (clean.length === 0 || files.length === 0) return;
    setSaving(true);
    try {
      const id = await saveDocument({ ...meta, fileName: files.map((f) => f.name).join(", "), source: kindOf(files[0]) === "photo" ? "manual" : kindOf(files[0]) }, clean);
      navigate(`/albaranes/${id}`, { replace: true });
    } finally {
      setSaving(false);
    }
  }

  if (step.kind === "reading") {
    return (
      <div className="card py-12 text-center text-lg font-semibold text-slate-600">{t("Leyendo documento…")}</div>
    );
  }

  if (step.kind === "pick") {
    return (
      <div className="space-y-4">
        <div className="card space-y-3 text-center">
          <p className="text-slate-600">{t("PDF, Excel o foto del albarán o factura")}</p>
          <button type="button" className="btn-primary w-full py-5 text-lg" onClick={() => fileRef.current?.click()}>
            📄 {t("Elegir archivo")}
          </button>
          <button type="button" className="btn-secondary w-full" onClick={() => cameraRef.current?.click()}>
            📷 {t("Hacer foto")}
          </button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept="application/pdf,.pdf,.xlsx,.xls,.xlsm,.ods,.csv,image/*"
            onChange={(e) => {
              onFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={cameraRef}
            type="file"
            className="hidden"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              onFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
        {notice && <p className="card text-amber-700">{notice}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <h2 className="font-bold">{t("Datos del documento")}</h2>
        <p className="truncate text-xs text-slate-500">
          {files.map((f) => f.name).join(", ")}
        </p>
        <div>
          <label className="label">{t("Proveedor")}</label>
          <input className="input" value={meta.supplier} onChange={(e) => setMeta({ ...meta, supplier: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">{t("Número")}</label>
            <input className="input" value={meta.number} onChange={(e) => setMeta({ ...meta, number: e.target.value })} />
          </div>
          <div>
            <label className="label">{t("Fecha")}</label>
            <input className="input" type="date" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} />
          </div>
        </div>
      </div>
      {notice && <p className="card text-amber-700">{notice}</p>}
      {check && <TotalsNotice check={check} />}
      <p className="text-sm font-semibold text-slate-600">
        {t("Revisa las líneas antes de guardar")} · {t("Toca una celda para corregirla")}
      </p>
      <LinesEditor lines={lines} onChange={setLines} />
      <div className="sticky bottom-16 -mx-4 flex gap-2 bg-[var(--bg)]/95 px-4 py-3 backdrop-blur">
        <button type="button" className="btn-secondary flex-1" onClick={() => setStep({ kind: "pick" })}>
          {t("Cancelar")}
        </button>
        <button type="button" className="btn-primary flex-[2]" disabled={saving} onClick={save}>
          ✓ {t("Guardar albarán")}
        </button>
      </div>
    </div>
  );
}

function TotalsNotice({ check }: { check: TotalsCheck }) {
  if (check.kind === "mismatch") {
    return (
      <div className="card space-y-1 border-amber-300 bg-amber-50 text-amber-900">
        <p className="font-semibold">⚠ {t("El importe calculado no coincide con el importe final del documento")}</p>
        <p className="text-sm">
          {t("Importe final del documento")}: <b>{formatEur(check.final)}</b>
        </p>
        <p className="text-sm">
          {t("Calculado con los precios")}: <b>{formatEur(check.calculated)}</b> · {t("con IVA 21%")}: <b>{formatEur(check.calculatedIva)}</b>
        </p>
        <p className="text-sm">
          {t("Diferencia")}: <b>{formatEur(Math.round((check.final - check.calculated) * 100) / 100)}</b>
        </p>
      </div>
    );
  }
  const text =
    check.kind === "base"
      ? `${t("La suma de las líneas cuadra con la base")} ${formatEur(check.base)} (${t("importe final")} ${formatEur(check.final)})`
      : check.withIva
        ? `${t("Cuadra con el importe final")} ${formatEur(check.final)} (${check.recargo ? t("precios sin IVA + IVA 21% + recargo de equivalencia 5,2%") : t("precios sin IVA + IVA 21%")})`
        : `${t("Cuadra con el importe final")} ${formatEur(check.final)}`;
  return <p className="card font-semibold text-emerald-700">✓ {text}</p>;
}
