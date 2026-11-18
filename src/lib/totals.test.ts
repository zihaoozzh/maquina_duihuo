import { describe, expect, it } from "vitest";
import { checkTotals } from "./totals";

const lines = [
  { qty: 2, price: 10, discount: null, total: 20 },
  { qty: 1, price: 5, discount: 10, total: 4.5 },
];

describe("checkTotals", () => {
  it("precios con IVA o albarán sin IVA: cuadra directo con el final", () => {
    expect(checkTotals(lines, [24.5])).toEqual({ kind: "final", final: 24.5, withIva: false });
  });
  it("precios sin IVA: cuadra sumando el 21% al final", () => {
    expect(checkTotals(lines, [24.5, 29.65])).toEqual({ kind: "final", final: 29.65, withIva: true });
  });
  it("detecta cuando no cuadra", () => {
    const r = checkTotals(lines, [100]);
    expect(r).toMatchObject({ kind: "mismatch", calculated: 24.5, calculatedIva: 29.65, final: 100 });
  });
});
