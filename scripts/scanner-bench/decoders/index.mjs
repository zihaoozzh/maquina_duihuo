// Candidatos. Interfaz común: async decode(img) -> string | null
// img = { file, width, height, rgba (Uint8Array), gray (Uint8Array), expected (solo el oráculo) }
import sharp from "sharp";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// ---------- utilidades
export const key = (s) => (/^\d+$/.test(s ?? "") ? s.replace(/^0+(?=\d)/, "") : (s ?? "").toUpperCase());
export function gtinOk(code) {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  const d = code.split("").map(Number);
  const c = d.pop();
  let sum = 0;
  for (let i = d.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += d[i] * w;
  return (10 - (sum % 10)) % 10 === c;
}
let seed = 7;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// ---------- 1. ZXing JS tal como la app (mismos formatos, sin TRY_HARDER)
function zxingJs({ tryHarder = false } = {}) {
  const Z = require("@zxing/library");
  const hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.CODE_39, Z.BarcodeFormat.ITF]);
  if (tryHarder) hints.set(Z.DecodeHintType.TRY_HARDER, true);
  const reader = new Z.MultiFormatReader();
  reader.setHints(hints);
  return async ({ gray, width, height }) => {
    try {
      const src = new Z.RGBLuminanceSource(new Uint8ClampedArray(gray), width, height);
      return reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(src))).getText();
    } catch {
      return null;
    }
  };
}

// ---------- 2. zxing-wasm (zxing-cpp)
function zxingWasm() {
  let mod;
  return async ({ rgba, width, height }) => {
    if (!mod) {
      mod = await import("zxing-wasm/reader");
      // sin red: usar el .wasm incluido en el paquete en vez del CDN
      const wasmPath = new URL("../../../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm", import.meta.url);
      const { readFileSync } = await import("node:fs");
      mod.setZXingModuleOverrides({ wasmBinary: readFileSync(wasmPath) });
    }
    const r = await mod.readBarcodes({ data: new Uint8ClampedArray(rgba), width, height, colorSpace: "srgb" }, { formats: ["EAN-13", "EAN-8", "UPC-A", "UPC-E", "Code128", "Code39", "ITF"], tryHarder: true, tryRotate: true });
    return r.find((x) => x.isValid)?.text ?? null;
  };
}

// ---------- 3. Quagga2
function quagga() {
  let Q;
  return async ({ file }) => {
    Q ??= require("@ericblade/quagga2").default ?? require("@ericblade/quagga2");
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(null), 4000);
      try {
        Q.decodeSingle({ src: file, numOfWorkers: 0, locate: true, inputStream: { size: 640 }, decoder: { readers: ["ean_reader", "ean_8_reader", "upc_reader", "code_128_reader", "i2of5_reader"] } }, (r) => {
          clearTimeout(t);
          resolve(r?.codeResult?.code ?? null);
        });
      } catch {
        clearTimeout(t);
        resolve(null);
      }
    });
  };
}

// ---------- 5. ZXing con preprocesado (gris normalizado, ×2, 4 rotaciones)
function zxingPre() {
  const dec = zxingJs({ tryHarder: true });
  return async ({ file }) => {
    for (const rot of [0, 90, 180, 270]) {
      for (const scale of [1, 2]) {
        let p = sharp(file).greyscale().normalise();
        if (rot) p = p.rotate(rot);
        if (scale > 1) p = p.resize({ width: 640 * scale });
        const { data, info } = await p.raw().toBuffer({ resolveWithObject: true });
        const r = await dec({ gray: data, width: info.width, height: info.height });
        if (r) return r;
      }
    }
    return null;
  };
}

// ---------- 6. Postproceso: solo aceptar lecturas con dígito de control válido
const withChecksum = (inner) => async (img) => {
  const r = await inner(img);
  return r && gtinOk(r) ? r : null;
};

// ---------- 8. "Corrección" contra catálogo (distancia de edición ≤ 1, solo si es única)
function lev1(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}
const catalogSnap = (inner, catalog) => async (img) => {
  const r = await inner(img);
  if (!r) return null;
  if (catalog.has(key(r))) return r;
  const near = [...catalog].filter((c) => lev1(c, key(r)));
  return near.length === 1 ? near[0] : r;
};

