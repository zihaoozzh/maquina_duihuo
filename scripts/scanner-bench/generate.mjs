// Genera el dataset sintético: códigos de barras con degradaciones de severidad creciente.
// Uso: node scripts/scanner-bench/generate.mjs [repeticiones=3]
import { mkdirSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import bwip from "bwip-js";
import sharp from "sharp";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "data");
const REPS = Number(process.argv[2] ?? 3);
const W = 640;
const H = 480;

// --- aleatorio con semilla fija (reproducible)
let seed = 20261121;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
const digits = (n) => Array.from({ length: n }, () => Math.floor(rnd() * 10)).join("");

function gtinCheck(body) {
  let sum = 0;
  for (let i = body.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += Number(body[i]) * w;
  return String((10 - (sum % 10)) % 10);
}
const gtin = (n) => {
  const b = digits(n - 1);
  return b + gtinCheck(b);
};

const TYPES = {
  ean13: { bcid: "ean13", make: () => gtin(13) },
  ean8: { bcid: "ean8", make: () => gtin(8) },
  upca: { bcid: "upca", make: () => gtin(12) },
  code128: { bcid: "code128", make: () => gtin(13) },
  itf14: { bcid: "interleaved2of5", make: () => gtin(14) },
};

// --- degradaciones: 5 niveles cada una (índice 0 = suave, 4 = brutal)
const DEG = {
  clean: { levels: [0] },
  blur: { levels: [0.8, 1.5, 2.5, 3.5, 5] },
  motion: { levels: [3, 7, 11, 15, 21] },
  noise: { levels: [8, 18, 30, 45, 65] },
  lowcontrast: { levels: [0.7, 0.5, 0.35, 0.22, 0.12] },
  glare: { levels: [0.2, 0.4, 0.6, 0.8, 0.95] },
  jpeg: { levels: [60, 35, 20, 10, 4] },
  rotate: { levels: [5, 15, 30, 60, 90] },
  shear: { levels: [0.05, 0.15, 0.3, 0.5, 0.8] },
  small: { levels: [0.8, 0.5, 0.3, 0.18, 0.1] },
  occlusion: { levels: [0.1, 0.3, 0.5, 0.7, 0.85] },
  clutter: { levels: [2, 6, 12, 20, 35] },
  tightquiet: { levels: [200, 150, 100, 60, 20] },
  invert: { levels: [1] },
};

async function barcodePng(type, text, tight) {
  return bwip.toBuffer({ bcid: TYPES[type].bcid, text, scale: 3, height: 14, includetext: true, textxalign: "center", paddingwidth: tight ? 0 : 10, paddingheight: tight ? 0 : 6, backgroundcolor: tight ? undefined : "ffffff" });
}

async function addNoise(buf, sd) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i++) data[i] = Math.max(0, Math.min(255, data[i] + gauss() * sd));
  return sharp(data, { raw: info });
}

async function render(type, text, deg, lvl) {
  const val = DEG[deg].levels[lvl];
  const tight = deg === "tightquiet";
  let code = await barcodePng(type, text, tight);
  let scaleFrac = 0.7;
  if (deg === "small") scaleFrac = val;
  const targetW = Math.round(W * scaleFrac);
  let img = sharp(code).resize({ width: targetW, kernel: "lanczos3" });
  if (deg === "blur") img = sharp(await img.png().toBuffer()).blur(val);
  if (deg === "motion") {
    // kernel de 3 filas con solo la central llena: difumina en horizontal
    const k = [...Array(val).fill(0), ...Array(val).fill(1), ...Array(val).fill(0)];
    img = sharp(await img.png().toBuffer()).convolve({ width: val, height: 3, kernel: k, scale: val });
  }
  if (deg === "occlusion") {
    const m = await sharp(await img.png().toBuffer()).metadata();
    const bar = await sharp({ create: { width: m.width, height: Math.max(1, Math.round(m.height * val)), channels: 3, background: "#777" } }).png().toBuffer();
    img = sharp(await img.png().toBuffer()).composite([{ input: bar, top: Math.round(m.height * 0.2), left: 0 }]);
  }
  if (deg === "shear") img = sharp(await img.png().toBuffer()).affine([[1, val], [0, 1]], { background: "#ffffff" });
  if (deg === "rotate") img = sharp(await img.png().toBuffer()).rotate(val, { background: "#ffffff" });
  let buf = await img.png().toBuffer();

  const bgLum = tight ? val : 235;
  const layers = [];
  if (deg === "clutter") {
    for (let i = 0; i < val; i++) {
      const w = 20 + Math.floor(rnd() * 160), h = 10 + Math.floor(rnd() * 80);
      const g = Math.floor(rnd() * 255);
      const r = await sharp({ create: { width: w, height: h, channels: 3, background: { r: g, g, b: g } } }).png().toBuffer();
      layers.push({ input: r, top: Math.floor(rnd() * (H - h)), left: Math.floor(rnd() * (W - w)) });
    }
  }
  const m = await sharp(buf).metadata();
  const ox = Math.max(0, Math.round((W - m.width) / 2)), oy = Math.max(0, Math.round((H - m.height) / 2));
  const fit = m.width > W || m.height > H ? await sharp(buf).resize({ width: W, height: H, fit: "inside" }).png().toBuffer() : buf;
  layers.push({ input: fit, top: oy, left: ox });
  let frame = sharp({ create: { width: W, height: H, channels: 3, background: { r: bgLum, g: bgLum, b: bgLum } } }).composite(layers);
  let out = await frame.png().toBuffer();

  if (deg === "lowcontrast") out = await sharp(out).linear(val, 128 * (1 - val)).png().toBuffer();
  if (deg === "glare") {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><radialGradient id="g" cx="${40 + rnd() * 20}%" cy="${40 + rnd() * 20}%" r="45%"><stop offset="0" stop-color="#fff" stop-opacity="${val}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
    out = await sharp(out).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
  }
  if (deg === "invert") out = await sharp(out).negate().png().toBuffer();
  if (deg === "noise") out = await (await addNoise(out, val)).png().toBuffer();
  const q = deg === "jpeg" ? val : 85;
  return sharp(out).jpeg({ quality: q }).toBuffer();
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(join(OUT, "img"), { recursive: true });
const manifest = [];
let n = 0;
for (const deg of Object.keys(DEG)) {
  for (let lvl = 0; lvl < DEG[deg].levels.length; lvl++) {
    for (const type of Object.keys(TYPES)) {
      for (let r = 0; r < (deg === "clean" ? REPS * 3 : REPS); r++) {
        const text = TYPES[type].make();
        const id = `${String(++n).padStart(5, "0")}_${type}_${deg}${lvl}`;
        try {
          writeFileSync(join(OUT, "img", `${id}.jpg`), await render(type, text, deg, lvl));
          manifest.push({ id, file: `img/${id}.jpg`, type, expected: text, deg, sev: lvl + 1 });
        } catch (e) {
          console.error("fallo", id, e.message);
        }
      }
    }
  }
}
// Fotos reales opcionales: real/<ean>__nota.jpg
const REAL = join(HERE, "real");
if (existsSync(REAL)) {
  for (const f of readdirSync(REAL).filter((f) => /\.(jpe?g|png)$/i.test(f))) {
    const ean = f.split("__")[0];
    manifest.push({ id: `real_${f}`, file: join("..", "real", f), type: "real", expected: ean, deg: "real", sev: 1 });
  }
}
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest));
console.log(`${manifest.length} imágenes en ${OUT}`);
