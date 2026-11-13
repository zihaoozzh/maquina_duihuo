/** Lectura con Gemini (Google). */
import { FinishReason, type GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { AlbaranSchema, ReadError, SYSTEM, userPrompt, type Albaran, type PageImage } from "./shared.ts";

/** Se puede cambiar con el secreto GEMINI_MODEL sin tocar el código. */
export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest"; // alias de Google al último Gemini Flash

// Esquema JSON estándar (sin la clave $schema, que Gemini no necesita)
const { $schema: _schemaUri, ...jsonSchema } = z.toJSONSchema(AlbaranSchema);

export async function extractWithGemini(ai: GoogleGenAI, images: PageImage[], model = DEFAULT_GEMINI_MODEL): Promise<Albaran> {
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          ...images.map((img) => ({ inlineData: { mimeType: img.media_type, data: img.data } })),
          { text: userPrompt(images.length) },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM,
      responseMimeType: "application/json",
      responseJsonSchema: jsonSchema,
    },
  });

  const finish = response.candidates?.[0]?.finishReason;
  if (response.promptFeedback?.blockReason || finish === FinishReason.SAFETY || finish === FinishReason.PROHIBITED_CONTENT) {
    throw new ReadError("La IA no ha podido leer este documento.", "refusal");
  }
  if (finish === FinishReason.MAX_TOKENS) throw new ReadError("El documento es demasiado largo. Súbelo por partes.", "truncated");

  const text = response.text;
  if (!text) throw new ReadError("La respuesta de la IA no tiene el formato esperado.", "unparsed");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ReadError("La respuesta de la IA no tiene el formato esperado.", "unparsed");
  }
  const parsed = AlbaranSchema.safeParse(data);
  if (!parsed.success) throw new ReadError("La respuesta de la IA no tiene el formato esperado.", "unparsed");
  return parsed.data;
}
