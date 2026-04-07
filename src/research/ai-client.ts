// ============================================================
// Unified AI Client — OpenAI primary (cost-effective)
// Uses GPT-4o-mini for routine tasks, GPT-4o for complex ones
// ============================================================

import OpenAI from "openai";
import { OPENAI_API_KEY } from "../config.js";

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const key = OPENAI_API_KEY();
    if (!key) throw new Error("OPENAI_API_KEY is required");
    openaiClient = new OpenAI({ apiKey: key, timeout: 300_000, maxRetries: 2 });
  }
  return openaiClient;
}

/** Sleep utility */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Safe JSON parse with fallback */
export function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) return JSON.parse(arrayMatch[0]);
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * Call AI using OpenAI.
 *
 * Cost comparison (per 1M tokens):
 *   GPT-4o-mini:  $0.15 input / $0.60 output  (routine tasks)
 *   GPT-4o:       $2.50 input / $10 output     (complex generation)
 *   Claude Sonnet: $3 input / $15 output        (what we were using)
 *
 * GPT-4o-mini is ~20x cheaper than Claude for routine work.
 * GPT-4o is still ~3-6x cheaper than Claude.
 */
export async function callAI(
  prompt: string,
  options: {
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
    /** "fast" = gpt-4o-mini (cheap, good for JSON extraction/lookup)
     *  "quality" = gpt-4o (better for long document generation) */
    quality?: "fast" | "quality";
  } = {}
): Promise<string> {
  const {
    systemPrompt = "",
    maxTokens = 8192,
    temperature = 0.3,
    quality = "quality",
  } = options;

  const model = quality === "fast" ? "gpt-4o-mini" : "gpt-4o";

  const openai = getOpenAIClient();

  const messages: OpenAI.ChatCompletionMessageParam[] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const response = await openai.chat.completions.create({
    model,
    max_tokens: maxTokens,
    temperature,
    messages,
  });

  const text = response.choices[0]?.message?.content || "";
  if (!text.trim()) throw new Error(`Empty response from ${model}`);
  return text;
}

/**
 * Call AI expecting a JSON response. Parses and validates.
 */
export async function callAIJson<T>(
  prompt: string,
  options: {
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
    fallback: T;
    quality?: "fast" | "quality";
  }
): Promise<T> {
  const text = await callAI(prompt, options);
  return safeJsonParse(text, options.fallback);
}
