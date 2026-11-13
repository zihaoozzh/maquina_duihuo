# 对货 · Albaranes

Webapp (PWA) para la tienda: se sube un albarán o factura, la app saca **códigos de barras,
cantidades y precios**, y luego se escanea el producto con el móvil para ver sus datos.

## Qué hace

- **Subir albarán**: PDF con texto o Excel/CSV (se leen **sin IA**, con reglas que detectan
  las columnas y comprueban que cantidad × precio = importe). Fotos y PDF escaneados: de momento
  las líneas se añaden a mano (la lectura con IA llegará después).
- **Revisar antes de guardar**: cada línea se puede corregir; las dudosas salen en amarillo.
- **Escanear**: con la cámara (o escribiendo el código) se ve el PVP y el stock de la caja,
  el último coste y todas las veces que el producto aparece en albaranes.
- **Comprobar mercancía (对货)**: dentro de un albarán, escaneando lo que llega se cuentan las
  unidades recibidas y se ve qué falta o sobra.
- **Productos de la caja**: se importa el Excel exportado de **Bohao Market**.
- Español / 中文.

Los datos se guardan en el móvil (IndexedDB). La base de datos compartida entre móviles y la
conexión en directo con Bohao son los siguientes pasos.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173/maquina_duihuo/
npm test         # pruebas del lector de albaranes
npm run build
```

La lógica de lectura está en `src/lib/parse.ts` (con pruebas en `src/lib/parse.test.ts`).
Para que un proveedor nuevo se lea bien, lo mejor es añadir una prueba con sus filas.

## Publicación

Cada push a `main` publica la app en GitHub Pages
(`Settings → Pages → Source: GitHub Actions`). Dirección: `https://zihaoozzh.github.io/maquina_duihuo/`.
