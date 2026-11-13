/**
 * Sincronización entre el móvil (IndexedDB) y la base de datos compartida (Supabase).
 *
 * - La app siempre lee y escribe en el móvil, así funciona sin cobertura.
 * - Lo modificado aquí queda marcado (dirty) y se sube en cuanto hay conexión.
 * - Se bajan los cambios de los demás móviles cada poco tiempo.
 * - Si dos móviles cambian lo mismo, gana el último en subirlo.
 */
import { useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db, getMeta, onLocalChange, type CatalogMeta, type DeliveryDoc, type DocLine } from "./db";
import { getClient, isReady, subscribeCloud } from "./cloud";
import type { CatalogProduct } from "./catalog";

const BATCH = 500;
const PAGE = 1000;
/** Margen al pedir cambios: transacciones que terminaron tarde con una hora anterior */
const OVERLAP_MS = 2 * 60 * 1000;

// ---------------------------------------------------------------------------
// Conversión de campos (móvil ↔ servidor)

type RemoteDoc = {
  id: string;
  supplier: string;
  number: string;
  date: string;
  file_name: string;
  source: string;
  created_at: number;
  line_count: number;
  total: number;
  deleted: boolean;
  updated_at?: string;
};

type RemoteLine = {
  id: string;
  doc_id: string;
  pos: number;
  key: string;
  ean: string;
  ref: string;
  description: string;
  qty: number | null;
  price: number | null;
  discount: number | null;
  total: number | null;
  received: number;
  deleted: boolean;
  updated_at?: string;
};

const num = (v: unknown): number | null => (v == null ? null : Number(v));

export const docToRemote = (d: DeliveryDoc): RemoteDoc => ({
  id: d.id,
  supplier: d.supplier,
  number: d.number,
  date: d.date,
  file_name: d.fileName,
  source: d.source,
  created_at: d.createdAt,
  line_count: d.lineCount,
  total: d.total,
  deleted: false,
});

export const docFromRemote = (r: RemoteDoc): DeliveryDoc => ({
  id: r.id,
  supplier: r.supplier,
  number: r.number,
  date: r.date,
  fileName: r.file_name,
  source: r.source as DeliveryDoc["source"],
  createdAt: Number(r.created_at),
  lineCount: r.line_count,
  total: Number(r.total),
  dirty: 0,
});

export const lineToRemote = (l: DocLine): RemoteLine => ({
  id: l.id,
  doc_id: l.docId,
  pos: l.pos,
  key: l.key,
  ean: l.ean,
  ref: l.ref,
  description: l.description,
  qty: l.qty,
  price: l.price,
  discount: l.discount,
  total: l.total,
  received: l.received,
  deleted: false,
});

export const lineFromRemote = (r: RemoteLine): DocLine => ({
  id: r.id,
  docId: r.doc_id,
  pos: r.pos,
  key: r.key,
  ean: r.ean,
  ref: r.ref,
  description: r.description,
  qty: num(r.qty),
  price: num(r.price),
  discount: num(r.discount),
  total: num(r.total),
  received: Number(r.received ?? 0),
  dirty: 0,
});

// ---------------------------------------------------------------------------
// Estado visible en la app

export type SyncState = { status: "off" | "idle" | "syncing" | "error"; lastSync: number | null; error: string };
let state: SyncState = { status: "off", lastSync: null, error: "" };
const listeners = new Set<() => void>();
function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((f) => f());
}
export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

// ---------------------------------------------------------------------------
// Subir

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** Quita la marca de pendiente solo si el registro no ha vuelto a cambiar mientras se subía. */
async function clearDirty(table: typeof db.docs | typeof db.lines, sent: { id: string; rev?: number }[]) {
  await db.transaction("rw", table, async () => {
    for (const s of sent) {
      const cur = await table.get(s.id);
      if (cur && cur.rev === s.rev) await table.update(s.id, { dirty: 0 });
    }
  });
}

async function push(sb: SupabaseClient) {
  // Borrados
  const tombs = await db.tombstones.toArray();
  for (const table of ["docs", "lines"] as const) {
    const ids = tombs.filter((t) => t.table === table).map((t) => t.id);
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH);
      check(await sb.from(table).update({ deleted: true }).in("id", chunk));
      await db.tombstones.bulkDelete(chunk);
    }
  }

  // Albaranes (antes que sus líneas)
  const docs = await db.docs.where("dirty").equals(1).toArray();
  for (let i = 0; i < docs.length; i += BATCH) {
    const chunk = docs.slice(i, i + BATCH);
    check(await sb.from("docs").upsert(chunk.map(docToRemote)));
    await clearDirty(db.docs, chunk);
  }

  const lines = await db.lines.where("dirty").equals(1).toArray();
  for (let i = 0; i < lines.length; i += BATCH) {
    const chunk = lines.slice(i, i + BATCH);
    check(await sb.from("lines").upsert(chunk.map(lineToRemote)));
    await clearDirty(db.lines, chunk);
  }

  // Productos de la caja (importación de Bohao hecha en este móvil)
  const cat = await getMeta<CatalogMeta>("catalog");
  if (cat && cat.importId && !cat.pushed) {
    const products = await db.catalog.toArray();
    for (let i = 0; i < products.length; i += BATCH) {
      const chunk = products.slice(i, i + BATCH).map((p) => ({ ...p, import_id: cat.importId }));
      check(await sb.from("catalog").upsert(chunk));
    }
    check(await sb.from("catalog").delete().neq("import_id", cat.importId));
    const { pushed: _pushed, ...value } = cat;
    void _pushed;
    check(await sb.from("meta").upsert({ key: "catalog", value }));
    // Solo si sigue siendo la misma importación
    const now = await getMeta<CatalogMeta>("catalog");
    if (now?.importId === cat.importId) await db.meta.put({ key: "catalog", value: { ...cat, pushed: true } });
  }
}

