/**
 * Lectura con IA de fotos y PDF escaneados. Las imágenes se reducen en el móvil
 * y se envían a la función «leer-albaran» de la base de datos compartida, que
 * es la que tiene la clave de la IA.
 */
import { getClient, isReady } from "./cloud";
import { cleanBarcode, looksLikeBarcode } from "./ean";
import { round } from "./num";
import type { ParsedDocument, ParsedLine } from "./parse";

export interface PageImage {
  media_type: "image/jpeg";
  data: string;
}

const MAX_SIDE = 2000;
const MAX_PAGES = 10;

function canvasToBase64(canvas: HTMLCanvasElement, quality = 0.85): string {
  return canvas.toDataURL("image/jpeg", quality).split(",")[1];
}

function fitCanvas(w: number, h: number): HTMLCanvasElement {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  return c;
}

/** Foto → JPEG reducido (respeta la orientación de la cámara). */
export async function imageFileToPage(file: File): Promise<PageImage> {
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Safari antiguo: cargar con <img>
    const url = URL.createObjectURL(file);
    try {
      source = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("No se pudo abrir la foto (¿formato HEIC?). Prueba a hacerla desde la app."));
        img.src = url;
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
  }
  const c = fitCanvas(source.width, source.height);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(source, 0, 0, c.width, c.height);
  if ("close" in source) source.close();
  return { media_type: "image/jpeg", data: canvasToBase64(c) };
}

/** PDF (escaneado) → una imagen por página. */
export async function pdfToPages(data: ArrayBuffer): Promise<PageImage[]> {
  const { renderPdfPages } = await import("./pdf");
  const canvases = await renderPdfPages(data, MAX_PAGES, MAX_SIDE);
  return canvases.map((c) => ({ media_type: "image/jpeg", data: canvasToBase64(c) }));
}

interface AiAlbaran {
  supplier: string;
  number: string;
  date: string;
  lines: {
    ean: string;
    ref: string;
    description: string;
    qty: number | null;
    price: number | null;
    discount: number | null;
    total: number | null;
    doubtful: boolean;
  }[];
}

/** Revisa lo que devuelve la IA con las mismas comprobaciones que la lectura sin IA. */
export function reviewAiLines(lines: AiAlbaran["lines"]): ParsedLine[] {
  return lines.map((l) => {
    const warnings: string[] = [];
    const ean = cleanBarcode(l.ean);
    let { qty, price, total } = l;
    const discount = l.discount || null;
    if (total == null && qty != null && price != null) total = round(qty * price * (1 - (discount ?? 0) / 100));
    if (qty == null && price && total != null) {
      const q = total / price / (1 - (discount ?? 0) / 100);
      if (Math.abs(q - Math.round(q)) < 0.01) qty = Math.round(q);
    }
    if (l.doubtful) warnings.push("Dudoso en la foto");
    if (!ean) warnings.push("Sin código de barras");
    else if (!looksLikeBarcode(ean)) warnings.push("Código de barras dudoso");
    if (qty == null) warnings.push("Falta la cantidad");
    if (price == null) warnings.push("Falta el precio");
    if (qty != null && price != null && total != null) {
      const expected = qty * price * (1 - (discount ?? 0) / 100);
      if (Math.abs(expected - total) > Math.max(0.02, Math.abs(total) * 0.011)) warnings.push("Cantidad × precio no coincide con el importe");
    }
    return { ean, ref: l.ref.trim(), description: l.description.trim(), qty, price, discount, total, warnings };
  });
}

export class AiNotAvailable extends Error {}

export function aiAvailable(): boolean {
  return isReady();
}

export async function readWithAi(pages: PageImage[]): Promise<ParsedDocument> {
  const sb = getClient();
  if (!sb || !isReady()) throw new AiNotAvailable("Para leer fotos con IA, conecta la base de datos en Ajustes.");
  const { data, error } = await sb.functions.invoke<AiAlbaran>("leer-albaran", { body: { images: pages } });
  if (error) {
    // El mensaje de error de la función viene en el cuerpo de la respuesta
    let message = error.message;
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = body.error;
    } catch {
      /* sin cuerpo */
    }
    throw new Error(message);
  }
  if (!data || !Array.isArray(data.lines)) throw new Error("Respuesta vacía de la IA.");
  return {
    lines: reviewAiLines(data.lines),
    supplier: data.supplier ?? "",
    number: data.number ?? "",
    date: /^\d{4}-\d{2}-\d{2}$/.test(data.date ?? "") ? data.date : "",
    mode: "heuristic",
  };
}
