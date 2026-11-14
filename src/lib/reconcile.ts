/**
 * Junta la lectura automática (reglas) y la de la IA de un PDF o Excel con texto.
 *
 * - La base es lo que devuelve la IA: entiende el documento y descarta números que
 *   no son de productos (cuenta del banco, teléfonos, CIF…).
 * - Cada línea se compara con la lectura automática del mismo código: si la cantidad
 *   o el precio no coinciden, se avisa con los dos valores.
 * - Cada número de la IA tiene que aparecer en el documento; si no, se avisa.
 * - Las líneas que solo vio la lectura automática se añaden al final con aviso.
 */
import { barcodeKey, cleanBarcode } from "./ean";
import { formatQty, parseNumber } from "./num";
import { normalizeText, type ParsedLine } from "./parse";

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.005, Math.abs(b) * 0.001);

/** Todos los números que aparecen en el texto del documento. */
export function numbersInText(text: string): number[] {
  const out: number[] = [];
  for (const raw of text.split(/[\s|;:()€$%]+/)) {
    const tok = raw.replace(/^[^\d-]+|[^\d]+$/g, "");
    if (!tok) continue;
    const n = parseNumber(tok);
    if (n != null) out.push(Math.abs(n));
  }
  return out;
}

/** Claves por las que se puede emparejar una línea: código de barras, referencia, descripción. */
function lineKeys(l: ParsedLine): string[] {
  const keys: string[] = [];
  if (l.ean) keys.push(`e:${barcodeKey(l.ean)}`);
  if (l.ref) keys.push(`r:${normalizeText(l.ref)}`);
  if (l.description) keys.push(`d:${normalizeText(l.description)}`);
  return keys;
}

const fmt = (l: ParsedLine) => `${formatQty(l.qty)} × ${l.price == null ? "—" : formatQty(l.price)}`;

export function reconcile(auto: ParsedLine[], ai: ParsedLine[], sourceText: string): ParsedLine[] {
  if (ai.length === 0) return auto;
  const nums = numbersInText(sourceText);
  const digitsText = sourceText.replace(/[\s-]/g, "");
  const inText = (n: number | null) => n == null || nums.some((x) => near(x, Math.abs(n)));

  const used = new Set<ParsedLine>();
  const index = new Map<string, ParsedLine[]>();
  for (const l of auto) for (const k of lineKeys(l)) index.set(k, [...(index.get(k) ?? []), l]);
  const take = (l: ParsedLine): ParsedLine | undefined => {
    for (const k of lineKeys(l)) {
      const found = index.get(k)?.find((x) => !used.has(x));
      if (found) {
        used.add(found);
        return found;
      }
    }
    return undefined;
  };

  const out: ParsedLine[] = ai.map((line) => {
    const l: ParsedLine = { ...line, warnings: [...line.warnings] };
    const other = take(l);
    if (other) {
      if (!l.ean && other.ean) l.ean = other.ean;
      if (!l.ref && other.ref) l.ref = other.ref;
      const qtyDiff = l.qty != null && other.qty != null && !near(l.qty, other.qty);
      const priceDiff = l.price != null && other.price != null && !near(l.price, other.price);
      if (qtyDiff || priceDiff) l.warnings.push("La IA y la lectura automática no coinciden", `≠ ${fmt(other)}`);
    }
    if (![l.qty, l.price, l.total].every(inText)) l.warnings.push("Número que no aparece en el documento");
    if (l.ean && !digitsText.includes(cleanBarcode(l.ean))) l.warnings.push("El código de barras no aparece en el documento");
    return l;
  });

  for (const l of auto) if (!used.has(l)) out.push({ ...l, warnings: [...l.warnings, "Solo en la lectura automática"] });
  return out;
}
