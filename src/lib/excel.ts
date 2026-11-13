/** Lectura de Excel/CSV (albaranes en Excel y catálogo exportado de Bohao). */
import * as XLSX from "xlsx";
import type { Row } from "./parse";

// Usamos el valor crudo: con el texto formateado, Excel muestra los EAN largos
// como "8,41E+12" y se pierden dígitos.
function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isInteger(v) ? v.toFixed(0) : String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function sheetMatrix(sheet: XLSX.WorkSheet): string[][] {
  const m = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "", blankrows: false });
  return m.map((r) => r.map(cellText));
}

/** Devuelve cada hoja como filas de celdas (x0 = índice de columna). */
export function readSpreadsheet(data: ArrayBuffer): { name: string; rows: Row[] }[] {
  const wb = XLSX.read(data, { type: "array" });
  return wb.SheetNames.map((name) => ({
    name,
    rows: sheetMatrix(wb.Sheets[name]).map((r) =>
      r.map((text, i) => ({ text, x0: i, x1: i + 1 })).filter((c) => c.text !== ""),
    ),
  }));
}

/** Matriz de texto de la primera hoja con datos. */
export function readMatrix(data: ArrayBuffer): string[][] {
  const wb = XLSX.read(data, { type: "array" });
  for (const name of wb.SheetNames) {
    const m = sheetMatrix(wb.Sheets[name]);
    if (m.length > 0) return m;
  }
  return [];
}
