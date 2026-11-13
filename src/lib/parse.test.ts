import { describe, expect, it } from "vitest";
import { guessNumbers, parseDocument, parseRows, type Row } from "./parse";
import { parseNumber } from "./num";
import { barcodeKey, isGtinChecksumValid } from "./ean";

/** Construye una fila a partir de [texto, x] con ancho proporcional al texto. */
const row = (...cells: [string, number][]): Row => cells.map(([text, x]) => ({ text, x0: x, x1: x + text.length * 5 }));

describe("parseNumber", () => {
  it.each([
    ["1.234,56", 1234.56],
    ["1,234.56", 1234.56],
    ["3,5", 3.5],
    ["0.75", 0.75],
    ["12", 12],
    ["12,00 €", 12],
    ["-4,10", -4.1],
    ["abc", null],
    ["", null],
  ])("%s → %s", (input, out) => expect(parseNumber(input)).toBe(out));
});

describe("EAN", () => {
  it("valida el dígito de control", () => {
    expect(isGtinChecksumValid("8410076472519")).toBe(true);
    expect(isGtinChecksumValid("8410076472518")).toBe(false);
    expect(isGtinChecksumValid("96385074")).toBe(true);
  });
  it("UPC-A y EAN-13 con cero delante dan la misma clave", () => {
    expect(barcodeKey("036000291452")).toBe(barcodeKey("0036000291452"));
  });
});

describe("guessNumbers", () => {
  it("cantidad, precio, importe", () => {
    expect(guessNumbers([12, 1.5, 18])).toMatchObject({ qty: 12, price: 1.5, total: 18, consistent: true });
  });
  it("precio antes que cantidad", () => {
    expect(guessNumbers([0.85, 24, 20.4])).toMatchObject({ qty: 24, price: 0.85, total: 20.4, consistent: true });
  });
  it("con descuento", () => {
    expect(guessNumbers([10, 2, 10, 18])).toMatchObject({ qty: 10, price: 2, discount: 10, total: 18, consistent: true });
  });
  it("ignora números que no cuadran (IVA, cajas)", () => {
    expect(guessNumbers([2, 12, 1.25, 15, 21])).toMatchObject({ qty: 12, price: 1.25, total: 15, consistent: true });
  });
});

describe("parseRows con cabecera (PDF)", () => {
  const rows: Row[] = [
    row(["BAZAR SUMINISTROS S.L.", 40]),
    row(["Albarán nº: A-2024/0153", 40], ["Fecha: 12/03/2025", 400]),
    row(["Código", 40], ["EAN", 100], ["Descripción", 180], ["Cant.", 380], ["Precio", 430], ["Dto", 480], ["Importe", 520]),
    row(["R-001", 40], ["8410076472519", 100], ["TAZA CERAMICA 300ML", 180], ["12", 390], ["1,25", 435], ["15,00", 525]),
    row(["R-002", 40], ["96385074", 100], ["VASO CRISTAL", 180], ["24", 390], ["0,80", 435], ["10", 482], ["17,28", 525]),
    row(["COLOR AZUL SURTIDO", 180]),
    row(["R-003", 40], ["4006381333931", 100], ["BOLIGRAFO", 180], ["100", 385], ["0,12", 435], ["12,00", 525]),
    row(["Base imponible", 380], ["44,28", 525]),
    row(["IVA 21%", 380], ["9,30", 525]),
  ];

  it("lee todas las líneas", () => {
    const lines = parseRows(rows);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ ref: "R-001", ean: "8410076472519", description: "TAZA CERAMICA 300ML", qty: 12, price: 1.25, total: 15 });
    expect(lines[1]).toMatchObject({ ean: "96385074", qty: 24, price: 0.8, discount: 10, total: 17.28 });
    expect(lines[1].description).toBe("VASO CRISTAL COLOR AZUL SURTIDO");
    expect(lines[2]).toMatchObject({ qty: 100, price: 0.12, total: 12 });
    expect(lines.every((l) => l.warnings.length === 0)).toBe(true);
  });

  it("datos del documento", () => {
    const doc = parseDocument(rows);
    expect(doc.mode).toBe("header");
    expect(doc.date).toBe("2025-03-12");
    expect(doc.number).toBe("A-2024/0153");
    expect(doc.supplier).toBe("BAZAR SUMINISTROS S.L.");
  });
});

describe("parseRows sin cabecera", () => {
  it("deduce por cantidad × precio = importe", () => {
    const rows: Row[] = [
      row(["8410076472519 TAZA CERAMICA 300ML", 40], ["6", 300], ["2,10", 350], ["12,60", 420]),
      row(["ABC-77 PLATO LLANO", 40], ["4", 300], ["3,00", 350], ["12,00", 420]),
    ];
    const lines = parseRows(rows);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ ean: "8410076472519", description: "TAZA CERAMICA 300ML", qty: 6, price: 2.1, total: 12.6 });
    expect(lines[1]).toMatchObject({ ref: "ABC-77", description: "PLATO LLANO", qty: 4, price: 3, total: 12, ean: "" });
  });
});

describe("Excel (columnas por índice)", () => {
  it("cabecera en chino", () => {
    const rows: Row[] = [
      ["条码", "品名", "数量", "单价", "金额"].map((text, i) => ({ text, x0: i, x1: i + 1 })),
      ["6901234567892", "毛巾", "10", "1.5", "15"].map((text, i) => ({ text, x0: i, x1: i + 1 })),
    ];
    expect(parseRows(rows)[0]).toMatchObject({ ean: "6901234567892", description: "毛巾", qty: 10, price: 1.5, total: 15 });
  });
});
