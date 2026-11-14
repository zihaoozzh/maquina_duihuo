/**
 * Lo común a las dos IA (Gemini y Claude): qué datos se piden y con qué instrucciones.
 * Sin dependencias de Deno para poder probarlo también con Node.
 */
import { z } from "zod";

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

export const SYSTEM = `Eres un asistente que transcribe albaranes y facturas de proveedores de una tienda (bazar) en España.
Devuelve todas las líneas de producto del documento, en el orden en que aparecen, sin inventar ninguna.

Reglas:
- Copia los números tal como están impresos. En los documentos españoles la coma es el separador decimal ("1,25" = 1.25) y el punto separa miles ("1.250,00" = 1250).
- El código de barras (EAN) suele tener 13 dígitos (a veces 8 o 12). No lo confundas con la referencia del proveedor.
- Si una descripción ocupa dos renglones, únelos en una sola línea.
- No incluyas como líneas de producto los totales, bases imponibles, IVA, portes ni subtotales.
- Si el documento tiene varias páginas, júntalas todas en la misma lista.
- Si un dato no se lee, déjalo vacío o null y marca la línea como dudosa. Es mejor dudar que adivinar.
- Muchos números del documento NO son de productos: IBAN y cuentas bancarias, teléfonos, CIF/NIF, códigos postales, números de cliente, de pedido o de albarán, fechas, totales e impuestos. No los uses como cantidades, precios ni códigos de barras.`;

export class ReadError extends Error {
  constructor(
    message: string,
    readonly code: "refusal" | "truncated" | "unparsed",
  ) {
    super(message);
  }
}

/** Lo que se lee: fotos/páginas escaneadas, o el texto ya extraído de un PDF o Excel. */
export type AlbaranInput = { images: PageImage[] } | { text: string };

export const userPrompt = (pages: number) =>
  `Transcribe las líneas de producto de este documento (${pages} página${pages === 1 ? "" : "s"}).`;

export const textPrompt = (text: string) =>
  `Este es el texto extraído de un albarán o factura en PDF o Excel. Cada renglón es una fila del documento y las celdas están separadas por " | ". Transcribe sus líneas de producto.

<documento>
${text}
</documento>`;
