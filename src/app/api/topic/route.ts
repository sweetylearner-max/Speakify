import { CHAT_MODEL, errorResponse, groqChat } from "@/lib/groq";

export const runtime = "nodejs";

interface Body {
  name: string;
  experience: string;
  goal: string;
  focus: string;
  avoid?: string[];
}

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as Body;
    if (!b || typeof b.goal !== "string") return Response.json({ error: "bad_request", message: "Bad request." }, { status: 400 });
    const text = await groqChat({
      model: CHAT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You write impromptu speaking prompts for students practicing public speaking. Reply with ONE prompt only: a single sentence or question, under 25 words, no quotes, no preamble. It must be answerable with no special knowledge in about 2 minutes.",
        },
        {
          role: "user",
          content: `Student experience: ${b.experience}. Practicing for: ${b.goal}. Skill they are working on: ${b.focus}. Do not repeat any of these: ${(b.avoid ?? []).slice(0, 6).join(" | ") || "none"}.`,
        },
      ],
      maxTokens: 400,
      temperature: 0.95,
      timeoutMs: 8000,
    });
    return Response.json({ topic: text.replace(/^["'\s]+|["'\s]+$/g, "") });
  } catch (err) {
    return errorResponse(err);
  }
}
