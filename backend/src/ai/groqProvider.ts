import Groq from "groq-sdk";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt";
import type { AIMessageInput, AIProvider, AIProviderResponse } from "./types";

export interface GroqConfig {
  apiKey: string | undefined;
  model: string | undefined;
}

export function loadGroqConfig(env: NodeJS.ProcessEnv = process.env): GroqConfig {
  return { apiKey: env.GROQ_API_KEY || undefined, model: env.GROQ_MODEL || undefined };
}

const REQUEST_TIMEOUT_MS = 30_000;

// Groq implementation of AIProvider. Configuration problems surface when
// analyze() is called, not at construction, so a missing key can't stop the
// server from starting.
export class GroqProvider implements AIProvider {
  private client: Groq | null = null;

  constructor(private readonly config: GroqConfig = loadGroqConfig()) {}

  async analyze(input: AIMessageInput): Promise<AIProviderResponse> {
    const { apiKey, model } = this.config;
    if (!apiKey) throw new Error("GROQ_API_KEY is not set");
    if (!model) throw new Error("GROQ_MODEL is not set");

    this.client ??= new Groq({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
    const completion = await this.client.chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(input) },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Groq returned an empty response");
    return { model, content };
  }
}
