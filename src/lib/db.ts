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
  /** 1 = cambios pendientes de subir a la base de datos compartida */
  dirty?: number;
  rev?: number;
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
  /** Momento en que se dio por comprobada (对过了); null/undefined = sin comprobar */
  checkedAt?: number | null;
  dirty?: number;
  rev?: number;
}

/** Borrados pendientes de subir */
export interface Tombstone {
  id: string;
  table: "docs" | "lines";
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
  tombstones: EntityTable<Tombstone, "id">;
};

db.version(1).stores({
  docs: "id, createdAt, date, supplier",
  lines: "id, docId, key, ref",
  catalog: "key, ref, name",
  meta: "key",
});
db.version(2).stores({
  docs: "id, createdAt, date, supplier, dirty",
  lines: "id, docId, key, ref, dirty",
  catalog: "key, ref, name",
  meta: "key",
  tombstones: "id",
});

let revCounter = 0;
/** Marca un registro como modificado en este móvil (pendiente de subir). */
export const touched = () => ({ dirty: 1, rev: Date.now() * 1000 + (revCounter++ % 1000) });

/** Avisa al sincronizador de que hay cambios locales. */
type Listener = () => void;
const changeListeners = new Set<Listener>();
export function onLocalChange(fn: Listener) {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}
export function notifyLocalChange() {
  changeListeners.forEach((f) => f());
}

export const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export type NewLine = Omit<DocLine, "id" | "docId" | "pos" | "key" | "received" | "checkedAt">;

export async function saveDocument(doc: Omit<DeliveryDoc, "id" | "createdAt" | "lineCount" | "total">, lines: NewLine[]): Promise<string> {
  const id = uuid();
  const total = lines.reduce((s, l) => s + (l.total ?? 0), 0);
  await db.transaction("rw", db.docs, db.lines, async () => {
    await db.docs.add({ ...doc, id, createdAt: Date.now(), lineCount: lines.length, total: Math.round(total * 100) / 100, ...touched() });
    await db.lines.bulkAdd(
      lines.map((l, pos) => ({ ...l, id: uuid(), docId: id, pos, key: l.ean ? barcodeKey(l.ean) : "", received: 0, checkedAt: null, ...touched() })),
    );
  });
  notifyLocalChange();
  return id;
}

export async function deleteDocument(id: string): Promise<void> {
  await db.transaction("rw", [db.docs, db.lines, db.tombstones], async () => {
    const lineIds = (await db.lines.where("docId").equals(id).primaryKeys()) as string[];
    await db.tombstones.bulkPut([{ id, table: "docs" }, ...lineIds.map((l) => ({ id: l, table: "lines" as const }))]);
    await db.lines.bulkDelete(lineIds);
    await db.docs.delete(id);
  });
  notifyLocalChange();
}

/** 对货: guarda la cantidad que ha llegado y marca la línea como comprobada (o la desmarca con null). */
export async function checkLine(lineId: string, received: number | null): Promise<void> {
  await db.lines.update(lineId, {
    received: received == null ? 0 : Math.max(0, received),
    checkedAt: received == null ? null : Date.now(),
    ...touched(),
  });
  notifyLocalChange();
}

/** Línea editada: con id si ya existía en el albarán. */
export type EditedLine = NewLine & { id?: string };

/**
 * Editar un albarán ya guardado: actualiza las líneas que siguen (conservando lo
 * comprobado en 对货), añade las nuevas y borra las quitadas.
 */
export async function updateDocument(
  id: string,
  meta: Pick<DeliveryDoc, "supplier" | "number" | "date">,
  lines: EditedLine[],
): Promise<void> {
  await db.transaction("rw", [db.docs, db.lines, db.tombstones], async () => {
    const existing = await db.lines.where("docId").equals(id).toArray();
    const byId = new Map(existing.map((l) => [l.id, l]));
    const keep = new Set<string>();
    const rows: DocLine[] = lines.map((l, pos) => {
      const prev = l.id ? byId.get(l.id) : undefined;
      if (prev) keep.add(prev.id);
      const { id: _id, ...data } = l;
      void _id;
      return {
        ...data,
        id: prev?.id ?? uuid(),
        docId: id,
        pos,
        key: l.ean ? barcodeKey(l.ean) : "",
        received: prev?.received ?? 0,
        checkedAt: prev?.checkedAt ?? null,
        ...touched(),
      };
    });
    const removed = existing.filter((l) => !keep.has(l.id)).map((l) => l.id);
    await db.tombstones.bulkPut(removed.map((l) => ({ id: l, table: "lines" as const })));
    await db.lines.bulkDelete(removed);
    await db.lines.bulkPut(rows);
    const total = rows.reduce((s, l) => s + (l.total ?? 0), 0);
    await db.docs.update(id, { ...meta, lineCount: rows.length, total: Math.round(total * 100) / 100, ...touched() });
  });
  notifyLocalChange();
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
    await db.meta.put({ key: "catalog", value: { fileName, importedAt: Date.now(), count: products.length, importId: uuid(), pushed: false } satisfies CatalogMeta });
  });
  notifyLocalChange();
}

export interface CatalogMeta {
  fileName: string;
  importedAt: number;
  count: number;
  /** Identifica cada importación para saber si otro móvil tiene una más nueva */
  importId: string;
  /** false = falta subirla a la base de datos compartida */
  pushed: boolean;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}
