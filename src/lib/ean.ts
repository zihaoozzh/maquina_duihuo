/** Utilidades para códigos de barras EAN-8 / UPC-A / EAN-13 / GTIN-14. */

export function cleanBarcode(raw: unknown): string {
  if (raw == null) return "";
  let s = String(raw).trim();
  // Excel a veces guarda el EAN como número en notación científica o con ".0"
  if (/^\d+(\.0+)?$/.test(s)) s = s.replace(/\.0+$/, "");
  if (/^\d(\.\d+)?e\+\d+$/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) s = BigInt(Math.round(n)).toString();
  }
  return s.replace(/[\s-]/g, "");
}

export function isGtinChecksumValid(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  let sum = 0;
  // Desde la derecha: pesos 3,1,3,1...
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += digits[i] * w;
  return (10 - (sum % 10)) % 10 === check;
}

/** ¿Parece un código de barras de producto? (8, 12, 13 o 14 dígitos con dígito de control válido) */
export function looksLikeBarcode(raw: string): boolean {
  return isGtinChecksumValid(cleanBarcode(raw));
}

/**
 * Clave para comparar códigos: quita ceros a la izquierda para que UPC-A (12),
 * EAN-13 con 0 delante y GTIN-14 coincidan entre sí.
 */
export function barcodeKey(raw: unknown): string {
  const c = cleanBarcode(raw);
  if (/^\d+$/.test(c)) return c.replace(/^0+(?=\d{8})/, "");
  return c.toUpperCase();
}
