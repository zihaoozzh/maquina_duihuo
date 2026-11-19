import { parseNumber, formatEur, round, withIva } from "../lib/num";
import { t } from "../lib/i18n";
import { looksLikeBarcode, cleanBarcode } from "../lib/ean";

export interface EditableLine {
  /** Solo al editar un albarán ya guardado: id de la línea existente */
  id?: string;
  ean: string;
  ref: string;
  description: string;
  qty: string;
  price: string;
  discount: string;
  total: string;
  warnings: string[];
}

const fmt = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));

export function toEditable(l: {
  id?: string;
  ean: string;
  ref: string;
  description: string;
  qty: number | null;
  price: number | null;
  discount: number | null;
  total: number | null;
  warnings?: string[];
}): EditableLine {
  return {
    id: l.id,
    ean: l.ean,
    ref: l.ref,
    description: l.description,
    qty: fmt(l.qty),
    price: fmt(l.price),
    discount: fmt(l.discount),
    total: fmt(l.total),
    warnings: l.warnings ?? [],
  };
}

export function emptyLine(): EditableLine {
  return { ean: "", ref: "", description: "", qty: "", price: "", discount: "", total: "", warnings: [] };
}

export function fromEditable(l: EditableLine) {
  const qty = parseNumber(l.qty);
  const price = parseNumber(l.price);
  const discount = parseNumber(l.discount);
  let total = parseNumber(l.total);
  if (total == null && qty != null && price != null) total = round(qty * price * (1 - (discount ?? 0) / 100));
  return { id: l.id, ean: cleanBarcode(l.ean), ref: l.ref.trim(), description: l.description.trim(), qty, price, discount, total };
}

interface Props {
  lines: EditableLine[];
  onChange: (lines: EditableLine[]) => void;
  /** Los precios ya llevan IVA: no se suma el 21 % */
  pricesWithIva?: boolean;
}

export default function LinesEditor({ lines, onChange, pricesWithIva }: Props) {
  const update = (i: number, patch: Partial<EditableLine>) =>
    onChange(lines.map((l, j) => (j === i ? { ...l, ...patch, warnings: [] } : l)));
  const remove = (i: number) => onChange(lines.filter((_, j) => j !== i));

  return (
    <div className="space-y-2">
      {lines.map((l, i) => {
        const eanBad = l.ean !== "" && !looksLikeBarcode(l.ean);
        return (
          <div key={i} className={`card space-y-2 p-3 ${l.warnings.length ? "ring-2 ring-amber-300" : ""}`}>
            <div className="flex items-start gap-2">
              <span className="mt-2 w-6 shrink-0 text-right text-xs font-bold text-slate-400">{i + 1}</span>
              <input
                className="input font-semibold"
                value={l.description}
                placeholder={t("Descripción")}
                onChange={(e) => update(i, { description: e.target.value })}
              />
              <button type="button" className="mt-1 shrink-0 rounded-lg px-2 py-1.5 text-red-600" onClick={() => remove(i)} aria-label={t("Quitar")}>
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 pl-8">
              <Field label={t("Código de barras")} value={l.ean} onChange={(v) => update(i, { ean: v })} mono bad={eanBad} inputMode="numeric" />
              <Field label={t("Referencia")} value={l.ref} onChange={(v) => update(i, { ref: v })} mono />
            </div>
            <div className="grid grid-cols-4 gap-2 pl-8">
              <Field label={t("Cantidad")} value={l.qty} onChange={(v) => update(i, { qty: v })} inputMode="decimal" />
              <Field label={t("Precio")} value={l.price} onChange={(v) => update(i, { price: v })} inputMode="decimal" />
              <Field label={t("Dto %")} value={l.discount} onChange={(v) => update(i, { discount: v })} inputMode="decimal" />
              <Field label={t("Importe")} value={l.total} onChange={(v) => update(i, { total: v })} inputMode="decimal" />
            </div>
            <p className="pl-8 text-sm">
              {t("Precio unitario con IVA")}{pricesWithIva ? "" : " (21%)"}: <b className="text-blue-700">{formatEur(withIva(parseNumber(l.price), pricesWithIva))}</b>
            </p>
            {l.warnings.length > 0 && <p className="pl-8 text-sm font-semibold text-amber-700">⚠ {l.warnings.map(t).join(" · ")}</p>}
          </div>
        );
      })}
      <div className="flex items-center justify-between">
        <button type="button" className="btn-secondary" onClick={() => onChange([...lines, emptyLine()])}>
          + {t("Añadir línea")}
        </button>
        <span className="text-sm text-slate-600">
          {lines.length} {t("líneas")} · {t("Total")}: <b>{formatEur(lines.reduce((s, l) => s + (fromEditable(l).total ?? 0), 0))}</b>
        </span>
      </div>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  bad?: boolean;
  inputMode?: "numeric" | "decimal";
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-slate-500">{props.label}</span>
      <input
        className={`input px-2 py-1.5 text-sm ${props.mono ? "font-mono" : ""} ${props.bad ? "border-amber-500 bg-amber-50" : ""}`}
        value={props.value}
        inputMode={props.inputMode}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}