// ---------- "estúpidos"
const randomGuess = () => async () => Array.from({ length: 13 }, () => Math.floor(rnd() * 10)).join("");
const constant = (code) => async () => code;
const oracle = () => async ({ expected }) => expected;
const coinFlip = (a, b) => async (img) => (rnd() < 0.5 ? a(img) : b(img));
const ensemble = (decs) => async (img) => {
  const votes = new Map();
  for (const d of decs) {
    const r = await d(img);
    if (r) votes.set(key(r), (votes.get(key(r)) ?? 0) + 1);
  }
  const best = [...votes.entries()].sort((x, y) => y[1] - x[1])[0];
  return best && best[1] >= 2 ? best[0] : null;
};

// Escáner casero: 1 sola fila central, umbral fijo 128, solo EAN-13
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = L.map((p) => p.split("").reverse().map((c) => (c === "0" ? "1" : "0")).join("")); // G = L invertido y espejo... (derivado abajo)
const Gt = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = L.map((p) => p.split("").map((c) => (c === "0" ? "1" : "0")).join(""));
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];
void G;
function homemade() {
  return async ({ gray, width, height }) => {
    const row = gray.subarray(Math.floor(height / 2) * width, Math.floor(height / 2) * width + width);
    const bits = Array.from(row, (v) => (v < 128 ? 1 : 0));
    // longitudes de tramos
    const runs = [];
    let cur = bits[0], len = 0;
    for (const b of bits) {
      if (b === cur) len++;
      else { runs.push([cur, len]); cur = b; len = 1; }
    }
    runs.push([cur, len]);
    for (let s = 0; s + 59 <= runs.length; s++) {
      if (runs[s][0] !== 1) continue;
      const mod = (runs[s][1] + runs[s + 1][1] + runs[s + 2][1]) / 3;
      if (mod < 1) continue;
      const take = (from, n) => {
        let out = "";
        for (let i = from; i < from + n; i++) out += String(runs[i][0]).repeat(Math.max(1, Math.round(runs[i][1] / mod)));
        return out;
      };
      const norm = (str) => str.slice(0, 7);
      // 3 guarda + 6×4 runs + 5 guarda central + 6×4 + 3 guarda final = 59 runs
      const left = [], right = [];
      let idx = s + 3;
      let ok = true;
      for (let d = 0; d < 6 && ok; d++) { left.push(take(idx, 4)); idx += 4; }
      idx += 5;
      for (let d = 0; d < 6 && ok; d++) { right.push(take(idx, 4)); idx += 4; }
      if (left.some((p) => p.length !== 7) || right.some((p) => p.length !== 7)) continue;
      const parity = left.map((p) => (L.includes(norm(p)) ? "L" : Gt.includes(norm(p)) ? "G" : "?")).join("");
      const first = PARITY.indexOf(parity);
      if (first < 0) continue;
      const ds = left.map((p, i) => (parity[i] === "L" ? L : Gt).indexOf(p));
      const rs = right.map((p) => R.indexOf(p));
      if ([...ds, ...rs].some((d) => d < 0)) continue;
      return `${first}${ds.join("")}${rs.join("")}`;
    }
    return null;
  };
}

// OCR de los dígitos impresos bajo las barras (lento: solo con --ocr)
function ocr() {
  let worker;
  return async ({ file }) => {
    if (!worker) {
      const T = await import("tesseract.js");
      worker = await T.createWorker("eng");
      await worker.setParameters({ tessedit_char_whitelist: "0123456789" });
    }
    const { data } = await worker.recognize(file);
    const m = data.text.replace(/\s/g, "").match(/\d{8,14}/);
    return m ? m[0] : null;
  };
}

export function buildCandidates({ catalog, withOcr }) {
  const app = zxingJs();
  const wasm = zxingWasm();
  const quag = quagga();
  const list = [
    { name: "01 zxing-js (como la app)", dec: app },
    { name: "02 zxing-wasm", dec: wasm },
    { name: "03 quagga2", dec: quag },
    { name: "05 zxing-js + preproceso", dec: zxingPre() },
    { name: "06 zxing-js + checksum", dec: withChecksum(app) },
    { name: "06b zxing-wasm + checksum", dec: withChecksum(wasm) },
    { name: "08 zxing-js + catálogo (lev≤1)", dec: catalogSnap(app, catalog) },
    { name: "09 ALEATORIO", dec: randomGuess() },
    { name: "10 CONSTANTE", dec: constant([...catalog][0]) },
    { name: "11 casero 1 línea EAN-13", dec: homemade() },
    { name: "13 ORÁCULO", dec: oracle() },
    { name: "14 cara o cruz (js/wasm)", dec: coinFlip(app, wasm) },
    { name: "15 ensemble (js+wasm+quagga)", dec: ensemble([app, wasm, quag]) },
  ];
  if (withOcr) list.push({ name: "12 OCR tesseract", dec: ocr() });
  return list;
}
