import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Supabase simulado en memoria (solo lo que usa sync.ts) ---------------
type Row = Record<string, unknown>;
const tables: Record<string, Map<string, Row>> = {};
let clock = Date.parse("2026-01-01T00:00:00Z");
const pk = (t: string) => (t === "catalog" || t === "meta" ? "key" : "id");
const T = (name: string) => (tables[name] ??= new Map());

class Query {
  private filters: ((r: Row) => boolean)[] = [];
  private op: "select" | "update" | "delete" | "upsert" = "select";
  private payload: Row | Row[] | null = null;
  private rangeArg: [number, number] | null = null;
  private orders: string[] = [];
  private single = false;
  constructor(private table: string) {}
  select() { this.op = this.op === "select" ? "select" : this.op; return this; }
  update(v: Row) { this.op = "update"; this.payload = v; return this; }
  delete() { this.op = "delete"; return this; }
  upsert(v: Row | Row[], _opts?: { onConflict?: string }) { void _opts; this.op = "upsert"; this.payload = v; return this; }
  in(c: string, vals: unknown[]) { this.filters.push((r) => vals.includes(r[c])); return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this; }
  gt(c: string, v: string) { this.filters.push((r) => String(r[c]) > v); return this; }
  order(c: string) { this.orders.push(c); return this; }
  range(a: number, b: number) { this.rangeArg = [a, b]; return this; }
  maybeSingle() { this.single = true; return this; }
  private run() {
    const t = T(this.table);
    const stamp = () => new Date((clock += 1000)).toISOString();
    const match = [...t.values()].filter((r) => this.filters.every((f) => f(r)));
    if (this.op === "upsert") {
      for (const r of ([] as Row[]).concat(this.payload as Row)) {
        const k = String(r[pk(this.table)]);
        t.set(k, { ...(t.get(k) ?? {}), ...r, updated_at: stamp() });
      }
      return null;
    }
    if (this.op === "update") { match.forEach((r) => Object.assign(r, this.payload, { updated_at: stamp() })); return null; }
    if (this.op === "delete") { match.forEach((r) => t.delete(String(r[pk(this.table)]))); return null; }
    let rows = match.map((r) => ({ ...r }));
    for (const o of [...this.orders].reverse()) rows.sort((a, b) => String(a[o]).localeCompare(String(b[o])));
    if (this.rangeArg) rows = rows.slice(this.rangeArg[0], this.rangeArg[1] + 1);
    return this.single ? (rows[0] ?? null) : rows;
  }
  then(ok: (v: { data: unknown; error: null }) => unknown, bad?: (e: unknown) => unknown) {
    return Promise.resolve({ data: this.run(), error: null }).then(ok, bad);
  }
}
const fakeClient = { from: (t: string) => new Query(t) };

let currentUser: string | null = "user-a";
vi.mock("./cloud", () => ({ getClient: () => fakeClient, isReady: () => true, getUserId: () => currentUser, subscribeCloud: () => () => {} }));

const { db, saveDocument, deleteDocument, checkLine, updateDocument, replaceCatalog } = await import("./db");
const { syncNow, ensureAccount } = await import("./sync");

/** Simula "otro móvil": borra la base de datos local */
async function otherPhone() {
  await Promise.all([db.docs.clear(), db.lines.clear(), db.catalog.clear(), db.meta.clear(), db.tombstones.clear()]);
}

const line = (ean: string, qty: number, price: number) => ({ ean, ref: "", description: `P${ean}`, qty, price, discount: null, total: qty * price });

