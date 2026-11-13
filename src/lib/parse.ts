/**
 * Lectura de albaranes/facturas SIN IA.
 *
 * Entrada: filas de celdas con posición horizontal (vienen de un PDF con texto o de un Excel).
 * Salida: líneas de producto con código de barras, descripción, cantidad, precio e importe.
 *
 * Estrategia:
 *  1. Buscar la fila de cabecera (Código / Descripción / Cantidad / Precio / Importe…).
 *     Si existe, cada celda de las filas siguientes se asigna a la columna de cabecera
 *     que tiene encima.
 *  2. Siempre se comprueba la coherencia cantidad × precio ≈ importe. Si las columnas no
 *     cuadran (o no hay cabecera) se deducen los números por esa relación.
 */
import { parseNumber, round } from "./num";
import { cleanBarcode, looksLikeBarcode } from "./ean";

export interface Cell {
  text: string;
  /** Borde izquierdo y derecho (en PDF: puntos; en Excel: índice de columna y +1) */
  x0: number;
  x1: number;
}

export type Row = Cell[];

export type LineField = "ean" | "ref" | "description" | "qty" | "price" | "discount" | "total";

export interface ParsedLine {
  ean: string;
  ref: string;
  description: string;
  qty: number | null;
  price: number | null;
  discount: number | null;
  total: number | null;
  /** Avisos para que la persona revise la línea */
  warnings: string[];
}

export interface ParsedDocument {
  lines: ParsedLine[];
  supplier: string;
  number: string;
  date: string; // ISO yyyy-mm-dd o ""
  /** "header" si se encontró la cabecera de columnas, "heuristic" si se dedujo */
  mode: "header" | "heuristic";
}

// ---------------------------------------------------------------------------
// Cabeceras

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type Matcher = (h: string) => number; // 0 = no coincide; más alto = más seguro

function kw(words: string[], score = 2): Matcher {
  return (h) => {
    for (const w of words) {
      if (w.length <= 3 && /^[a-z.]+$/.test(w)) {
        // palabras cortas: deben ser una palabra completa ("ud", "dto", "ean")
        const re = new RegExp(`(^|[^a-z])${w.replace(/\./g, "\\.")}([^a-z]|$)`);
        if (re.test(h)) return score;
      } else if (h.includes(w)) return score;
    }
    return 0;
  };
}

export const LINE_HEADER_MATCHERS: Record<LineField, Matcher[]> = {
  ean: [kw(["cod. barras", "cod.barras", "codigo de barras", "codigo barras", "cod barras", "c.barras", "c. barras", "ean", "gtin", "barcode", "条码", "条形码"], 4)],
  ref: [kw(["referencia", "ref.", "ref", "codigo", "cod.", "cod", "货号", "编号", "款号", "item"], 2), kw(["articulo", "art."], 1)],
  description: [
    (h) => (/(^|[^a-z])(cod|codigo|ref)([^a-z]|$)/.test(h) ? 0 : kw(["descripcion", "concepto", "denominacion", "producto", "detalle", "品名", "名称", "商品", "description"], 3)(h)),
    kw(["articulo"], 1),
  ],
  qty: [kw(["cantidad", "cant.", "cant", "uds", "uds.", "unid", "unidades", "ud", "ud.", "qty", "quantity", "pcs", "数量", "件数"], 3)],
  price: [kw(["precio", "p.unit", "p. unit", "pr.unit", "p/u", "unitario", "price", "单价", "价格"], 3)],
  discount: [kw(["dto", "dto.", "descuento", "% desc", "desc.%", "desc %", "%dto", "折扣"], 3)],
  total: [kw(["importe", "total", "neto", "subtotal", "amount", "金额", "合计"], 3)],
};

/** Puntúa una celda de cabecera contra cada campo. */
function scoreHeaderCell<F extends string>(text: string, matchers: Record<F, Matcher[]>): Partial<Record<F, number>> {
  const h = normalizeText(text);
  const out: Partial<Record<F, number>> = {};
  if (!h || h.length > 40) return out;
  for (const field of Object.keys(matchers) as F[]) {
    const s = Math.max(0, ...matchers[field].map((m) => m(h)));
    if (s > 0) out[field] = s;
  }
  return out;
}

export interface HeaderMatch<F extends string> {
  rowIndex: number;
  columns: Partial<Record<F, Cell>>;
}

/**
 * Busca la fila de cabecera. Requiere al menos `minFields` campos distintos reconocidos
 * y que estén entre los `required` (al menos uno).
 */
