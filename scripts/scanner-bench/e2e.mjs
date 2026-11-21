// Prueba de extremo a extremo: Chromium abre /escanear con una cámara simulada y se mide qué código
// lee la app de verdad y cuánto tarda. La cámara simulada sustituye getUserMedia por un
// canvas.captureStream() que dibuja la imagen (este Chromium no expone dispositivos falsos en el contenedor);
// el código del escáner (vídeo → ZXing) es el real.
// Uso: node scripts/scanner-bench/e2e.mjs
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "data");
const manifest = JSON.parse(readFileSync(join(DATA, "manifest.json"), "utf8"));
const PORT = 5199;
const BASE = `http://localhost:${PORT}/maquina_duihuo/#/escanear`;

// 2 muestras por (degradación, severidad) elegida
const picks = [["clean", 1], ["blur", 2], ["blur", 4], ["noise", 3], ["rotate", 2], ["rotate", 4], ["small", 3], ["lowcontrast", 4], ["glare", 4], ["shear", 3]];
const samples = picks.flatMap(([d, s]) => manifest.filter((m) => m.deg === d && m.sev === s && m.type === "ean13").slice(0, 2));

const vite = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { cwd: join(HERE, "../.."), stdio: "ignore" });
const stop = () => vite.kill("SIGTERM");
process.on("exit", stop);
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(BASE)).ok) break; } catch { /* aún arrancando */ }
  await new Promise((r) => setTimeout(r, 500));
}

const rows = [];
for (const m of samples) {
  const dataUrl = `data:image/jpeg;base64,${readFileSync(join(DATA, m.file)).toString("base64")}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", args: ["--no-sandbox"] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript((src) => {
    const make = () => {
      const c = document.createElement("canvas");
      c.width = 640;
      c.height = 480;
      const g = c.getContext("2d");
      const img = new Image();
      img.src = src;
      setInterval(() => img.complete && g.drawImage(img, 0, 0, 640, 480), 33);
      return c.captureStream(30);
    };
    const md = navigator.mediaDevices;
    md.getUserMedia = async () => make();
    md.enumerateDevices = async () => [{ kind: "videoinput", deviceId: "fake", label: "Back Camera", groupId: "g", toJSON() {} }];
  }, dataUrl);
  await page.goto(BASE);
  const t0 = Date.now();
  let got = null;
  try {
    const el = await page.waitForSelector("div.font-mono", { timeout: 9000 });
    got = (await el.textContent())?.trim() ?? null;
  } catch { /* sin lectura */ }
  const ms = Date.now() - t0;
  const native = await page.evaluate(() => "BarcodeDetector" in globalThis);
  rows.push({ id: m.id, deg: m.deg, sev: m.sev, expected: m.expected, got, ms, native });
  await browser.close();
}
stop();

const key = (s) => (s ?? "").replace(/^0+/, "");
let md = `# E2E con cámara falsa\n\nBarcodeDetector nativo disponible: ${rows[0]?.native}\n\n| Muestra | Esperado | Leído | Resultado | ms |\n|---|---|---|---|---:|\n`;
for (const r of rows) md += `| ${r.deg}${r.sev} | ${r.expected} | ${r.got ?? "–"} | ${r.got == null ? "sin lectura" : key(r.got) === key(r.expected) ? "ok" : "MAL"} | ${r.ms} |\n`;
mkdirSync(join(HERE, "results"), { recursive: true });
writeFileSync(join(HERE, "results", "e2e.md"), md);
console.log(md);
