# 对货 · Albaranes

Webapp (PWA) para la tienda: se sube un albarán o factura, la app saca **códigos de barras,
cantidades y precios**, y luego se escanea el producto con el móvil para ver sus datos.

## Qué hace

- **Subir albarán**: PDF con texto o Excel/CSV, leídos al instante y sin conexión con reglas que
  detectan las columnas, comprueban que cantidad × precio = importe y descartan filas de IBAN o
  cuenta bancaria. Fotos y PDF escaneados no se leen solos: las líneas se escriben a mano.
- **Editar** un albarán ya guardado (datos y líneas).
- **Revisar antes de guardar**: cada línea se puede corregir; las dudosas salen en amarillo.
- **Escanear**: con la cámara (o escribiendo el código) se ve el PVP y el stock de la caja,
  el último coste y todas las veces que el producto aparece en albaranes.
- **Comprobar mercancía (对货)**: dentro de un albarán, al escanear un producto sale con su precio,
  se escribe cuántas han llegado y queda «✓ 已对» (con 缺/多 si no coincide).
- **Productos de la caja**: se importa el Excel exportado de **Bohao Market**.
- Español / 中文.

- **Base de datos compartida (Supabase)**: todos los móviles de la tienda ven los mismos
  albaranes, productos y recuentos. La app sigue funcionando sin cobertura: guarda en el móvil y
  sube los cambios cuando vuelve la conexión.

## Puesta en marcha de la base de datos (una sola vez)

1. Crea un proyecto gratuito en [supabase.com](https://supabase.com) (región: Europa).
2. **SQL Editor** → pega y ejecuta, en orden, los archivos de `supabase/migrations/`.
3. **Authentication → Sign In / Providers**: desactiva *Allow new users to sign up*.
   **Authentication → Users → Add user**: crea la cuenta de la tienda (email + contraseña).
4. En la app: **⚙ Ajustes** → entra con el email y la contraseña de la tienda. La dirección y la clave pública de
   Supabase ya vienen integradas en la app (`src/lib/cloud.ts`, o `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
   al compilar), no hay que escribirlas.
5. Segundo móvil: abre la app y entra con la misma cuenta.

**Una cuenta = una tienda.** Todas las tiendas comparten el mismo proyecto de Supabase, pero cada cuenta solo ve
sus datos (columna `shop_id` = id de la cuenta, con políticas RLS). Para dar de alta una tienda nueva: **Authentication
→ Users → Add user** (el registro público sigue desactivado). Si en un móvil entra otra cuenta, los datos locales de la
anterior se borran para no mezclarlos.

Seguridad: la clave *anon* es pública por diseño; los datos solo se pueden leer o escribir con la
sesión de la cuenta de su tienda (políticas RLS por `shop_id`).

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173/maquina_duihuo/
npm test         # pruebas del lector de albaranes
npm run build
```

- Lectura de albaranes: `src/lib/parse.ts` (pruebas en `src/lib/parse.test.ts`).
- Sincronización: `src/lib/sync.ts` (pruebas con un Supabase simulado en `src/lib/sync.test.ts`).

Para que un proveedor nuevo se lea bien, lo mejor es añadir una prueba con sus filas.

## Publicación

Cada push a `main` publica la app en GitHub Pages
(`Settings → Pages → Source: GitHub Actions`). Dirección: `https://zihaoozzh.github.io/maquina_duihuo/`.
