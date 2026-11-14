/** Lectura con Claude (Anthropic). */
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AlbaranSchema, ReadError, SYSTEM, textPrompt, userPrompt, type Albaran, type AlbaranInput } from "./shared.ts";

export const CLAUDE_MODEL = "claude-opus-5-5";

export async function extractWithClaude(client: Anthropic, input: AlbaranInput): Promise<Albaran> {
  const content: Anthropic.Beta.BetaContentBlockParam[] =
    "text" in input
      ? [{ type: "text", text: textPrompt(input.text) }]
      : [
          ...input.images.map((img) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: img.media_type, data: img.data },
          })),
          { type: "text" as const, text: userPrompt(input.images.length) },
        ];
  const response = await client.beta.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [{ role: "user", content }],
    output_config: { format: betaZodOutputFormat(AlbaranSchema) },
  });

  if (response.stop_reason === "refusal") throw new ReadError("La IA no ha podido leer este documento.", "refusal");
  if (response.stop_reason === "max_tokens") throw new ReadError("El documento es demasiado largo. Súbelo por partes.", "truncated");
  if (!response.parsed_output) throw new ReadError("La respuesta de la IA no tiene el formato esperado.", "unparsed");
  return response.parsed_output;
}
