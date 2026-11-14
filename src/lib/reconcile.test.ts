import { describe, expect, it } from "vitest";
import { reconcile } from "./reconcile";
import type { ParsedLine } from "./parse";

const L = (p: Partial<ParsedLine>): ParsedLine => ({ ean: "", ref: "", description: "", qty: null, price: null, discount: null, total: null, warnings: [], ...p });

const text = `DISTRIBUCIONES X | Albarán AV-1
Código | Descripción | Cant. | Precio | Importe
8410076472519 | TAZA | 12 | 1,25 | 15,00
96385074 | VASO | 24 | 0,80 | 19,20
IBAN ES91 2100 0418 4502 0005 1332`;

describe("reconcile", () => {
  it("sin diferencias no añade avisos", () => {
    const auto = [L({ ean: "8410076472519", description: "TAZA", qty: 12, price: 1.25, total: 15 })];
    const ai = [L({ ean: "8410076472519", description: "TAZA", qty: 12, price: 1.25, total: 15 })];
    expect(reconcile(auto, ai, text)).toEqual(ai);
  });

  it("avisa si la cantidad no coincide, con el valor de la lectura automática", () => {
    const auto = [L({ ean: "96385074", qty: 2100, price: 0.8 })];
    const ai = [L({ ean: "96385074", description: "VASO", qty: 24, price: 0.8, total: 19.2 })];
    const [l] = reconcile(auto, ai, text);
    expect(l.warnings[0]).toBe("La IA y la lectura automática no coinciden");
    expect(l.warnings[1]).toContain("2100");
  });

  it("avisa de números o códigos inventados", () => {
    const ai = [L({ ean: "4006381333931", description: "X", qty: 7, price: 3.33, total: 23.31 })];
    const [l] = reconcile([], ai, text);
    expect(l.warnings).toContain("Número que no aparece en el documento");
    expect(l.warnings).toContain("El código de barras no aparece en el documento");
  });

  it("añade lo que solo vio la lectura automática y usa su EAN si la IA no lo tiene", () => {
    const auto = [L({ ean: "8410076472519", ref: "R1", description: "TAZA", qty: 12, price: 1.25, total: 15 }), L({ ean: "96385074", description: "VASO", qty: 24, price: 0.8, total: 19.2 })];
    const ai = [L({ ref: "R1", description: "TAZA", qty: 12, price: 1.25, total: 15 })];
    const out = reconcile(auto, ai, text);
    expect(out[0].ean).toBe("8410076472519");
    expect(out[1]).toMatchObject({ ean: "96385074", warnings: ["Solo en la lectura automática"] });
  });

  it("si la IA no devuelve nada, se queda la lectura automática", () => {
    const auto = [L({ ean: "96385074", qty: 1, price: 1 })];
    expect(reconcile(auto, [], text)).toBe(auto);
  });
});
