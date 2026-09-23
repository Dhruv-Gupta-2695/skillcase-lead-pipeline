import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { toolSchema } from "./schemas";
import { MODELS } from "./config";

export interface AIClient {
  call<T>(opts: { model: string; system: string; user: string; toolName: string; schema: z.ZodType<T> }): Promise<T>;
}

// Structured output via a forced tool call: the model MUST answer with JSON matching the schema.
export function anthropicClient(apiKey = process.env.ANTHROPIC_API_KEY): AIClient {
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey });
  return {
    async call({ model, system, user, toolName, schema }) {
      let lastErr = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await client.messages.create({
          model,
          max_tokens: 2000,
          temperature: MODELS.temperature,
          system,
          tools: [{ name: toolName, description: `Return the ${toolName} result`, input_schema: toolSchema(schema) as Anthropic.Tool.InputSchema }],
          tool_choice: { type: "tool", name: toolName },
          messages: [{ role: "user", content: attempt ? `${user}\n\nYour previous output was invalid: ${lastErr}. Fix it.` : user }],
        });
        const block = res.content.find((b) => b.type === "tool_use");
        const parsed = schema.safeParse(block && "input" in block ? block.input : null);
        if (parsed.success) return parsed.data;
        lastErr = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      }
      throw new Error(`Schema validation failed twice: ${lastErr}`);
    },
  };
}
