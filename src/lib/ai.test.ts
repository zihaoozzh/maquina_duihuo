import { describe, expect, it } from "vitest";
import { reviewAiLines } from "./ai";

const base = { ean: "8410076472519", ref: "", description: "TAZA", qty: 12, price: 1.25, discount: null, total: 15, doubtful: false };

describe("reviewAiLines", () => {
  it("línea correcta sin avisos", () => {
    expect(reviewAiLines([base])[0]).toMatchObject({ qty: 12, price: 1.25, total: 15, warnings: [] });
  });
  it("avisa si cantidad × precio no da el importe o el EAN no es válido", () => {
    const [l] = reviewAiLines([{ ...base, ean: "8410076472518", total: 16 }]);
    expect(l.warnings).toContain("Código de barras dudoso");
    expect(l.warnings).toContain("Cantidad × precio no coincide con el importe");
  });
  it("completa la cantidad a partir del importe", () => {
    expect(reviewAiLines([{ ...base, qty: null }])[0].qty).toBe(12);
  });
  it("respeta la marca de dudoso", () => {
    expect(reviewAiLines([{ ...base, doubtful: true }])[0].warnings).toEqual(["Dudoso en la foto"]);
  });
});
