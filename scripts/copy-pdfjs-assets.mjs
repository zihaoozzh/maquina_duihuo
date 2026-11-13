// Copia los cMaps de pdf.js a public/ para leer PDFs con fuentes chinas/japonesas.
import { cpSync, mkdirSync } from "node:fs";
mkdirSync("public/pdfjs", { recursive: true });
cpSync("node_modules/pdfjs-dist/cmaps", "public/pdfjs/cmaps", { recursive: true });
console.log("pdfjs cmaps copiados a public/pdfjs/cmaps");
