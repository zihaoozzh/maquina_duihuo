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
import { parseDiscount, parseNumber, round } from "./num";
import { cleanBarcode, looksLikeBarcode } from "./ean";

export interface Cell {
  text: string;
  /** Borde izquierdo y derecho (en PDF: puntos; en Excel: índice de columna y +1) */
  x0: number;
  x1: number;
}

export type Row = Cell[];

export type LineField = "ean" | "ref" | "description" | "qty" | "price" | "discount" | "total" | "net";

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
  /** Importes del pie del documento (base, total…), para comprobar la suma de líneas */
  footerTotals: number[];
  /** Descuentos globales / líneas negativas sin código de barras (no se guardan como producto) */
  adjustments: number;
  /** Filas sin código de barras que se han descartado por no parecer productos */
  dropped: number;
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
  ean: [kw(["cod. barras", "cod.barras", "cod.barra", "cod barra", "codigo de barras", "codigo barras", "cod barras", "c.barras", "c. barras", "ean", "gtin", "barcode", "条码", "条形码"], 4)],
  ref: [kw(["referencia", "ref.", "ref", "codigo", "cod.", "cod", "货号", "编号", "款号", "item"], 2), kw(["articulo", "art."], 1)],
  description: [
    (h) => (/(^|[^a-z])(cod|codigo|ref)([^a-z]|$)/.test(h) ? 0 : kw(["descripcion", "concepto", "denominacion", "producto", "detalle", "品名", "名称", "商品", "description"], 3)(h)),
    kw(["articulo"], 1),
  ],
  qty: [kw(["cantidad", "cant.", "cant", "uds", "uds.", "unid", "unidades", "ud", "ud.", "qty", "quantity", "pcs", "数量", "件数"], 3)],
  price: [(h) => (/[+]|(^|[^a-z])(dto|dt|iva|final|neto)([^a-z]|$)/.test(h) ? 0 : kw(["precio", "p.unit", "p. unit", "pr.unit", "p/u", "unitario", "price", "单价", "价格"], 3)(h))],
  discount: [(h) => (/[+]/.test(h) ? 0 : kw(["dtos", "dto", "dto.", "descuento", "% desc", "desc.%", "desc %", "%dto", "折扣"], 3)(h))],
  total: [(h) => (/[+]/.test(h) ? 0 : kw(["importe", "total", "neto", "subtotal", "amount", "金额", "合计"], 3)(h))],
  // Precio ya con descuento (y a veces impuestos): "Precio+DTO", "Precio IVA+DT", "Pre.F"…
  net: [kw(["precio+dto", "precio + dto", "precio dto", "precio iva+dt", "iva+dt", "pre.f", "precio final", "precio neto"], 4)],
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

const STOP_WORDS = /^(suma|total|sub ?total|base imponible|iva|i\.v\.a|recargo|portes|importe total|total albaran|total factura|forma de pago|vencimiento|observaciones|合计|总计)/;

function isFooterRow(text: string): boolean {
  return STOP_WORDS.test(normalizeText(text));
}

/**
 * Filas de datos bancarios o de la empresa (IBAN, cuenta para transferencia, SWIFT…):
 * tienen números largos que no son productos.
 */
export function isBankRow(text: string): boolean {
  // IBAN español: ES + 22 dígitos (con o sin espacios)
  if (/ES\d{22}(?!\d)/.test(text.toUpperCase().replace(/[\s-]/g, ""))) return true;
  // "Cuenta / Banco / IBAN / SWIFT…" junto a un número largo que no es un EAN-13
  const n = normalizeText(text);
  if (!/\b(iban|swift|bic|cuenta|cta|ccc|banco|entidad|transferencia|domiciliacion)\b/.test(n)) return false;
  const runs = text.replace(/(\d)[\s.-](?=\d)/g, "$1").match(/\d{10,}/g) ?? [];
  return runs.some((r) => r.length !== 13);
}

