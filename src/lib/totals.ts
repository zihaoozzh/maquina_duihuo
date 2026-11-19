import { IVA, RECARGO, round } from "./num";

export interface TotalLine {
  qty: number | null;
  price: number | null;
  discount: number | null;
  total: number | null;
}

export type TotalsCheck =
  | { kind: "final"; final: number; withIva: boolean; recargo?: boolean } // cuadra con el importe final del documento
  | { kind: "base"; base: number; final: number } // cuadra con la base; el final es otro importe del pie
  | { kind: "mismatch"; calculated: number; calculatedIva: number; final: number };

const TOL = 0.1;
const near = (a: number, b: number) => Math.abs(a - b) <= TOL;

/** Importe de una línea calculado con cantidad × precio (− descuento); si falta algo, el importe de la línea. */
export function lineAmount(l: TotalLine): number {
  if (l.qty != null && l.price != null) return l.qty * l.price * (1 - (l.discount ?? 0) / 100);
  return l.total ?? 0;
}

/**
 * Compara el importe final del documento (el mayor del pie) con el calculado a partir de los
 * precios, tanto tal cual (precios con IVA o albarán sin IVA) como sumando el IVA (precios sin IVA).
 */
export function checkTotals(lines: TotalLine[], footerTotals: number[], adjustments = 0): TotalsCheck | null {
  if (lines.length === 0 || footerTotals.length === 0) return null;
  const final = Math.max(...footerTotals);
  const calcs = [
    lines.reduce((s, l) => s + lineAmount(l), 0) + adjustments,
    lines.reduce((s, l) => s + (l.total ?? lineAmount(l)), 0) + adjustments,
  ];
  if (calcs.some((c) => near(c, final))) return { kind: "final", final, withIva: false };
  if (calcs.some((c) => near(c * (1 + IVA), final))) return { kind: "final", final, withIva: true };
  if (calcs.some((c) => near(c * (1 + IVA + RECARGO), final))) return { kind: "final", final, withIva: true, recargo: true };
  for (const c of calcs) {
    const base = footerTotals.find((v) => near(v, c));
    if (base === undefined) continue;
    // Si ningún importe del pie es esa base + IVA, no hay IVA que añadir: la suma ya es el total
    // del documento (el mayor del pie era otra cosa, p. ej. el subtotal antes del descuento).
    const hasIvaTotal = footerTotals.some((v) => v !== base && (near(v, base * (1 + IVA)) || near(v, base * (1 + IVA + RECARGO))));
    return hasIvaTotal ? { kind: "base", base, final } : { kind: "final", final: base, withIva: false };
  }
  return { kind: "mismatch", calculated: round(calcs[0], 2), calculatedIva: round(calcs[0] * (1 + IVA), 2), final };
}