export function findHeader<F extends string>(
  rows: Row[],
  matchers: Record<F, Matcher[]>,
  opts: { minFields?: number; required?: F[]; maxRows?: number } = {},
): HeaderMatch<F> | null {
  const minFields = opts.minFields ?? 3;
  let best: { score: number; match: HeaderMatch<F> } | null = null;
  const limit = Math.min(rows.length, opts.maxRows ?? rows.length);
  for (let r = 0; r < limit; r++) {
    const row = rows[r];
    // candidatos (campo, celda, puntuación), asignación voraz por puntuación
    const cands: { field: F; cell: Cell; score: number }[] = [];
    for (const cell of row) {
      const scores = scoreHeaderCell(cell.text, matchers);
      for (const f of Object.keys(scores) as F[]) cands.push({ field: f, cell, score: scores[f]! });
    }
    cands.sort((a, b) => b.score - a.score);
    const columns: Partial<Record<F, Cell>> = {};
    const usedCells = new Set<Cell>();
    let score = 0;
    for (const c of cands) {
      if (columns[c.field] || usedCells.has(c.cell)) continue;
      columns[c.field] = c.cell;
      usedCells.add(c.cell);
      score += c.score;
    }
    const n = Object.keys(columns).length;
    if (n < minFields) continue;
    if (opts.required && !opts.required.some((f) => columns[f])) continue;
    if (!best || score > best.score) best = { score, match: { rowIndex: r, columns } };
  }
  return best?.match ?? null;
}

// ---------------------------------------------------------------------------
// Asignación de celdas a columnas

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/** Asigna cada celda a la columna de cabecera más cercana. */
export function assignCells<F extends string>(row: Row, columns: Partial<Record<F, Cell>>): Partial<Record<F, string>> {
  const entries = Object.entries(columns) as [F, Cell][];
  entries.sort((a, b) => a[1].x0 - b[1].x0);
  const out: Partial<Record<F, string[]>> = {};
  for (const cell of row) {
    let bestField: F | null = null;
    let bestScore = -Infinity;
    const cc = (cell.x0 + cell.x1) / 2;
    for (let i = 0; i < entries.length; i++) {
      const [field, h] = entries[i];
      // Zona de la columna: desde la mitad del hueco con la anterior hasta la mitad con la siguiente
      const prev = entries[i - 1]?.[1];
      const next = entries[i + 1]?.[1];
      const zone0 = prev ? (prev.x1 + h.x0) / 2 : -Infinity;
      const zone1 = next ? (h.x1 + next.x0) / 2 : Infinity;
      const ov = overlap(cell.x0, cell.x1, h.x0, h.x1);
      const inZone = cc >= zone0 && cc < zone1;
      const hc = (h.x0 + h.x1) / 2;
      const score = ov * 10 + (inZone ? 5 : 0) - Math.abs(cc - hc) / 100;
      if (score > bestScore) {
        bestScore = score;
        bestField = field;
      }
    }
    if (bestField) (out[bestField] ??= []).push(cell.text);
  }
  const joined: Partial<Record<F, string>> = {};
  for (const f of Object.keys(out) as F[]) joined[f] = out[f]!.join(" ").trim();
  return joined;
}

// ---------------------------------------------------------------------------
// Deducción por coherencia numérica

const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 0.011);

export interface NumericGuess {
  qty: number | null;
  price: number | null;
  discount: number | null;
  total: number | null;
  consistent: boolean;
}

/**
 * Dada la lista de números de una fila (en orden de izquierda a derecha), busca
 * cantidad, precio, (descuento) e importe tales que cantidad × precio × (1 − dto) ≈ importe.
 */
