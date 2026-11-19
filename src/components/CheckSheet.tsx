/** 对货: ventana que sale al escanear un producto del albarán. Pregunta cuántas han llegado. */
import { useEffect, useRef, useState } from "react";
import type { DocLine } from "../lib/db";
import { formatEur, formatQty, parseNumber, withIva } from "../lib/num";
import { t } from "../lib/i18n";

interface Props {
  line: DocLine;
  /** Los precios del albarán ya llevan IVA: no se suma el 21 % */
  pricesWithIva?: boolean;
  onConfirm: (received: number) => void;
  onUncheck: () => void;
  onClose: () => void;
}

export default function CheckSheet({ line, pricesWithIva, onConfirm, onUncheck, onClose }: Props) {
  const initial = line.checkedAt ? line.received : (line.qty ?? 1);
  const [value, setValue] = useState(String(initial).replace(".", ","));
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const n = parseNumber(value);
  const valid = n != null && n >= 0;
  const diff = valid && line.qty != null ? n - line.qty : 0;
  const step = (d: number) => setValue(String(Math.max(0, (n ?? 0) + d)).replace(".", ","));

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <form
        className="w-full max-w-3xl space-y-3 rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onConfirm(n);
        }}
      >
        <div>
          <div className="text-xl font-bold">{line.description || "—"}</div>
          <div className="font-mono text-sm text-slate-500">
            {line.ean || t("Sin código")} {line.ref && `· ${line.ref}`}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-slate-50 p-2">
            <div className="text-xs font-semibold text-slate-500">{t("Precio")}</div>
            <div className="text-2xl font-bold text-blue-700">{formatEur(line.price)}</div>
            <div className="text-xs text-slate-500">
              {t("Precio unitario con IVA")}: <b>{formatEur(withIva(line.price, pricesWithIva))}</b>
            </div>
            {line.discount ? (
              <div className="text-xs text-slate-500">
                {t("Dto %")}: {line.discount}
              </div>
            ) : null}
          </div>
          <div className="rounded-xl bg-slate-50 p-2">
            <div className="text-xs font-semibold text-slate-500">{t("Cantidad en el albarán")}</div>
            <div className="text-2xl font-bold">{formatQty(line.qty)}</div>
          </div>
        </div>

        <label className="block">
          <span className="label">{t("¿Cuántas han llegado?")}</span>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary w-14 text-2xl" onClick={() => step(-1)}>
              −
            </button>
            <input
              ref={inputRef}
              className="input text-center text-3xl font-bold"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <button type="button" className="btn-secondary w-14 text-2xl" onClick={() => step(1)}>
              +
            </button>
          </div>
        </label>
        {valid && line.qty != null && diff !== 0 && (
          <p className={`text-center font-semibold ${diff < 0 ? "text-red-600" : "text-amber-700"}`}>
            {diff < 0 ? `${t("Faltan")} ${formatQty(-diff)}` : `${t("Sobran")} ${formatQty(diff)}`}
          </p>
        )}

        <div className="flex gap-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>
            {t("Cancelar")}
          </button>
          <button type="submit" className="btn-primary flex-[2] py-4 text-lg" disabled={!valid}>
            ✓ {t("Aceptar")}
          </button>
        </div>
        {line.checkedAt ? (
          <button type="button" className="w-full text-sm text-slate-500 underline" onClick={onUncheck}>
            {t("Quitar la marca de comprobado")}
          </button>
        ) : null}
      </form>
    </div>
  );
}
