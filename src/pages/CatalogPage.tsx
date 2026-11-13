import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CATALOG_FIELDS, detectCatalogColumns, matrixToCatalog, type CatalogField, type ColumnMap } from "../lib/catalog";
import { getMeta, replaceCatalog } from "../lib/db";
import { t } from "../lib/i18n";

const FIELD_LABEL: Record<CatalogField, string> = {
  ean: "Código de barras",
  name: "Nombre",
  pvp: "PVP",
  cost: "Coste",
  stock: "Stock",
  ref: "Referencia",
};

export default function CatalogPage() {
  const meta = useLiveQuery(() => getMeta<{ fileName: string; importedAt: number; count: number }>("catalog"), []);
  const [file, setFile] = useState<File | null>(null);
  const [matrix, setMatrix] = useState<string[][]>([]);
  const [headerRow, setHeaderRow] = useState(-1);
  const [columns, setColumns] = useState<ColumnMap>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setMessage("");
    setBusy(true);
    try {
      const { readMatrix } = await import("../lib/excel");
      const m = readMatrix(await f.arrayBuffer());
      const det = detectCatalogColumns(m);
      setFile(f);
      setMatrix(m);
      setHeaderRow(det.headerRow);
      setColumns(det.columns);
    } catch (e) {
      console.error(e);
      setMessage(t("No se pudo leer el archivo."));
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    if (!file) return;
    setBusy(true);
    try {
      const products = matrixToCatalog(matrix, headerRow, columns);
      await replaceCatalog(products, file.name);
      setMessage(`${t("Productos importados")}: ${products.length}`);
      setFile(null);
      setMatrix([]);
    } finally {
      setBusy(false);
    }
  }

  const headers = headerRow >= 0 ? matrix[headerRow] : (matrix[0] ?? []).map((_, i) => `#${i + 1}`);
  const preview = file ? matrixToCatalog(matrix.slice(0, headerRow + 6), headerRow, columns) : [];

  return (
    <div className="space-y-4">
      <div className="card space-y-2">
        <h2 className="text-lg font-bold">{t("Productos de la caja")}</h2>
        <p className="text-sm text-slate-600">
          {t("Exporta los productos desde Bohao Market a Excel y súbelo aquí. Cada importación sustituye a la anterior.")}
        </p>
        <p className="text-sm">
          {t("Última importación")}:{" "}
          <b>{meta ? `${new Date(meta.importedAt).toLocaleString()} · ${meta.count} ${t("productos")}` : t("Ninguna")}</b>
        </p>
        <label className="btn-primary w-full cursor-pointer">
          {t("Importar Excel de Bohao")}
          <input
            type="file"
            className="hidden"
            accept=".xlsx,.xls,.csv,.ods"
            disabled={busy}
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {message && <p className="card font-semibold text-blue-800">{message}</p>}

      {file && (
        <div className="card space-y-3">
          <h3 className="font-bold">{t("Columnas detectadas")}</h3>
          {CATALOG_FIELDS.map((f) => (
            <div key={f} className="grid grid-cols-[7rem_1fr] items-center gap-2">
              <span className="text-sm font-semibold">{t(FIELD_LABEL[f])}</span>
              <select
                className="input py-2"
                value={columns[f] ?? ""}
                onChange={(e) => setColumns({ ...columns, [f]: e.target.value === "" ? undefined : Number(e.target.value) })}
              >
                <option value="">{t("(sin columna)")}</option>
                {headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `#${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="p-1">{t("Código de barras")}</th>
                  <th className="p-1">{t("Nombre")}</th>
                  <th className="p-1">{t("PVP")}</th>
                  <th className="p-1">{t("Stock")}</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p) => (
                  <tr key={p.key} className="border-t border-slate-100">
                    <td className="p-1 font-mono">{p.ean}</td>
                    <td className="p-1">{p.name}</td>
                    <td className="p-1">{p.pvp ?? ""}</td>
                    <td className="p-1">{p.stock ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn-primary w-full" disabled={busy || columns.ean == null} onClick={doImport}>
            {t("Importar")} ({matrixToCatalog(matrix, headerRow, columns).length} {t("productos")})
          </button>
        </div>
      )}
    </div>
  );
}
