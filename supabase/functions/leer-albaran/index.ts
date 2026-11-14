// Edge Function de Supabase: recibe las fotos de un albarán y devuelve sus líneas.
// La IA se elige con los secretos de Supabase (nunca están en el móvil):
//   GEMINI_API_KEY    → usa Gemini (modelo opcional en GEMINI_MODEL)
//   ANTHROPIC_API_KEY → usa Claude
//   AI_PROVIDER=gemini|claude para forzar una si están las dos.
import Anthropic from "@anthropic-ai/sdk";
import { ApiError, GoogleGenAI } from "@google/genai";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { ReadError, type Albaran, type AlbaranInput, type PageImage } from "./shared.ts";
import { extractWithClaude } from "./claude.ts";
import { DEFAULT_GEMINI_MODEL, extractWithGemini } from "./gemini.ts";

const MAX_PAGES = 10;
const MAX_TOTAL_BASE64 = 25 * 1024 * 1024;
const MAX_TEXT = 200_000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Provider = "gemini" | "claude";
function pickProvider(): Provider | null {
  const forced = Deno.env.get("AI_PROVIDER")?.toLowerCase();
  if (forced === "gemini" || forced === "claude") return forced;
  if (Deno.env.get("GEMINI_API_KEY")) return "gemini";
  if (Deno.env.get("ANTHROPIC_API_KEY")) return "claude";
  return null;
}

let gemini: GoogleGenAI | null = null;
let anthropic: Anthropic | null = null;

async function extract(provider: Provider, input: AlbaranInput): Promise<Albaran> {
  if (provider === "gemini") {
    gemini ??= new GoogleGenAI({ apiKey: Deno.env.get("GEMINI_API_KEY") });
    return extractWithGemini(gemini, input, Deno.env.get("GEMINI_MODEL") || DEFAULT_GEMINI_MODEL);
  }
  anthropic ??= new Anthropic(); // lee ANTHROPIC_API_KEY
  return extractWithClaude(anthropic, input);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  // Solo la cuenta de la tienda (sesión iniciada), no cualquiera con la clave pública
  const auth = req.headers.get("Authorization") ?? "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData } = await supabase.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!userData?.user) return json({ error: "Inicia sesión con la cuenta de la tienda." }, 401);

  let body: { images?: PageImage[]; text?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Petición no válida." }, 400);
  }

  let input: AlbaranInput;
  if (typeof body?.text === "string") {
    // Texto de un PDF o Excel (lo extrae el móvil)
    if (!body.text.trim()) return json({ error: "Petición no válida." }, 400);
    if (body.text.length > MAX_TEXT) return json({ error: "El documento es demasiado largo. Súbelo por partes." }, 413);
    input = { text: body.text };
  } else {
    const images = body?.images;
    const okType = (t: unknown) => t === "image/jpeg" || t === "image/png" || t === "image/webp";
    if (
      !Array.isArray(images) ||
      images.length === 0 ||
      images.length > MAX_PAGES ||
      !images.every((i) => okType(i?.media_type) && typeof i?.data === "string" && i.data.length > 0)
    ) {
      return json({ error: "Demasiadas fotos o ninguna (máximo 10 páginas)." }, 400);
    }
    if (images.reduce((s, i) => s + i.data.length, 0) > MAX_TOTAL_BASE64) return json({ error: "Las fotos son demasiado grandes." }, 413);
    input = { images };
  }

  const provider = pickProvider();
  if (!provider) return json({ error: "Falta la clave de la IA en el servidor (GEMINI_API_KEY o ANTHROPIC_API_KEY)." }, 500);

  try {
    const albaran = await extract(provider, input);
    return json(albaran);
  } catch (e) {
    if (e instanceof ReadError) return json({ error: e.message, code: e.code }, 422);
    if (e instanceof ApiError) {
      console.error(e);
      if (e.status === 429) return json({ error: "La IA está ocupada. Prueba en un minuto." }, 429);
      if (e.status === 400 || e.status === 401 || e.status === 403) return json({ error: "La clave de la IA no es válida o el modelo no existe (revisa GEMINI_API_KEY y GEMINI_MODEL)." }, 500);
      return json({ error: "La IA no responde. Prueba más tarde." }, 502);
    }
    if (e instanceof Anthropic.RateLimitError) return json({ error: "La IA está ocupada. Prueba en un minuto." }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: "La clave de la IA no es válida (revisa ANTHROPIC_API_KEY)." }, 500);
    if (e instanceof Anthropic.BadRequestError) {
      console.error(e);
      return json({ error: "La IA rechazó la petición." }, 400);
    }
    if (e instanceof Anthropic.APIError) {
      console.error(e);
      return json({ error: "La IA no responde. Prueba más tarde." }, 502);
    }
    console.error(e);
    return json({ error: "Error inesperado al leer el documento." }, 500);
  }
});
