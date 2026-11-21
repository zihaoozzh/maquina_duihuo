// Ejecuta todos los candidatos sobre el dataset y escribe results/<fecha>.{json,md}
// Uso: node scripts/scanner-bench/run.mjs [--ocr] [--only=texto]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { buildCandidates, key } from "./decoders/index.mjs";

// ZXing JS avisa por consola de cada intento fallido: silenciarlo
console.warn = () => {};
const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "data");
const manifest = JSON.parse(readFileSync(join(DATA, "manifest.json"), "utf8"));
const withOcr = process.argv.includes("--ocr");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);

// Catálogo simulado: los EAN reales del dataset + 2000 distractores
let s = 99;
const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
const catalog = new Set(manifest.map((m) => key(m.expected)));
while (catalog.size < manifest.length + 2000) catalog.add(Array.from({ length: 13 }, () => Math.floor(r() * 10)).join("").replace(/^0+/, ""));

const candidates = buildCandidates({ catalog, withOcr }).filter((c) => !only || c.name.includes(only));
const stats = {}; // name -> { rows: [{deg,sev,type,res,ms}] }
for (const c of candidates) stats[c.name] = [];

let i = 0;
for (const m of manifest) {
  const file = join(DATA, m.file);
  const { data: rgba, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const gray = await sharp(file).greyscale().raw().toBuffer();
  const img = { file, width: info.width, height: info.height, rgba, gray, expected: m.expected };
  for (const c of candidates) {
    const t0 = performance.now();
    let out = null;
    try {
      out = await c.dec(img);
    } catch (e) {
      out = null;
    }
    const ms = performance.now() - t0;
    const res = out == null ? "none" : key(out) === key(m.expected) ? "ok" : "wrong";
    stats[c.name].push({ deg: m.deg, sev: m.sev, type: m.type, res, ms });
  }
  if (++i % 50 === 0) console.error(`${i}/${manifest.length}`);
}

const pct = (a, f) => (a.length ? (100 * a.filter(f).length) / a.length : 0);
const q = (arr, p) => [...arr].sort((a, b) => a - b)[Math.floor((arr.length - 1) * p)] ?? 0;
const summary = candidates.map((c) => {
  const rows = stats[c.name];
  return { name: c.name, n: rows.length, ok: pct(rows, (x) => x.res === "ok"), wrong: pct(rows, (x) => x.res === "wrong"), none: pct(rows, (x) => x.res === "none"), p50: q(rows.map((x) => x.ms), 0.5), p95: q(rows.map((x) => x.ms), 0.95) };
});
summary.sort((a, b) => b.ok - a.ok);

const degs = [...new Set(manifest.map((m) => m.deg))];
let md = `# Backtest del escáner\n\n${manifest.length} imágenes · ${new Date().toISOString().slice(0, 10)}\n\n## Ranking\n\n| Candidato | Acierto % | **Mal leído %** | Sin lectura % | p50 ms | p95 ms |\n|---|---:|---:|---:|---:|---:|\n`;
for (const x of summary) md += `| ${x.name} | ${x.ok.toFixed(1)} | ${x.wrong.toFixed(1)} | ${x.none.toFixed(1)} | ${x.p50.toFixed(1)} | ${x.p95.toFixed(1)} |\n`;
md += `\n## Acierto % por degradación (severidad 1 → 5)\n`;
for (const c of candidates) {
  md += `\n### ${c.name}\n\n| Degradación | ${[1, 2, 3, 4, 5].map((v) => `sev ${v}`).join(" | ")} |\n|---|${"---:|".repeat(5)}\n`;
  for (const d of degs) {
    const cells = [1, 2, 3, 4, 5].map((v) => {
      const rows = stats[c.name].filter((x) => x.deg === d && x.sev === v);
      return rows.length ? pct(rows, (x) => x.res === "ok").toFixed(0) : "–";
    });
    md += `| ${d} | ${cells.join(" | ")} |\n`;
  }
}
const day = new Date().toISOString().slice(0, 10);
mkdirSync(join(HERE, "results"), { recursive: true });
writeFileSync(join(HERE, "results", `${day}.json`), JSON.stringify({ summary, stats }));
writeFileSync(join(HERE, "results", `${day}.md`), md);
console.log(md.split("\n## Acierto")[0]);
