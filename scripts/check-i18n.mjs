// Comprueba que todos los textos t("...") y los avisos tienen traducción al chino.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(p) && !p.endsWith(".test.ts")) files.push(p);
  }
})("src");
files.push("supabase/functions/leer-albaran/index.ts", "supabase/functions/leer-albaran/extract.ts");

const i18n = readFileSync("src/lib/i18n.ts", "utf8");
const zhBlock = i18n.slice(i18n.indexOf("const ZH"), i18n.indexOf("};", i18n.indexOf("const ZH")));
const keys = new Set([...zhBlock.matchAll(/^\s*"((?:[^"\\]|\\.)*)":/gm)].map((m) => m[1]));

const missing = new Set();
for (const f of files) {
  const src = readFileSync(f, "utf8");
  // t("..."), avisos (warnings.push("...")), mensajes de error que se muestran con t(e.message)
  const patterns = [/\bt\(\s*"((?:[^"\\]|\\.)*)"/g, /warnings\.push\("((?:[^"\\]|\\.)*)"\)/g, /(?:new (?:Read|AiNotAvailable)?Error|json)\(\s*\{?\s*(?:error:\s*)?"((?:[^"\\]|\\.)*)"/g, /setError\("((?:[^"\\]|\\.)*)"\)/g, /label: "((?:[^"\\]|\\.)*)"/g];
  for (const re of patterns) for (const m of src.matchAll(re)) if (!keys.has(m[1]) && /[a-záéíóúñ]/i.test(m[1])) missing.add(`${f}: ${m[1]}`);
}
if (missing.size) {
  console.log([...missing].join("\n"));
  process.exit(1);
}
console.log("i18n OK");