describe("sincronización", () => {
  beforeEach(async () => {
    for (const k of Object.keys(tables)) delete tables[k];
    await otherPhone();
  });

  it("sube un albarán y otro móvil lo recibe", async () => {
    const id = await saveDocument({ supplier: "Prov", number: "A1", date: "2026-01-02", fileName: "a.pdf", source: "pdf" }, [line("8410076472519", 2, 1.5)]);
    await syncNow();
    expect(T("docs").get(id)).toMatchObject({ supplier: "Prov", line_count: 1, deleted: false });
    expect(T("lines").size).toBe(1);
    expect(await db.docs.get(id)).toMatchObject({ dirty: 0 });

    await otherPhone();
    await syncNow();
    expect(await db.docs.get(id)).toMatchObject({ supplier: "Prov", number: "A1" });
    expect(await db.lines.where("docId").equals(id).toArray()).toHaveLength(1);
  });

  it("los cambios de unidades recibidas y los borrados llegan al otro móvil", async () => {
    const id = await saveDocument({ supplier: "P", number: "", date: "", fileName: "", source: "manual" }, [line("96385074", 5, 1)]);
    await syncNow();
    const [l] = await db.lines.toArray();
    await checkLine(l.id, 3);
    await syncNow();
    expect(T("lines").get(l.id)).toMatchObject({ received: 3 });
    expect(typeof T("lines").get(l.id)!.checked_at).toBe("number");

    await deleteDocument(id);
    await syncNow();
    expect(T("docs").get(id)).toMatchObject({ deleted: true });
    expect(T("lines").get(l.id)).toMatchObject({ deleted: true });
    expect(await db.tombstones.count()).toBe(0);
  });

  it("editar un albarán guardado conserva lo comprobado y sincroniza lo quitado", async () => {
    const id = await saveDocument({ supplier: "P", number: "", date: "", fileName: "", source: "manual" }, [
      line("96385074", 5, 1),
      line("8410076472519", 2, 3),
    ]);
    await syncNow();
    const [a, b] = await db.lines.where("docId").equals(id).sortBy("pos");
    await checkLine(a.id, 5);
    await updateDocument(id, { supplier: "Nuevo", number: "N1", date: "2026-11-14" }, [
      { id: a.id, ean: "96385074", ref: "", description: "Cambiado", qty: 6, price: 1, discount: null, total: 6 },
      { ean: "4006381333931", ref: "", description: "Nueva", qty: 1, price: 2, discount: null, total: 2 },
    ]);
    const lines = await db.lines.where("docId").equals(id).sortBy("pos");
    expect(lines.map((l) => l.description)).toEqual(["Cambiado", "Nueva"]);
    expect(lines[0]).toMatchObject({ id: a.id, received: 5, qty: 6 });
    expect(lines[0].checkedAt).toBeTypeOf("number");
    expect(await db.docs.get(id)).toMatchObject({ supplier: "Nuevo", lineCount: 2, total: 8 });
    await syncNow();
    expect(T("lines").get(b.id)).toMatchObject({ deleted: true });
    expect(T("lines").get(a.id)).toMatchObject({ description: "Cambiado", received: 5 });
    expect(T("docs").get(id)).toMatchObject({ supplier: "Nuevo", line_count: 2 });
  });

  it("un cambio local sin subir no se pisa con lo que baja", async () => {
    await saveDocument({ supplier: "P", number: "", date: "", fileName: "", source: "manual" }, [line("96385074", 5, 1)]);
    await syncNow();
    const [l] = await db.lines.toArray();
    // Otro móvil cambia la línea en el servidor…
    T("lines").get(l.id)!.received = 9;
    T("lines").get(l.id)!.updated_at = new Date((clock += 1000)).toISOString();
    // …y aquí también, sin haber sincronizado
    await db.lines.update(l.id, { received: 1, dirty: 1, rev: 42 });
    await syncNow();
    expect(T("lines").get(l.id)).toMatchObject({ received: 1 });
    expect(await db.lines.get(l.id)).toMatchObject({ received: 1, dirty: 0 });
  });

  it("el catálogo de Bohao importado en un móvil llega al otro", async () => {
    const p = (ean: string) => ({ key: ean, ean, name: `N${ean}`, pvp: 1.95, cost: null, stock: 3, ref: "" });
    await replaceCatalog([p("8410076472519"), p("96385074")], "bohao.xlsx");
    await syncNow();
    expect(T("catalog").size).toBe(2);
    await replaceCatalog([p("96385074")], "bohao2.xlsx");
    await syncNow();
    expect([...T("catalog").keys()]).toEqual(["96385074"]);

    await otherPhone();
    await syncNow();
    expect(await db.catalog.count()).toBe(1);
    expect(await db.catalog.get("96385074")).toMatchObject({ name: "N96385074", pvp: 1.95 });
  });
});

describe("una cuenta = una tienda", () => {
  beforeEach(async () => {
    for (const k of Object.keys(tables)) delete tables[k];
    await otherPhone();
    currentUser = "user-a";
  });

  it("un móvil sin cuenta guardada adopta la actual sin borrar nada", async () => {
    const id = await saveDocument({ supplier: "P", number: "", date: "", fileName: "", source: "manual" }, [line("96385074", 1, 1)]);
    expect(await ensureAccount()).toBe(false);
    expect(await db.docs.get(id)).toBeTruthy();
    expect((await db.meta.get("accountId"))?.value).toBe("user-a");
  });

  it("la misma cuenta no borra nada", async () => {
    await ensureAccount();
    await saveDocument({ supplier: "P", number: "", date: "", fileName: "", source: "manual" }, [line("96385074", 1, 1)]);
    expect(await ensureAccount()).toBe(false);
    expect(await db.docs.count()).toBe(1);
  });

  it("al entrar otra cuenta se borran los datos locales y no se suben a su tienda", async () => {
    await ensureAccount();
    await saveDocument({ supplier: "Tienda A", number: "", date: "", fileName: "", source: "manual" }, [line("96385074", 1, 1)]);
    currentUser = "user-b";
    await syncNow();
    expect(await db.docs.count()).toBe(0);
    expect(await db.lines.count()).toBe(0);
    expect(T("docs").size).toBe(0); // nada de la tienda A llegó al servidor
    expect((await db.meta.get("accountId"))?.value).toBe("user-b");
  });
});