export function rowText(row: Row): string {
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

/** Código de barras partido en trozos por un espacio ("84357306305 00"): une números seguidos. */
function findSplitBarcode(tokens: Cell[]): { code: string; used: string[] } | null {
  for (let i = 0; i < tokens.length; i++) {
    if (!/^\d+$/.test(tokens[i].text)) continue;
    let code = "";
    const used: string[] = [];
    for (let j = i; j < tokens.length && /^\d+$/.test(tokens[j].text) && code.length < 14; j++) {
      code += tokens[j].text;
      used.push(tokens[j].text);
      if (used.length > 1 && code.length >= 8 && looksLikeBarcode(code)) return { code, used };
    }
  }
  return null;
}

function finishLine(fields: Partial<Record<LineField, string>>, fallbackTokens: Cell[]): ParsedLine | null {
  const warnings: string[] = [];
  let ean = cleanBarcode(fields.ean ?? "");
  let ref = (fields.ref ?? "").trim();
  const rawDescription = (fields.description ?? "").trim();
  // Sin caracteres chinos; si el nombre es solo chino, se conserva para no dejarlo vacío
  let description = stripCjk(rawDescription) || rawDescription;

  // Si el EAN está en otra columna (ref o descripción), lo encontramos igualmente
  if (!looksLikeBarcode(ean)) {
    const fromOther = fallbackTokens.find((t) => looksLikeBarcode(t.text));
    if (fromOther) {
      ean = cleanBarcode(fromOther.text);
      if (ref === fromOther.text) ref = "";
      description = description.replace(fromOther.text, "").trim();
    } else if (findSplitBarcode(fallbackTokens)) {
      const split = findSplitBarcode(fallbackTokens)!;
      ean = split.code;
      // lo que sobra de la celda del código (p.ej. una referencia pegada) pasa a ser la referencia
      const leftover = (fields.ean ?? "").split(/\s+/).filter((w) => w && !split.used.includes(w)).join(" ");
      if (leftover && !ref) ref = leftover;
      description = description.replace(split.used.join(" "), "").trim();
    } else if (ean && !/^\d{6,14}$/.test(ean)) {
      // no es un código numérico: probablemente es la referencia
      if (!ref) ref = ean;
      ean = "";
    }
  }

  let qty = parseNumber(fields.qty);
  let price = parseNumber(fields.price);
  let discount = parseDiscount(fields.discount);
  let total = parseNumber(fields.total);
  // Si el documento no trae columna de importe pero sí "Precio+DTO", el importe es cantidad × ese precio
  const net = parseNumber(fields.net);
  const totalFromNet = total == null && net != null && qty != null;
  if (totalFromNet) total = round(qty! * net!, 2);

  const consistent = (q: number | null, p: number | null, d: number | null, t: number | null) =>
    q != null && p != null && t != null && close(q * p * (1 - (d ?? 0) / 100), t);

  const netMatchesTotal = net != null && qty != null && total != null && close(qty * net, total);
  if (!totalFromNet && !netMatchesTotal && !consistent(qty, price, discount, total)) {
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

  // Si la cantidad no salió de su columna (quedó pegada al final de la descripción por falta de
  // hueco: "… 110cm 12"), se quita de la descripción.
  if (qty != null && parseNumber(fields.qty) == null && description.endsWith(` ${qty}`)) {
    description = description.slice(0, -String(qty).length).trim();
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

/** Quita los caracteres chinos (y su puntuación) de un texto y normaliza los espacios. */
export function stripCjk(s: string): string {
  return s.replace(/[\u2E80-\u2FDF\u3000-\u303F\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]+/g, " ").replace(/\s+/g, " ").trim();
}

export function parseRows(rows: Row[]): ParsedLine[] {
  return parseRowsDetailed(rows).lines;
}

/**
 * Como `parseRows`, y además devuelve los ajustes (descuentos globales, líneas con importe
 * negativo y sin código de barras) que no se guardan como producto pero cuentan en el total.
 */
export function parseRowsDetailed(rows: Row[]): { lines: ParsedLine[]; adjustments: number; dropped: number } {
  const header = findHeader<LineField>(rows, LINE_HEADER_MATCHERS, { minFields: 3, required: ["qty", "price", "total"] });
  // "Artículo" como única columna de texto es la descripción; si además hay "Descripción", es la referencia/código
  if (header && header.columns.ref && !header.columns.description && /^art/.test(normalizeText(header.columns.ref.text))) {
    header.columns.description = header.columns.ref;
    delete header.columns.ref;
  }
  const lines: ParsedLine[] = [];
  const start = header ? header.rowIndex + 1 : 0;
  // Las columnas de la cabecera que no nos interesan (U/B, %IVA, Caja…) también reciben sus
  // celdas, para que no se mezclen con la columna reconocida más cercana.
  const columnsWithSinks: Partial<Record<LineField | `x${number}`, Cell>> = { ...(header?.columns ?? {}) };
  if (header) {
    const known = new Set(Object.values(header.columns));
    rows[header.rowIndex].forEach((c, i) => {
      if (!known.has(c)) columnsWithSinks[`x${i}`] = c;
    });
  }
  let last: ParsedLine | null = null;

  for (let r = start; r < rows.length; r++) {
    const row = rows[r];
    const text = rowText(row);
    if (!text) continue;
    if (isBankRow(text)) {
      last = null;
      continue;
    }
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
      fields = assignCells<LineField | `x${number}`>(row, columnsWithSinks) as Partial<Record<LineField, string>>;
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
    } else if (last && !hasNumber && (fields.description || fields.ref) && text.length < 80 && /[a-záéíóúñ]{3,}/i.test(text) && !/albar[aá]n|factura|pedido|fecha|p[aá]gina|\d+\s+de\s+\d+/i.test(text)) {
      // Continuación de la descripción en la línea de abajo
      last.description = `${last.description} ${stripCjk(text)}`.trim();
    } else {
      last = null;
    }
  }
  // Si casi todas las líneas tienen código de barras válido, las que no lo tienen no son
  // productos (teléfonos, cuentas, descuentos globales, pies de página…).
  const withEan = lines.filter((l) => looksLikeBarcode(l.ean));
  const rest = lines.filter((l) => !looksLikeBarcode(l.ean));
  const named = rest.filter((l) => l.description);
  if (withEan.length >= 2 && withEan.length >= (withEan.length + named.length) * 0.6) {
    // Cuentan en el total los descuentos (importe negativo) y los cargos con cantidad × precio
    // coherentes con su importe (portes, recargos…); el resto (teléfonos, cuentas…) no.
    const isCharge = (l: ParsedLine) =>
      l.total != null && l.total > 0 && l.qty != null && l.price != null &&
      Math.abs(l.qty * l.price * (1 - (l.discount ?? 0) / 100) - l.total) <= Math.max(0.05, l.total * 0.005);
    const adjustments = rest.filter((l) => l.total != null && (l.total < 0 || isCharge(l))).reduce((sum, l) => sum + (l.total ?? 0), 0);
    const dropped = named.filter((l) => !(l.total != null && l.total < 0)).length;
    return { lines: withEan, adjustments: round(adjustments, 2), dropped };
  }
  return { lines, adjustments: 0, dropped: 0 };
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
  const re = /(albar[aá]n|factura|n[ºo°]\s*(de)?\s*(albar[aá]n|factura|documento|doc\.?)|documento|pedido)\s*(n[ºo°.]*|num\.?|número|numero)?\s*[:#]?\s*([A-Z0-9][A-Z0-9/-]{2,})/gi;
  for (const m of text.matchAll(re)) if (/\d/.test(m[5])) return m[5];
  return "";
}

const COMPANY_RE = /\b(S\.?\s?L\.?\s?U?|S\.?\s?A\.?\s?U?|S\.?\s?L\.?\s?L|S\.?\s?C\.?|C\.?\s?B\.?)\.?(?=\s|,|$)/i;
const DOC_TITLE_RE = /^(factura|albaran|albarán|pedido|presupuesto|duplicado|original|hoja)\b/i;

/** Proveedor: primera celda con forma de empresa (S.L., S.A.…); si no hay, la primera que no sea el título. */
export function findSupplier(rows: Row[]): string {
  const cells = rows.slice(0, 25).flat().map((c) => c.text.trim()).filter((t) => /[a-zA-Z]{3,}/.test(t));
  // Albarán que solo trae el bloque del cliente ("Cliente ID: …"): el proveedor no consta
  if (!cells.some((t) => COMPANY_RE.test(t) && t.length <= 80 && !/^[\d\s]+$/.test(t)) && cells.some((t) => /^cliente\b/i.test(t))) return "";
  const company = cells.find((t) => COMPANY_RE.test(t) && t.length <= 80 && !/^[\d\s]+$/.test(t));
  if (company) {
    const m = COMPANY_RE.exec(company);
    return company.slice(0, m ? m.index + m[0].length : 60).trim().replace(/[,;]$/, "");
  }
  return (cells.find((t) => !DOC_TITLE_RE.test(t)) ?? "").slice(0, 60);
}

/** Número del documento: el que está bajo la cabecera "Factura / Fecha / Cliente" o "Nº de documento". */
export function findNumberUnderHeader(rows: Row[]): string {
  const label = /^(factura|albaran|pedido|presupuesto|n[ºo°.]? ?(de )?(factura|albaran|pedido|documento|doc\.?))$/;
  for (let r = 0; r < rows.length - 1; r++) {
    const heads = rows[r].filter((c) => label.test(normalizeText(c.text)));
    if (heads.length === 0 || !rows[r].some((c) => /^fecha/.test(normalizeText(c.text)))) continue;
    for (const h of heads) {
      const hc = (h.x0 + h.x1) / 2;
      for (let j = r + 1; j <= r + 4 && j < rows.length; j++) {
        let best: Cell | null = null;
        let bd = Infinity;
        for (const c of rows[j]) {
          if (!/^(?=.*\d)[A-Z0-9][\w/.-]{3,}$/i.test(c.text) || DATE_RE.test(c.text)) continue;
          const d = Math.abs((c.x0 + c.x1) / 2 - hc);
          if (d < bd) {
            bd = d;
            best = c;
          }
        }
        if (best && bd <= Math.max(h.x1 - h.x0, best.x1 - best.x0) * 1.5 + 1) return best.text;
      }
    }
  }
  return "";
}

/** Importes del pie del documento (base, total…) para comprobar que la suma de líneas cuadra. */
export function findFooterTotals(rows: Row[], fromRow: number): number[] {
  const out = new Set<number>();
  for (let r = fromRow; r < rows.length; r++) {
    const text = rowText(rows[r]);
    if (isBankRow(text)) continue;
    for (const c of rows[r]) {
      if (/%/.test(c.text)) continue;
      for (const tok of c.text.split(/\s+/)) {
        const n = /\d[.,]\d{2}$/.test(tok) ? parseNumber(tok.replace(/[()]/g, "")) : null;
        if (n != null && n > 0) out.add(round(n, 2));
      }
    }
  }
  return [...out];
}

export function parseDocument(rows: Row[]): ParsedDocument {
  const { lines, adjustments, dropped } = parseRowsDetailed(rows);
  const header = findHeader<LineField>(rows, LINE_HEADER_MATCHERS, { minFields: 3, required: ["qty", "price", "total"] });
  const allText = rows.map(rowText).join("\n");
  // El pie del documento empieza después de la fila de la última línea de producto
  let lastLineRow = header?.rowIndex ?? 0;
  const lastEan = lines.length ? lines[lines.length - 1].ean : "";
  if (lastEan) {
    for (let r = rows.length - 1; r >= 0; r--) {
      if (rowText(rows[r]).replace(/\s/g, "").includes(lastEan)) {
        lastLineRow = r;
        break;
      }
    }
  }
  const labelled = /(?:n[úu]mero|n[ºo°])\s*de\s*(?:factura|albar[aá]n|pedido|documento)\s*:\s*([A-Z0-9][\w/.-]{2,})/i.exec(allText)?.[1];
  return {
    lines,
    supplier: findSupplier(rows),
    number: labelled ?? (findNumberUnderHeader(rows) || findDocNumber(allText)),
    date: findDate(allText),
    mode: header ? "header" : "heuristic",
    footerTotals: findFooterTotals(rows, lastLineRow + 1),
    adjustments,
    dropped,
  };
}