// ---------------------------------------------------------------------------
// Bajar

async function fetchSince<T extends { updated_at?: string }>(sb: SupabaseClient, table: string, since: string | null): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(table).select("*").order("updated_at", { ascending: true }).order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (since) q = q.gt("updated_at", new Date(new Date(since).getTime() - OVERLAP_MS).toISOString());
    const rows = check(await q) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

const maxUpdated = (rows: { updated_at?: string }[], prev: string | null) =>
  rows.reduce<string | null>((m, r) => (r.updated_at && (!m || r.updated_at > m) ? r.updated_at : m), prev);

async function pull(sb: SupabaseClient) {
  const marks = (await getMeta<{ docs: string | null; lines: string | null }>("pulledAt")) ?? { docs: null, lines: null };

  const remoteDocs = await fetchSince<RemoteDoc>(sb, "docs", marks.docs);
  const remoteLines = await fetchSince<RemoteLine>(sb, "lines", marks.lines);

  await db.transaction("rw", [db.docs, db.lines, db.tombstones], async () => {
    for (const r of remoteDocs) {
      const local = await db.docs.get(r.id);
      if (r.deleted) {
        if (local) await db.docs.delete(r.id);
        continue;
      }
      if (local?.dirty) continue; // lo de este móvil se subirá y ganará
      if (await db.tombstones.get(r.id)) continue;
      await db.docs.put(docFromRemote(r));
    }
    for (const r of remoteLines) {
      const local = await db.lines.get(r.id);
      if (r.deleted) {
        if (local) await db.lines.delete(r.id);
        continue;
      }
      if (local?.dirty) continue;
      if (await db.tombstones.get(r.id)) continue;
      await db.lines.put(lineFromRemote(r));
    }
  });
  await db.meta.put({ key: "pulledAt", value: { docs: maxUpdated(remoteDocs, marks.docs), lines: maxUpdated(remoteLines, marks.lines) } });

  // Productos de la caja: si otro móvil ha importado un Excel más nuevo, bajarlo entero
  const metaRow = check(await sb.from("meta").select("value").eq("key", "catalog").maybeSingle()) as { value: Omit<CatalogMeta, "pushed"> } | null;
  const remoteCat = metaRow?.value;
  const localCat = await getMeta<CatalogMeta>("catalog");
  if (remoteCat?.importId && remoteCat.importId !== localCat?.importId && (localCat?.pushed ?? true)) {
    const products: CatalogProduct[] = [];
    for (let from = 0; ; from += PAGE) {
      const rows = check(
        await sb.from("catalog").select("key,ean,name,pvp,cost,stock,ref").eq("import_id", remoteCat.importId).order("key").range(from, from + PAGE - 1),
      ) as CatalogProduct[];
      products.push(...rows.map((p) => ({ ...p, pvp: num(p.pvp), cost: num(p.cost), stock: num(p.stock) })));
      if (rows.length < PAGE) break;
    }
    await db.transaction("rw", db.catalog, db.meta, async () => {
      const current = await getMeta<CatalogMeta>("catalog");
      if (current && current.pushed === false) return; // se ha importado otro aquí mientras tanto
      await db.catalog.clear();
      await db.catalog.bulkPut(products);
      await db.meta.put({ key: "catalog", value: { ...remoteCat, pushed: true } });
    });
  }
}

// ---------------------------------------------------------------------------
// Bucle

let running: Promise<void> | null = null;
let again = false;

export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      const sb = getClient();
      if (!sb || !isReady()) {
        setState({ status: "off" });
        return;
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setState({ status: "error", error: "Sin conexión" });
        return;
      }
      setState({ status: "syncing", error: "" });
      try {
        await push(sb);
        await pull(sb);
        setState({ status: "idle", lastSync: Date.now() });
      } catch (e) {
        console.error(e);
        setState({ status: "error", error: e instanceof Error ? e.message : String(e) });
      }
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

let started = false;
export function startSync() {
  if (started) return;
  started = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const soon = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), 1500);
  };
  onLocalChange(soon);
  // Al iniciar sesión o cambiar la configuración
  let wasReady = isReady();
  subscribeCloud(() => {
    const ready = isReady();
    if (ready !== wasReady) {
      wasReady = ready;
      if (ready) soon();
      else setState({ status: "off" });
    }
  });
  window.addEventListener("online", soon);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && soon());
  setInterval(() => document.visibilityState === "visible" && void syncNow(), 30_000);
  soon();
}
