import { useState } from "react";
import Scanner from "../components/Scanner";
import ProductInfo from "../components/ProductInfo";
import { t } from "../lib/i18n";

export default function ScanPage() {
  const [code, setCode] = useState("");
  const [typed, setTyped] = useState("");
  return (
    <div className="space-y-4">
      <Scanner onCode={(c) => setCode(c)} />
      <p className="text-center text-sm text-slate-500">{t("Apunta la cámara al código de barras")}</p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed.trim()) setCode(typed.trim());
        }}
      >
        <input
          className="input"
          inputMode="numeric"
          placeholder={t("Escribir código")}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        <button className="btn-secondary shrink-0 whitespace-nowrap" type="submit">
          {t("Buscar")}
        </button>
      </form>
      {code && <ProductInfo code={code} />}
    </div>
  );
}
