import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import LinesEditor, { emptyLine, fromEditable, toEditable, type EditableLine } from "../components/LinesEditor";
import { parseDocument, rowsToText, type ParsedDocument, type Row } from "../lib/parse";
import { saveDocument, type DocSource } from "../lib/db";
import { t } from "../lib/i18n";
import type { PageImage } from "../lib/ai";

type Step = { kind: "pick" } | { kind: "reading" } | { kind: "review" };

function kindOf(file: File): DocSource {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (/\.(xlsx|xls|xlsm|ods|csv)$/.test(name) || file.type.includes("sheet") || file.type.includes("excel") || file.type === "text/csv") return "excel";
  if (file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/.test(name)) return "photo";
  return "pdf";
}

const EMPTY: ParsedDocument = { lines: [], supplier: "", number: "", date: "", mode: "heuristic" };

/** off = sin IA · read = leído por la IA (fotos) · checked = lectura automática revisada con la IA (PDF/Excel) */
type AiMode = "off" | "read" | "checked";

interface ReadResult {
  doc: ParsedDocument;
  notice: string;
  ai: AiMode;
}

/** Fotos (una o varias páginas) o PDF escaneado → IA */
async function readWithAiOrNotice(getPages: () => Promise<PageImage[]>, noAiNotice: string): Promise<ReadResult> {
  const ai = await import("../lib/ai");
  if (!ai.aiAvailable()) return { doc: EMPTY, notice: t(noAiNotice), ai: "off" };
  const doc = await ai.readWithAi(await getPages());
  return { doc, notice: doc.lines.length ? "" : t("No se ha encontrado ninguna línea de producto."), ai: "read" };
}

/**
 * PDF con texto o Excel: lectura automática y, si hay conexión, la IA lee el mismo
 * texto y se comparan (la IA descarta números que no son de productos).
 */
async function readTextDocument(rows: Row[]): Promise<ReadResult> {
  const auto = parseDocument(rows);
  const noLines = t("No se ha encontrado ninguna línea de producto.");
  const ai = await import("../lib/ai");
  if (!ai.aiAvailable() || navigator.onLine === false) {
    return { doc: auto, notice: auto.lines.length ? t("Sin revisión de la IA (sin conexión o sin base de datos): revisa los números con cuidado.") : noLines, ai: "off" };
  }
  const text = rowsToText(rows);
  try {
    const [aiDoc, { reconcile }] = await Promise.all([ai.readTextWithAi(text), import("../lib/reconcile")]);
    const lines = reconcile(auto.lines, aiDoc.lines, text);
    const doc: ParsedDocument = {
      lines,
      supplier: aiDoc.supplier || auto.supplier,
      number: aiDoc.number || auto.number,
      date: aiDoc.date || auto.date,
      mode: auto.mode,
    };
    return { doc, notice: lines.length ? "" : noLines, ai: "checked" };
  } catch (e) {
    console.error(e);
    const why = e instanceof Error ? ` (${t(e.message)})` : "";
    return { doc: auto, notice: `${t("La IA no ha podido revisar el documento: revisa los números con cuidado.")}${why}`, ai: "off" };
  }
}

async function readFiles(files: File[]): Promise<ReadResult> {
  const kinds = files.map(kindOf);
  if (kinds.every((k) => k === "photo")) {
    const ai = await import("../lib/ai");
    return readWithAiOrNotice(
      () => Promise.all(files.map(ai.imageFileToPage)),
      "Para leer fotos con IA, conecta la base de datos en Ajustes. Mientras tanto puedes añadir las líneas a mano.",
    );
  }
  const file = files[0];
  const data = await file.arrayBuffer();
  if (kindOf(file) === "excel") {
    const { readSpreadsheet } = await import("../lib/excel");
    // La hoja con más líneas de producto
    const sheets = readSpreadsheet(data).map((s) => ({ rows: s.rows, n: parseDocument(s.rows).lines.length }));
    const best = sheets.sort((a, b) => b.n - a.n)[0];
    if (!best) return { doc: EMPTY, notice: t("No se ha encontrado ninguna línea de producto."), ai: "off" };
    return readTextDocument(best.rows);
  }
  const { readPdf } = await import("../lib/pdf");
  const pdf = await readPdf(data.slice(0));
  if (pdf.scanned) {
    const ai = await import("../lib/ai");
    return readWithAiOrNotice(
      () => ai.pdfToPages(data),
      "Este PDF es escaneado (es una imagen). Para leerlo con IA, conecta la base de datos en Ajustes. Mientras tanto puedes añadir las líneas a mano.",
    );
  }
  return readTextDocument(pdf.rows);
}

export default function UploadPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [files, setFiles] = useState<File[]>([]);
  const [aiMode, setAiMode] = useState<AiMode>("off");
  const [notice, setNotice] = useState("");
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [meta, setMeta] = useState({ supplier: "", number: "", date: "" });
  const [saving, setSaving] = useState(false);

  async function onFiles(list: FileList | null | undefined) {
    const picked = list ? Array.from(list) : [];
    if (picked.length === 0) return;
    setFiles(picked);
    setStep({ kind: "reading" });
    try {
      const { doc, notice, ai } = await readFiles(picked);
      setNotice(notice);
      setAiMode(ai);
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
      const id = await saveDocument({ ...meta, fileName: files.map((f) => f.name).join(", "), source: aiMode === "read" && kindOf(files[0]) === "photo" ? "photo" : kindOf(files[0]) }, clean);
      navigate(`/albaranes/${id}`, { replace: true });
    } finally {
      setSaving(false);
    }
  }

  if (step.kind === "reading") {
    return (
      <div className="card py-12 text-center text-lg font-semibold text-slate-600">
        {t("Leyendo documento…")}
        <p className="mt-2 text-sm font-normal">{t("Con fotos puede tardar hasta un minuto.")}</p>
      </div>
    );
  }

  if (step.kind === "pick") {
    return (
      <div className="space-y-4">
        <div className="card space-y-3 text-center">
          <p className="text-slate-600">{t("PDF, Excel o foto del albarán o factura")}</p>
          <p className="text-xs text-slate-500">{t("Si el albarán tiene varias páginas, elige todas las fotos a la vez.")}</p>
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
            multiple
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
          {files.map((f) => f.name).join(", ")} · {aiMode === "read" ? t("Leído con IA") : aiMode === "checked" ? t("Revisado con IA") : t("Leído sin IA")}
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
      {aiMode !== "off" && <p className="text-sm font-semibold text-amber-700">{t("La IA puede equivocarse: revisa sobre todo las líneas en amarillo.")}</p>}
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
