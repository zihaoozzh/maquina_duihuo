import { describe, expect, it } from "vitest";
import { guessNumbers, parseDocument, parseRows, type Row } from "./parse";
import { parseDiscount, parseNumber } from "./num";
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

describe("filas de banco", () => {
  it("no confunde el IBAN ni la cuenta con productos", () => {
    const rows: Row[] = [
      row(["Código", 40], ["Descripción", 180], ["Cant.", 380], ["Precio", 430], ["Importe", 520]),
      row(["8410076472519", 40], ["TAZA", 180], ["12", 390], ["1,25", 435], ["15,00", 525]),
      row(["IBAN: ES91 2100 0418 4502 0005 1332", 40]),
      row(["Banco Santander cuenta 0049 1500 0512 3456 7890", 40], ["1", 390], ["2", 435], ["2", 525]),
      row(["96385074", 40], ["BANCO MADERA JARDIN", 180], ["2", 390], ["19,90", 435], ["39,80", 525]),
    ];
    const lines = parseRows(rows);
    expect(lines.map((l) => l.description)).toEqual(["TAZA", "BANCO MADERA JARDIN"]);
  });
});


describe("parseDiscount", () => {
  it.each([
    ["5,00%", 5],
    ["17,35", 17.35],
    ["12+7+4", 21.43],
    ["10+5", 14.5],
    ["abc", null],
  ])("%s → %s", (input, out) => expect(parseDiscount(input)).toBe(out));
});

describe("PDF con código partido, números en la descripción y precio con IVA", () => {
  // Cada fila: Ref | EAN (partido por un espacio) | Descripción | Ud | Precio | Dtos | Precio IVA+DT | Subtotal
  const head = row(["Ref", 35], ["Cod.Barra", 100], ["Descripción", 180], ["Ud", 331], ["Precio", 368], ["Dtos", 425], ["Precio IVA+DT", 453], ["Subtotal", 526]);
  const rows: Row[] = [
    row(["PROVEEDOR EJEMPLO, S.L.", 40], ["CLIENTE DE PRUEBA", 330]),
    row(["Nº de pedido: PED-1001", 40]),
    head,
    row(["AB123", 32], ["84100000000 16", 98], ["BOMBILLA LED 9W E14…", 176], ["12", 335], ["0.87", 379], ["12+7+4", 417], ["0.71", 484], ["8.55", 544]),
    row(["CD456", 32], ["84100000000 23", 98], ["CABLE 5 MTS", 176], ["10", 335], ["4.03", 379], ["12+7+4", 417], ["3.30", 484], ["33.02", 539]),
    row(["EF789", 32], ["84100000000 30", 98], ["VELA 1", 176], ["6", 340], ["1.10", 379], ["12+7+4", 417], ["0.90", 484], ["5.40", 544]),
    row(["PEP5", 32], ["PEP5", 98], ["DESCUENTO 2.6%", 176], ["-1", 337], ["21.38", 374], ["22.30", 479], ["-22.30", 537]),
    row(["Total Neto", 42], ["Base imponible", 285], ["Total", 515]),
    row(["840.26", 65], ["840.26", 310], ["1,060.40", 506]),
  ];

  it("une el código partido, conserva números de la descripción y no cuela el descuento global", () => {
    const doc = parseDocument(rows);
    expect(doc.lines).toHaveLength(3);
    expect(doc.lines[0]).toMatchObject({ ref: "AB123", ean: "8410000000016", qty: 12, price: 0.87, discount: 21.43, total: 8.55 });
    expect(doc.lines[2]).toMatchObject({ ean: "8410000000030", description: "VELA 1", qty: 6, price: 1.1 });
    expect(doc.lines.every((l) => l.warnings.length === 0)).toBe(true);
    expect(doc.adjustments).toBe(-22.3);
    expect(doc.supplier).toBe("PROVEEDOR EJEMPLO, S.L.");
    expect(doc.number).toBe("PED-1001");
  });
});

describe("Excel con la cabecera lejos del principio", () => {
  const cell = (text: string, i: number) => ({ text, x0: i, x1: i + 1 });
  const r = (...vals: string[]): Row => vals.map(cell).filter((c) => c.text !== "");
  const rows: Row[] = [
    r("", "Pedido"),
    ...Array.from({ length: 14 }, (_, i) => r("", `Línea de dirección ${i + 1}`)),
    r("", "Fecha emision", "Nº de documento", "Comercial"),
    r("", "10/11/2026", "PED-2002", "756"),
    r("", "Imagen", "Ref", "Cod.Barra", "Descripcion", "Unidades", "Precio", "Dtos", "Precio+DTO", "U/B", "Caja"),
    r("", "", "AB123", "8410000000016", "BOMBILLA LED", "12", "0.87", "12+7+4", "0.712902", "144", "0.08"),
    r("", "", "CD456", "8410000000023", "CABLE 5 MTS", "10", "4.03", "12+7+4", "3.302295", "40", "0.25"),
    r("", "", "PEP5", "PEP5", "DESCUENTO 2.6%", "-1", "21.38", "", "22.298809", "1", "-1"),
    r("", "Total Neto", "Base imponible", "Total"),
    r("", "840.26", "840.26", "1060.4"),
  ];

  it("encuentra la cabecera, no mezcla columnas sobrantes y calcula el importe", () => {
    const doc = parseDocument(rows);
    expect(doc.lines).toHaveLength(2);
    expect(doc.lines[0]).toMatchObject({ ref: "AB123", ean: "8410000000016", qty: 12, price: 0.87, discount: 21.43, total: 8.55 });
    expect(doc.lines[1]).toMatchObject({ qty: 10, price: 4.03, total: 33.02 });
    expect(doc.number).toBe("PED-2002");
    expect(doc.date).toBe("2026-11-10");
    expect(doc.adjustments).toBe(-22.3);
  });
});

describe("Descripción en dos líneas y pie con totales", () => {
  const rows: Row[] = [
    row(["Artículo", 40], ["Descripción", 200], ["%IVA", 330], ["Cantidad", 380], ["Precio", 430], ["%Dto.", 470], ["Importe", 520]),
    row(["8410000000016", 36], ["FILM TRANSPARENTE 50mm", 200], ["21,00", 335], ["6,00", 385], ["3,900", 435], ["17,35", 475], ["19,34", 525]),
    row(["APROX.", 87]),
    row(["8410000000023", 36], ["PORTALAPICES", 200], ["21,00", 335], ["11,00", 385], ["1,040", 435], ["17,35", 475], ["9,46", 525]),
    row(["Total Bruto", 40], ["Total Base", 200], ["Total Factura €", 480]),
    row(["28,80", 40], ["28,80", 200], ["34,85", 480]),
  ];
  it("une la continuación y recoge los importes del pie", () => {
    const doc = parseDocument(rows);
    expect(doc.lines).toHaveLength(2);
    expect(doc.lines[0]).toMatchObject({ ean: "8410000000016", description: "FILM TRANSPARENTE 50mm APROX.", qty: 6, price: 3.9, discount: 17.35, total: 19.34 });
    expect(doc.footerTotals).toContain(34.85);
    expect(doc.footerTotals).toContain(28.8);
  });
});
