# Banco de pruebas del escáner

```bash
npm run bench:generate     # crea scripts/scanner-bench/data (imágenes sintéticas, semilla fija)
npm run bench              # candidatos × dataset → results/<fecha>.md y .json
npm run bench -- --ocr     # incluye el OCR de tesseract (lento)
npm run bench:e2e          # la app real en Chromium con cámara simulada → results/e2e.md
```

- `generate.mjs`: EAN-13, EAN-8, UPC-A, Code128 e ITF-14 con 14 degradaciones × 5 severidades.
  Fotos reales opcionales en `real/<ean>__nota.jpg` (no se commitea).
- `decoders/index.mjs`: los candidatos (serios, postprocesos y "estúpidos" de control).
- Controles de cordura: el **oráculo** debe dar 100 % y el **aleatorio** ≈ 0 %.
- Métrica clave: **mal leído %** (enseñar el producto equivocado es peor que no leer).

## Resultados (960 imágenes sintéticas, 2026-11-21)

| Candidato | Acierto % | Mal leído % |
|---|---:|---:|
| zxing-wasm | 79.0 | 0.6 |
| zxing-wasm + checksum | 79.0 | 0.0 |
| ensemble js+wasm+quagga (≥2 votos) | 70.9 | 0.0 |
| quagga2 | 63.8 | 2.6 |
| zxing-js como la app | 55.5 | **26.8** |
| zxing-js + checksum GTIN | 55.5 | 0.1 |
| casero 1 línea EAN-13 | 26.6 | 0.0 |
| constante / aleatorio | ~0 | ~100 |

Conclusiones:
1. **La app lee mal 1 de cada 4 códigos degradados** (rotación, oclusión, ruido, tamaño pequeño). Casi todo
   se corrige descartando lecturas sin dígito de control GTIN válido (`isGtinChecksumValid`, ya existe en
   `src/lib/ean.ts`): el "mal leído" baja de 26,8 % a 0,1 % sin perder aciertos.
2. El formato **ITF** (activado en `Scanner.tsx`) da un 65 % de lecturas erróneas en zxing-js: es el mayor
   generador de falsos positivos. La tienda trabaja con EAN/UPC.
3. **zxing-wasm** acierta ~79 % frente al ~56 % de zxing-js, y lee rotado y con oclusión (100 % con oclusión).
4. Ninguno lee códigos con desenfoque de movimiento fuerte, y `invert` (blanco sobre negro) no lo lee nadie.

Limitaciones: imágenes sintéticas (no sustituyen a fotos reales de la tienda); la lectura en vídeo con
varios fotogramas es mejor que una sola imagen, así que estos números son un suelo.
`BarcodeDetector` nativo no existe en Chromium de Linux, por lo que el camino Android no se ha medido.
En el e2e la cámara es un `canvas.captureStream()` porque este Chromium no tiene dispositivos falsos.
