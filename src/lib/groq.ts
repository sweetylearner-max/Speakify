import "server-only";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export const REPORT_MODEL = "openai/gpt-oss-120b"; // same model the iOS Groq provider used
export const CHAT_MODEL = "openai/gpt-oss-20b"; // fast model for live audience lines and fallback

export class GroqError extends Error {
  constructor(public code: "no_key" | "auth" | "rate_limit" | "network" | "bad_response", message: string, public status = 502) {
    super(message);
  }
}

interface ChatOptions {
  model: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export async function groqChat(opts: ChatOptions): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key || key === "your_groq_api_key_here") {
    throw new GroqError("no_key", "GROQ_API_KEY is not set on the server. Add it to .env.local and restart.", 500);
  }

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.6,
    max_completion_tokens: opts.maxTokens ?? 800,
    stream: false,
  };
  if (opts.json) body.response_format = { type: "json_object" };
  if (opts.model.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 25000),
    });
  } catch {
    throw new GroqError("network", "Could not reach Groq. Check your internet connection.", 504);
  }

  if (res.status === 401 || res.status === 403) throw new GroqError("auth", "Groq rejected the API key.", 401);
  if (res.status === 429) throw new GroqError("rate_limit", "Groq rate limit reached. Wait a few seconds and try again.", 429);
  if (!res.ok) throw new GroqError("bad_response", `Groq returned an error (${res.status}).`, 502);

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new GroqError("bad_response", "Groq returned an empty answer.", 502);
  return text;
}

export function errorResponse(err: unknown) {
  if (err instanceof GroqError) {
    return Response.json({ error: err.code, message: err.message }, { status: err.status });
  }
  return Response.json({ error: "bad_request", message: "Something went wrong handling that request." }, { status: 400 });
}
