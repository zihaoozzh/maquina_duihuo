/**
 * Catálogo de productos de la caja (Bohao Market).
 * De momento se carga desde el Excel que exporta Bohao; más adelante se sincronizará en directo.
 */
import { findHeader, normalizeText, type Cell } from "./parse";
import { barcodeKey, cleanBarcode } from "./ean";
import { parseNumber } from "./num";

export type CatalogField = "ean" | "name" | "pvp" | "cost" | "stock" | "ref";

export const CATALOG_FIELDS: CatalogField[] = ["ean", "name", "pvp", "cost", "stock", "ref"];

const words = (list: string[], score = 3) => (h: string) => (list.some((w) => h.includes(w)) ? score : 0);

export const CATALOG_MATCHERS: Record<CatalogField, ((h: string) => number)[]> = {
  ean: [words(["codigo de barras", "codigo barras", "cod. barras", "cod barras", "c.barras", "ean", "gtin", "barcode", "条码", "条形码"], 4), words(["codigo"], 1)],
  name: [words(["descripcion", "nombre", "articulo", "producto", "denominacion", "商品名称", "品名", "名称", "商品"], 3)],
  pvp: [words(["pvp", "p.v.p", "precio venta", "precio de venta", "venta", "售价", "零售价"], 4), words(["precio"], 1)],
  cost: [words(["coste", "costo", "precio compra", "precio de compra", "compra", "进价", "成本"], 4)],
  stock: [words(["stock", "existencias", "inventario", "库存"], 4), words(["cantidad", "unidades", "数量"], 1)],
  ref: [words(["referencia", "ref", "货号", "编号"], 3)],
};

export type ColumnMap = Partial<Record<CatalogField, number>>;

/** Detecta la fila de cabecera y qué columna corresponde a cada campo. */
export function detectCatalogColumns(matrix: string[][]): { headerRow: number; columns: ColumnMap } {
  const rows = matrix.slice(0, 30).map((r) => r.map((text, i): Cell => ({ text, x0: i, x1: i + 1 })).filter((c) => c.text));
  const h = findHeader<CatalogField>(rows, CATALOG_MATCHERS, { minFields: 2, required: ["ean"] });
  if (h) {
    const columns: ColumnMap = {};
    for (const f of Object.keys(h.columns) as CatalogField[]) columns[f] = h.columns[f]!.x0;
    return { headerRow: h.rowIndex, columns };
  }
  // Sin cabecera: la columna con más códigos de 8-14 dígitos es el EAN
  const counts = new Map<number, number>();
  for (const r of matrix.slice(0, 200)) r.forEach((v, i) => /^\d{8,14}$/.test(cleanBarcode(v)) && counts.set(i, (counts.get(i) ?? 0) + 1));
  const eanCol = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return { headerRow: -1, columns: eanCol == null ? {} : { ean: eanCol } };
}

export interface CatalogProduct {
  key: string; // barcodeKey(ean)
  ean: string;
  name: string;
  pvp: number | null;
  cost: number | null;
  stock: number | null;
  ref: string;
}

export function matrixToCatalog(matrix: string[][], headerRow: number, columns: ColumnMap): CatalogProduct[] {
  const out = new Map<string, CatalogProduct>();
  const get = (r: string[], f: CatalogField) => (columns[f] == null ? "" : (r[columns[f]!] ?? ""));
  for (let i = headerRow + 1; i < matrix.length; i++) {
    const r = matrix[i];
    const ean = cleanBarcode(get(r, "ean"));
    if (!ean || normalizeText(ean).length < 3) continue;
    const key = barcodeKey(ean);
    out.set(key, {
      key,
      ean,
      name: get(r, "name"),
      pvp: parseNumber(get(r, "pvp")),
      cost: parseNumber(get(r, "cost")),
      stock: parseNumber(get(r, "stock")),
      ref: get(r, "ref"),
    });
  }
  return [...out.values()];
}
