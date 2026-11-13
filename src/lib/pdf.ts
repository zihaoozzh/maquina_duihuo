/** Extrae el texto de un PDF con sus posiciones y lo agrupa en filas/celdas. */
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { Cell, Row } from "./parse";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface Item {
  text: string;
  x0: number;
  x1: number;
  y: number;
  h: number;
}

export interface PdfText {
  rows: Row[];
  pages: number;
  /** true si casi no hay texto (PDF escaneado → hace falta leerlo como foto) */
  scanned: boolean;
}

export function itemsToRows(items: Item[]): Row[] {
  // Agrupar por línea: misma altura (y) con tolerancia según el tamaño de letra
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x0 - b.x0);
  const lines: Item[][] = [];
  for (const it of sorted) {
    const line = lines[lines.length - 1];
    const ref = line?.[0];
    if (line && Math.abs(ref.y - it.y) <= Math.max(2, Math.min(ref.h, it.h) * 0.45)) line.push(it);
    else lines.push([it]);
  }
  return lines.map((line) => {
    line.sort((a, b) => a.x0 - b.x0);
    const cells: Cell[] = [];
    for (const it of line) {
      const prev = cells[cells.length - 1];
      const gap = prev ? it.x0 - prev.x1 : Infinity;
      if (prev && gap < it.h * 0.8) {
        prev.text = gap > it.h * 0.15 ? `${prev.text} ${it.text}` : `${prev.text}${it.text}`;
        prev.x1 = Math.max(prev.x1, it.x1);
      } else {
        cells.push({ text: it.text, x0: it.x0, x1: it.x1 });
      }
    }
    return cells.map((c) => ({ ...c, text: c.text.replace(/\s+/g, " ").trim() })).filter((c) => c.text);
  });
}

export async function readPdf(data: ArrayBuffer): Promise<PdfText> {
  const task = pdfjs.getDocument({
    data: new Uint8Array(data),
    cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
    cMapPacked: true,
  });
  const doc = await task.promise;
  const pages = doc.numPages;
  const rows: Row[] = [];
  let chars = 0;
  try {
    for (let p = 1; p <= pages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items: Item[] = [];
      for (const raw of content.items) {
        if (!("str" in raw)) continue;
        const text = raw.str;
        if (!text.trim()) continue;
        const [a, b, , , e, f] = raw.transform as number[];
        const h = raw.height || Math.hypot(a, b) || 10;
        items.push({ text, x0: e, x1: e + (raw.width || text.length * h * 0.5), y: f, h });
        chars += text.trim().length;
      }
      rows.push(...itemsToRows(items));
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return { rows, pages, scanned: chars < 30 * Math.max(1, pages) };
}

/** Dibuja las páginas del PDF (para leer con IA los escaneados). */
export async function renderPdfPages(data: ArrayBuffer, maxPages: number, maxSide: number): Promise<HTMLCanvasElement[]> {
  const task = pdfjs.getDocument({
    data: new Uint8Array(data),
    cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
    cMapPacked: true,
  });
  const doc = await task.promise;
  const out: HTMLCanvasElement[] = [];
  try {
    const n = Math.min(doc.numPages, maxPages);
    for (let p = 1; p <= n; p++) {
      const page = await doc.getPage(p);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(3, maxSide / Math.max(base.width, base.height)) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      out.push(canvas);
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return out;
}
