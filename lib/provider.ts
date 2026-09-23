import type { AIClient } from "./ai";
import { anthropicClient } from "./ai";
import { geminiClient } from "./ai-gemini";
import { PROVIDER } from "./config";
// Swapping LLM provider = change PROVIDER in .env. Nothing else in the pipeline changes.
export const getAI = (): AIClient => (PROVIDER === "anthropic" ? anthropicClient() : geminiClient());