export function guessNumbers(nums: number[]): NumericGuess {
  const n = nums.length;
  let best: (NumericGuess & { rank: number }) | null = null;
  const consider = (g: NumericGuess, rank: number) => {
    if (!best || rank > best.rank) best = { ...g, rank };
  };
  for (let k = n - 1; k >= 0; k--) {
    const total = nums[k];
    if (total === 0) continue;
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        const a = nums[i];
        const b = nums[j];
        // ¿Cuál es la cantidad? La entera; si ambas o ninguna, la primera.
        const aInt = Number.isInteger(a);
        const bInt = Number.isInteger(b);
        const [qty, price] = !aInt && bInt ? [b, a] : [a, b];
        // Preferimos el importe más a la derecha y los factores más cercanos a él
        const rankBase = k * 100 + j * 10 + i;
        if (close(qty * price, total)) {
          consider({ qty, price, discount: null, total, consistent: true }, rankBase + 10000);
          continue;
        }
        for (let d = 0; d < n; d++) {
          if (d === i || d === j || d === k) continue;
          const dto = nums[d];
          if (!(dto > 0 && dto < 100)) continue;
          if (close(qty * price * (1 - dto / 100), total)) {
            // El descuento suele ir entre el precio y el importe
            consider({ qty, price, discount: dto, total, consistent: true }, rankBase + (d > j ? 5000 : 1000));
          }
        }
      }
    }
    if (best) break; // el importe más a la derecha que cuadra
  }
  if (best) {
    const { rank: _rank, ...g } = best as NumericGuess & { rank: number };
    void _rank;
    return g;
  }
  // Sin coherencia: suposición simple
  if (n >= 3) return { qty: nums[0], price: nums[n - 2], discount: null, total: nums[n - 1], consistent: false };
  if (n === 2) {
    const [a, b] = nums;
    if (Number.isInteger(a) && a > 0 && a < 10000) return { qty: a, price: b, discount: null, total: null, consistent: false };
    return { qty: null, price: a, discount: null, total: b, consistent: false };
  }
  if (n === 1) return { qty: null, price: nums[0], discount: null, total: null, consistent: false };
  return { qty: null, price: null, discount: null, total: null, consistent: false };
}

// ---------------------------------------------------------------------------
// Filas → líneas

const STOP_WORDS = /^(suma|total|subtotal|base imponible|iva|i\.v\.a|recargo|portes|importe total|total albaran|total factura|forma de pago|vencimiento|observaciones|合计|总计)/;

function isFooterRow(text: string): boolean {
  return STOP_WORDS.test(normalizeText(text));
}

function rowText(row: Row): string {
  return row.map((c) => c.text).join(" ").trim();
}

/** Divide una celda en palabras manteniendo una posición aproximada para cada una. */
function splitTokens(row: Row): Cell[] {
  const out: Cell[] = [];
  for (const c of row) {
    const parts = c.text.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) {
      if (parts.length) out.push({ ...c, text: parts[0] });
      continue;
    }
    const totalLen = parts.reduce((s, p) => s + p.length + 1, -1);
    let pos = 0;
    for (const p of parts) {
      const x0 = c.x0 + ((c.x1 - c.x0) * pos) / totalLen;
      pos += p.length;
      const x1 = c.x0 + ((c.x1 - c.x0) * pos) / totalLen;
      pos += 1;
      out.push({ text: p, x0, x1 });
    }
  }
  return out;
}

function finishLine(fields: Partial<Record<LineField, string>>, fallbackTokens: Cell[]): ParsedLine | null {
  const warnings: string[] = [];
  let ean = cleanBarcode(fields.ean ?? "");
  let ref = (fields.ref ?? "").trim();
  let description = (fields.description ?? "").trim();

  // Si el EAN está en otra columna (ref o descripción), lo encontramos igualmente
  if (!looksLikeBarcode(ean)) {
    const fromOther = fallbackTokens.find((t) => looksLikeBarcode(t.text));
    if (fromOther) {
      ean = cleanBarcode(fromOther.text);
      if (ref === fromOther.text) ref = "";
      description = description.replace(fromOther.text, "").trim();
    } else if (ean && !/^\d{6,14}$/.test(ean)) {
      // no es un código numérico: probablemente es la referencia
      if (!ref) ref = ean;
      ean = "";
    }
  }

  let qty = parseNumber(fields.qty);
  let price = parseNumber(fields.price);
  let discount = parseNumber(fields.discount);
  let total = parseNumber(fields.total);

  const consistent = (q: number | null, p: number | null, d: number | null, t: number | null) =>
    q != null && p != null && t != null && close(q * p * (1 - (d ?? 0) / 100), t);

  if (!consistent(qty, price, discount, total)) {
    // Recoger todos los números de la fila (salvo códigos) y deducir
    const nums = fallbackTokens
      .map((t) => t.text)
      .filter((t) => !looksLikeBarcode(t) && !(t === ref) && !/^\d{6,}$/.test(t))
      .map((t) => parseNumber(t.replace(/%$/, "")))
      .filter((v): v is number => v != null);
    const g = guessNumbers(nums);
    if (g.consistent) {
      qty = g.qty;
      price = g.price;
      discount = g.discount;
      total = g.total;
    } else {
      qty ??= g.qty;
      price ??= g.price;
      total ??= g.total;
      if (qty != null && price != null && total != null) warnings.push("Cantidad × precio no coincide con el importe");
    }
  }

  if (qty == null && price != null && total != null && price !== 0) {
    const q = total / price;
    if (Math.abs(q - Math.round(q)) < 0.01) qty = Math.round(q);
  }
  if (price == null && qty && total != null) price = round(total / qty / (1 - (discount ?? 0) / 100), 4);
  if (total == null && qty != null && price != null) total = round(qty * price * (1 - (discount ?? 0) / 100), 2);

  if (!description && !ean && !ref) return null;
  if (qty == null && price == null) return null;
  if (!ean) warnings.push("Sin código de barras");
  else if (!looksLikeBarcode(ean)) warnings.push("Código de barras dudoso");
  if (qty == null) warnings.push("Falta la cantidad");
  if (price == null) warnings.push("Falta el precio");

  return { ean, ref, description, qty, price, discount, total, warnings };
}

