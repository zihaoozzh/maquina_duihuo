/**
 * Convierte un texto con número en formato español ("1.234,56"), inglés
 * ("1,234.56") o simple ("12", "3,5", "0.75") a number. Devuelve null si no es un número.
 */
export function parseNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/[€$\s ]/g, "").replace(/EUR$/i, "");
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (!/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    // El último separador es el decimal.
    normalized =
      lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const parts = s.split(",");
    // "1,234,567" → miles; "3,5" o "12,500" → decimal (en albaranes españoles la coma es decimal)
    normalized = parts.length > 2 ? parts.join("") : s.replace(",", ".");
  } else if (lastDot >= 0) {
    const parts = s.split(".");
    // "1.234.567" → miles. "1.234" es ambiguo: en España suele ser miles si hay 3 decimales
    // exactos y la parte entera no empieza por 0; pero precios como "1.250" (1,25 €) existen.
    // Lo tratamos como decimal salvo que haya más de un punto.
    normalized = parts.length > 2 ? parts.join("") : s;
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/**
 * Descuento en %: "5,00%", "17,35" o encadenado "12+7+4" (se aplican uno tras otro).
 * Devuelve el % total equivalente (12+7+4 → 21,43) o null si no es un descuento.
 */
export function parseDiscount(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (raw == null) return null;
  const s = String(raw).replace(/%/g, "").replace(/\s/g, "");
  if (!s) return null;
  if (!s.includes("+")) return parseNumber(s);
  const parts = s.split("+").map((p) => parseNumber(p));
  if (parts.some((p) => p == null || p < 0 || p > 100)) return null;
  return round((1 - (parts as number[]).reduce((acc, d) => acc * (1 - d / 100), 1)) * 100, 2);
}

/** ¿El texto parece un número (cantidad, precio, importe)? */
export function looksNumeric(raw: string): boolean {
  return parseNumber(raw) !== null;
}

export function round(n: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * f) / f;
}

const eurFmt = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 4 });
export function formatEur(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return eurFmt.format(n);
}

export function formatQty(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 3 }).format(n);
}

/** IVA general en España. */
export const IVA = 0.21;

/** Añade el IVA a un precio sin IVA. */
export const withIva = (n: number | null | undefined): number | null =>
  n == null ? null : Math.round(n * (1 + IVA) * 100) / 100;
