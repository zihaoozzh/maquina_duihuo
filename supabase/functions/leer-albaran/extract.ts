/**
 * Lectura de albaranes con IA (Claude). Se usa solo con fotos y PDF escaneados.
 * Este archivo no depende de Deno para poder probarlo también con Node.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

export const MODEL = "claude-opus-5-5";

export const AlbaranSchema = z.object({
  supplier: z.string().describe("Nombre del proveedor (la empresa que emite el documento). Vacío si no se ve."),
  number: z.string().describe("Número de albarán o factura. Vacío si no se ve."),
  date: z.string().describe("Fecha del documento en formato AAAA-MM-DD. Vacío si no se ve."),
  lines: z.array(
    z.object({
      ean: z.string().describe("Código de barras (EAN/UPC, solo dígitos) tal como aparece. Vacío si la línea no lo tiene."),
      ref: z.string().describe("Referencia o código del proveedor. Vacío si no hay."),
      description: z.string().describe("Descripción del artículo tal como aparece."),
      qty: z.number().nullable().describe("Cantidad de unidades. null si no se lee."),
      price: z.number().nullable().describe("Precio unitario antes de descuento. null si no se lee."),
      discount: z.number().nullable().describe("Descuento en % de la línea. null si no hay."),
      total: z.number().nullable().describe("Importe de la línea. null si no se lee."),
      doubtful: z.boolean().describe("true si algún dato de la línea no se lee con claridad."),
    }),
  ),
});

export type Albaran = z.infer<typeof AlbaranSchema>;

export interface PageImage {
  media_type: "image/jpeg" | "image/png" | "image/webp";
  data: string; // base64 sin saltos de línea
}

const SYSTEM = `Eres un asistente que transcribe albaranes y facturas de proveedores de una tienda (bazar) en España.
Devuelve todas las líneas de producto del documento, en el orden en que aparecen, sin inventar ninguna.

Reglas:
- Copia los números tal como están impresos. En los documentos españoles la coma es el separador decimal ("1,25" = 1.25) y el punto separa miles ("1.250,00" = 1250).
- El código de barras (EAN) suele tener 13 dígitos (a veces 8 o 12). No lo confundas con la referencia del proveedor.
- Si una descripción ocupa dos renglones, únelos en una sola línea.
- No incluyas como líneas de producto los totales, bases imponibles, IVA, portes ni subtotales.
- Si el documento tiene varias páginas, júntalas todas en la misma lista.
- Si un dato no se lee, déjalo vacío o null y marca la línea como dudosa. Es mejor dudar que adivinar.`;

export class ReadError extends Error {
  constructor(
    message: string,
    readonly code: "refusal" | "truncated" | "unparsed",
  ) {
    super(message);
  }
}

export async function extractAlbaran(client: Anthropic, images: PageImage[]): Promise<Albaran> {
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          ...images.map((img) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: img.media_type, data: img.data },
          })),
          { type: "text", text: `Transcribe las líneas de producto de este documento (${images.length} página${images.length === 1 ? "" : "s"}).` },
        ],
      },
    ],
    output_config: { format: betaZodOutputFormat(AlbaranSchema) },
  });

  if (response.stop_reason === "refusal") throw new ReadError("La IA no ha podido leer este documento.", "refusal");
  if (response.stop_reason === "max_tokens") throw new ReadError("El documento es demasiado largo. Súbelo por partes.", "truncated");
  if (!response.parsed_output) throw new ReadError("La respuesta de la IA no tiene el formato esperado.", "unparsed");
  return response.parsed_output;
}
