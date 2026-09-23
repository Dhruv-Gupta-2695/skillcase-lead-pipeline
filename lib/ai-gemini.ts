import { GoogleGenAI } from "@google/genai";
import type { AIClient } from "./ai";
import { toolSchema } from "./schemas";
import { MODELS } from "./config";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Gemini free tier: JSON-schema structured output + zod validation + pacing/backoff for rate limits.
export function geminiClient(apiKey = process.env.GEMINI_API_KEY): AIClient {
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const ai = new GoogleGenAI({ apiKey });
  return {
    async call({ model, system, user, schema }) {
      let lastErr = "";
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await sleep(MODELS.minDelayMs); // stay under free-tier requests-per-minute
          const res = await ai.models.generateContent({
            model,
            contents: lastErr && !lastErr.startsWith("429") ? `${user}\n\nYour previous output was invalid: ${lastErr}. Fix it.` : user,
            config: {
              systemInstruction: system,
              temperature: MODELS.temperature,
              responseMimeType: "application/json",
              responseJsonSchema: toolSchema(schema),
            },
          });
          const parsed = schema.safeParse(JSON.parse(res.text ?? "null"));
          if (parsed.success) return parsed.data;
          lastErr = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
          if (attempt >= 1) break; // one schema retry, like the Anthropic client
        } catch (err) {
          const msg = (err as Error).message ?? String(err);
          if (/429|RESOURCE_EXHAUSTED|503|UNAVAILABLE/.test(msg)) { lastErr = `429: ${msg}`; await sleep(2 ** attempt * 5000); continue; }
          lastErr = msg; if (attempt >= 1) break;
        }
      }
      throw new Error(`Gemini call failed: ${lastErr}`);
    },
  };
}
