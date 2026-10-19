import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";

// If a safety classifier ever declines a request, the API re-runs it on Anthropic's
// recommended fallback model server-side instead of returning a refusal.
export const FALLBACK: { betas: Anthropic.Beta.AnthropicBeta[]; fallbacks: "default" } = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};

let client: Anthropic | undefined;

export function claude() {
  client ??= new Anthropic();
  return client;
}

export class RefusedError extends Error {
  constructor(public category: string | null | undefined) {
    super(`Claude declined this request${category ? ` (${category})` : ""}`);
  }
}
