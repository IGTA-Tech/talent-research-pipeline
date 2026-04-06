// ============================================================
// Unified AI Client — Claude primary, OpenAI fallback
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { ANTHROPIC_API_KEY, OPENAI_API_KEY } from "../config.js";

let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: ANTHROPIC_API_KEY(),
      timeout: 300_000, // 5 minutes
      maxRetries: 2,
    });
  }
  return anthropicClient;
}

function getOpenAIClient(): OpenAI | null {
  const key = OPENAI_API_KEY();
  if (!key) return null;
  if (!openaiClient) {
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
 * Call AI with Claude primary and OpenAI fallback.
 * Handles retries, timeouts, and graceful degradation.
 */
export async function callAI(
  prompt: string,
  options: {
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
    model?: string;
  } = {}
): Promise<string> {
  const {
    systemPrompt = "",
    maxTokens = 8192,
    temperature = 0.3,
    model = "claude-sonnet-4-5-20250929",
  } = options;

  // Try Claude first
  try {
    const client = getAnthropicClient();
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: prompt },
    ];

    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages,
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    if (!text.trim()) throw new Error("Empty response from Claude");
    return text;
  } catch (claudeError: any) {
    console.warn(
      `[AI] Claude failed (${claudeError.message}), trying OpenAI fallback...`
    );

    // Try OpenAI fallback
    const openai = getOpenAIClient();
    if (!openai) {
      throw new Error(
        `Claude failed: ${claudeError.message}. No OpenAI fallback configured.`
      );
    }

    try {
      const messages: OpenAI.ChatCompletionMessageParam[] = [];
      if (systemPrompt) {
        messages.push({ role: "system", content: systemPrompt });
      }
      messages.push({ role: "user", content: prompt });

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: maxTokens,
        temperature,
        messages,
      });

      const text = response.choices[0]?.message?.content || "";
      if (!text.trim())
        throw new Error("Empty response from OpenAI");
      return text;
    } catch (openaiError: any) {
      throw new Error(
        `Both AI providers failed. Claude: ${claudeError.message}. OpenAI: ${openaiError.message}`
      );
    }
  }
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
  }
): Promise<T> {
  const text = await callAI(prompt, options);
  return safeJsonParse(text, options.fallback);
}
