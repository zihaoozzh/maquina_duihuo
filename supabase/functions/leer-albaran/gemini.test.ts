// deno test supabase/functions/leer-albaran/gemini.test.ts
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import type { GoogleGenAI } from "@google/genai";
import { extractWithGemini } from "./gemini.ts";
import { ReadError } from "./shared.ts";

const page = { media_type: "image/jpeg" as const, data: "AAAA" };

function fakeAi(response: unknown, seen: unknown[] = []): GoogleGenAI {
  return { models: { generateContent: (req: unknown) => (seen.push(req), Promise.resolve(response)) } } as unknown as GoogleGenAI;
}

const good = {
  supplier: "PROV",
  number: "A1",
  date: "2026-11-10",
  lines: [{ ean: "8410076472519", ref: "", description: "TAZA", qty: 12, price: 1.25, discount: null, total: 15, doubtful: false }],
};

Deno.test("lee la respuesta JSON y envía imagen, instrucciones y esquema", async () => {
  const seen: Record<string, any>[] = [];
  const out = await extractWithGemini(fakeAi({ text: JSON.stringify(good), candidates: [{ finishReason: "STOP" }] }, seen), [page], "m");
  assertEquals(out, good);
  const req = seen[0];
  assertEquals(req.model, "m");
  assertEquals(req.contents[0].parts[0], { inlineData: { mimeType: "image/jpeg", data: "AAAA" } });
  assertEquals(req.config.responseMimeType, "application/json");
  assertEquals(req.config.responseJsonSchema.type, "object");
});

Deno.test("rechaza JSON que no cumple el esquema", async () => {
  await assertRejects(() => extractWithGemini(fakeAi({ text: '{"lines": "x"}' }), [page]), ReadError);
});

Deno.test("documento bloqueado o demasiado largo", async () => {
  await assertRejects(() => extractWithGemini(fakeAi({ promptFeedback: { blockReason: "OTHER" } }), [page]), ReadError, "no ha podido");
  await assertRejects(() => extractWithGemini(fakeAi({ text: "{", candidates: [{ finishReason: "MAX_TOKENS" }] }), [page]), ReadError, "demasiado largo");
});
