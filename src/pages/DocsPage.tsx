import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { formatEur } from "../lib/num";
import { normalizeText } from "../lib/parse";
import { t } from "../lib/i18n";

export default function DocsPage() {
  const [q, setQ] = useState("");
  const docs = useLiveQuery(() => db.docs.orderBy("createdAt").reverse().toArray(), []);
  const hits = useLiveQuery(async () => {
    const n = normalizeText(q);
    if (n.length < 2) return null;
    const all = await db.lines.toArray();
    return all
      .filter((l) => l.ean.includes(n) || normalizeText(l.ref).includes(n) || normalizeText(l.description).includes(n))
      .slice(0, 50);
  }, [q]);

  return (
    <div className="space-y-3">
      <input className="input" placeholder={t("Buscar por código, referencia o nombre")} value={q} onChange={(e) => setQ(e.target.value)} />
      {hits ? (
        <ul className="card divide-y divide-slate-100 p-0">
          {hits.length === 0 && <li className="p-4 text-slate-500">{t("Nada")}</li>}
          {hits.map((l) => (
            <li key={l.id}>
              <Link to={`/albaranes/${l.docId}`} className="block px-4 py-2">
                <div className="font-semibold">{l.description}</div>
                <div className="font-mono text-xs text-slate-500">
                  {l.ean || l.ref} · {l.qty} × {formatEur(l.price)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : docs?.length === 0 ? (
        <p className="card text-slate-500">{t("Sin albaranes todavía.")}</p>
      ) : (
        <ul className="space-y-2">
          {docs?.map((d) => (
            <li key={d.id}>
              <Link to={`/albaranes/${d.id}`} className="card block">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-bold">{d.supplier || d.fileName}</span>
                  <span className="shrink-0 text-sm text-slate-500">{d.date}</span>
                </div>
                <div className="text-sm text-slate-600">
                  {d.number && `${d.number} · `}
                  {d.lineCount} {t("líneas")} · {formatEur(d.total)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
