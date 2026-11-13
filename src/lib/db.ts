/**
 * Base de datos local del móvil (IndexedDB). Los identificadores son UUID para que
 * más adelante se puedan sincronizar con la base de datos compartida sin choques.
 */
import Dexie, { type EntityTable } from "dexie";
import type { CatalogProduct } from "./catalog";
import { barcodeKey } from "./ean";

export type DocSource = "pdf" | "excel" | "manual" | "photo";

export interface DeliveryDoc {
  id: string;
  supplier: string;
  number: string;
  date: string; // yyyy-mm-dd o ""
  fileName: string;
  source: DocSource;
  createdAt: number;
  lineCount: number;
  total: number;
}

export interface DocLine {
  id: string;
  docId: string;
  pos: number;
  key: string; // barcodeKey(ean) para buscar al escanear
  ean: string;
  ref: string;
  description: string;
  qty: number | null;
  price: number | null;
  discount: number | null;
  total: number | null;
  /** Unidades comprobadas al recibir la mercancía (对货) */
  received: number;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export const db = new Dexie("maquina-duihuo") as Dexie & {
  docs: EntityTable<DeliveryDoc, "id">;
  lines: EntityTable<DocLine, "id">;
  catalog: EntityTable<CatalogProduct, "key">;
  meta: EntityTable<MetaEntry, "key">;
};

db.version(1).stores({
  docs: "id, createdAt, date, supplier",
  lines: "id, docId, key, ref",
  catalog: "key, ref, name",
  meta: "key",
});

export const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export type NewLine = Omit<DocLine, "id" | "docId" | "pos" | "key" | "received">;

export async function saveDocument(doc: Omit<DeliveryDoc, "id" | "createdAt" | "lineCount" | "total">, lines: NewLine[]): Promise<string> {
  const id = uuid();
  const total = lines.reduce((s, l) => s + (l.total ?? 0), 0);
  await db.transaction("rw", db.docs, db.lines, async () => {
    await db.docs.add({ ...doc, id, createdAt: Date.now(), lineCount: lines.length, total: Math.round(total * 100) / 100 });
    await db.lines.bulkAdd(
      lines.map((l, pos) => ({ ...l, id: uuid(), docId: id, pos, key: l.ean ? barcodeKey(l.ean) : "", received: 0 })),
    );
  });
  return id;
}

export async function deleteDocument(id: string): Promise<void> {
  await db.transaction("rw", db.docs, db.lines, async () => {
    await db.lines.where("docId").equals(id).delete();
    await db.docs.delete(id);
  });
}

export interface LineWithDoc extends DocLine {
  doc: DeliveryDoc | undefined;
}

/** Todas las líneas de albarán de un código, de la más reciente a la más antigua. */
export async function findLinesByCode(code: string): Promise<LineWithDoc[]> {
  const key = barcodeKey(code);
  let lines = await db.lines.where("key").equals(key).toArray();
  if (lines.length === 0) {
    // Por si se ha escrito la referencia del proveedor en lugar del código de barras
    lines = await db.lines.where("ref").equalsIgnoreCase(code.trim()).toArray();
  }
  const docs = await db.docs.bulkGet([...new Set(lines.map((l) => l.docId))]);
  const byId = new Map(docs.filter(Boolean).map((d) => [d!.id, d!]));
  return lines
    .map((l) => ({ ...l, doc: byId.get(l.docId) }))
    .sort((a, b) => (b.doc?.date || "").localeCompare(a.doc?.date || "") || (b.doc?.createdAt ?? 0) - (a.doc?.createdAt ?? 0));
}

export async function replaceCatalog(products: CatalogProduct[], fileName: string): Promise<void> {
  await db.transaction("rw", db.catalog, db.meta, async () => {
    await db.catalog.clear();
    await db.catalog.bulkPut(products);
    await db.meta.put({ key: "catalog", value: { fileName, importedAt: Date.now(), count: products.length } });
  });
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}
