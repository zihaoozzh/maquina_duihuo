# 对货 · Albaranes

Webapp (PWA) para la tienda: se sube un albarán o factura, la app saca **códigos de barras,
cantidades y precios**, y luego se escanea el producto con el móvil para ver sus datos.

## Qué hace

- **Subir albarán**: PDF con texto o Excel/CSV (se leen **sin IA**, con reglas que detectan
  las columnas y comprueban que cantidad × precio = importe). **Fotos y PDF escaneados se leen
  con IA (Claude)**, a través de una función del servidor que guarda la clave.
- **Revisar antes de guardar**: cada línea se puede corregir; las dudosas salen en amarillo.
- **Escanear**: con la cámara (o escribiendo el código) se ve el PVP y el stock de la caja,
  el último coste y todas las veces que el producto aparece en albaranes.
- **Comprobar mercancía (对货)**: dentro de un albarán, escaneando lo que llega se cuentan las
  unidades recibidas y se ve qué falta o sobra.
- **Productos de la caja**: se importa el Excel exportado de **Bohao Market**.
- Español / 中文.

- **Base de datos compartida (Supabase)**: todos los móviles de la tienda ven los mismos
  albaranes, productos y recuentos. La app sigue funcionando sin cobertura: guarda en el móvil y
  sube los cambios cuando vuelve la conexión.

## Puesta en marcha de la base de datos y la IA (una sola vez)

1. Crea un proyecto gratuito en [supabase.com](https://supabase.com) (región: Europa).
2. **SQL Editor** → pega y ejecuta `supabase/migrations/20261113000000_init.sql`.
3. **Authentication → Sign In / Providers**: desactiva *Allow new users to sign up*.
   **Authentication → Users → Add user**: crea la cuenta de la tienda (email + contraseña).
4. Función de la IA (necesita la [CLI de Supabase](https://supabase.com/docs/guides/cli)):
   ```bash
   supabase login
   supabase link --project-ref TU_PROYECTO
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase functions deploy leer-albaran
   ```
   La clave de la IA se crea en [console.anthropic.com](https://console.anthropic.com) y solo vive
   en Supabase, nunca en el móvil.
5. En la app: **⚙ Ajustes** → «O escribe la dirección y la clave de Supabase» (Project Settings →
   API: *Project URL* y la clave *anon/publishable*) → entra con la cuenta de la tienda.
6. Para el segundo móvil: en Ajustes, «Compartir enlace de la tienda», ábrelo allí y entra con la
   misma cuenta.

Seguridad: la clave *anon* es pública por diseño; los datos solo se pueden leer o escribir con la
sesión de la cuenta de la tienda (políticas RLS), y la función de IA también lo comprueba.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173/maquina_duihuo/
npm test         # pruebas del lector de albaranes
npm run build
```

- Lectura sin IA: `src/lib/parse.ts` (pruebas en `src/lib/parse.test.ts`).
- Lectura con IA: `supabase/functions/leer-albaran/` (servidor) y `src/lib/ai.ts` (móvil).
- Sincronización: `src/lib/sync.ts` (pruebas con un Supabase simulado en `src/lib/sync.test.ts`).

Para que un proveedor nuevo se lea bien, lo mejor es añadir una prueba con sus filas.

## Publicación

Cada push a `main` publica la app en GitHub Pages
(`Settings → Pages → Source: GitHub Actions`). Dirección: `https://zihaoozzh.github.io/maquina_duihuo/`.