export function parseRows(rows: Row[]): ParsedLine[] {
  const header = findHeader(rows, LINE_HEADER_MATCHERS, { minFields: 3, required: ["qty", "price", "total"] });
  const lines: ParsedLine[] = [];
  const start = header ? header.rowIndex + 1 : 0;
  let last: ParsedLine | null = null;

  for (let r = start; r < rows.length; r++) {
    const row = rows[r];
    const text = rowText(row);
    if (!text) continue;
    if (lines.length > 0 && isFooterRow(text)) {
      // el pie de página no termina el documento si hay otra cabecera (página siguiente)
      last = null;
      continue;
    }
    // Cabecera repetida en la siguiente página
    if (header && r !== header.rowIndex && findHeader([row], LINE_HEADER_MATCHERS, { minFields: 3, required: ["qty", "price", "total"] })) {
      last = null;
      continue;
    }
    const tokens = splitTokens(row);
    const hasNumber = tokens.some((t) => parseNumber(t.text) != null);
    let fields: Partial<Record<LineField, string>>;
    if (header) {
      fields = assignCells(row, header.columns);
    } else {
      // Sin cabecera: el texto no numérico es la descripción
      const textTokens = tokens.filter((t) => parseNumber(t.text) == null && !looksLikeBarcode(t.text));
      fields = { description: textTokens.map((t) => t.text).join(" ") };
      // Una referencia alfanumérica al principio (p.ej. "AB-123")
      const first = tokens[0]?.text ?? "";
      if (/^[A-Z0-9][A-Z0-9./-]{2,}$/i.test(first) && /\d/.test(first) && !looksLikeBarcode(first)) {
        fields.ref = first;
        fields.description = textTokens.filter((t) => t.text !== first).map((t) => t.text).join(" ");
      }
    }

    const line = hasNumber ? finishLine(fields, tokens) : null;
    if (line) {
      lines.push(line);
      last = line;
    } else if (last && !hasNumber && fields.description && text.length < 80) {
      // Continuación de la descripción en la línea de abajo
      last.description = `${last.description} ${text}`.trim();
    } else {
      last = null;
    }
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Datos del documento

const DATE_RE = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/;

export function findDate(text: string): string {
  const m = DATE_RE.exec(text);
  if (!m) return "";
  let [, d, mo, y] = m;
  if (y.length === 2) y = `20${y}`;
  const dd = Number(d);
  const mm = Number(mo);
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return "";
  return `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

export function findDocNumber(text: string): string {
  const m = /(albar[aá]n|factura|n[ºo°]\s*(de)?\s*(albar[aá]n|factura|documento|doc\.?)|documento|pedido)\s*(n[ºo°.]*|num\.?|número|numero)?\s*[:#]?\s*([A-Z0-9][A-Z0-9/-]{2,})/i.exec(text);
  return m?.[5] ?? "";
}

export function parseDocument(rows: Row[]): ParsedDocument {
  const lines = parseRows(rows);
  const header = findHeader(rows, LINE_HEADER_MATCHERS, { minFields: 3, required: ["qty", "price", "total"] });
  const allText = rows.map(rowText).join("\n");
  const firstText = rows.map(rowText).find((t) => t && /[a-z]{3,}/i.test(t)) ?? "";
  return {
    lines,
    supplier: firstText.slice(0, 60),
    number: findDocNumber(allText),
    date: findDate(allText),
    mode: header ? "header" : "heuristic",
  };
}
