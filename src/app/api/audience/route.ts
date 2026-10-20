import { CHAT_MODEL, errorResponse, groqChat } from "@/lib/groq";
import { byId } from "@/lib/personalities";

export const runtime = "nodejs";

interface Body {
  kind: "question" | "comment" | "interject" | "greeting" | "reply";
  personalityId: number;
  context?: string;
  avoiding?: string[];
  history?: { isUser: boolean; text: string }[];
  isDebate?: boolean;
  topic?: string;
  latest?: string;
  speaker?: string;
  allowQuestion?: boolean;
}

function instructions(id: number) {
  const p = byId(id);
  return `You play ${p.name} at a live presentation.
Personality: ${p.trait}
How you talk: ${p.speakingStyle}

Rules:
- Talk like a real person in a live conversation, in one or two short sentences. Do not interrogate people: mostly share reactions, opinions and reasons, and only rarely ask something.
- Stay fully in character. Never mention being an AI.
- Only reference things actually said to you. Never invent facts, names, or numbers.`;
}

function build(b: Body) {
  const sys = instructions(b.personalityId);
  if (b.kind === "greeting") {
    const task = b.isDebate
      ? "Task: open a debate with the person facing you. Introduce yourself by first name and tell them to state their position. Under 15 words. Greeting only, no preamble, no quotes."
      : "Task: greet the person who just walked up to talk with you one-on-one. Introduce yourself by first name and invite them to talk. Under 15 words. Greeting only, no preamble, no quotes.";
    return [{ role: "system" as const, content: sys }, { role: "user" as const, content: task }];
  }

  const who = b.speaker ? `The speaker's first name is ${b.speaker}; use it only occasionally, naturally.` : "";
  if (b.kind === "interject") {
    const prompt = `You are listening to a live talk${b.topic ? ` about: ${b.topic}` : ""} and cannot help reacting out loud. ${who}
What the speaker just said: "${(b.latest ?? "").slice(0, 500)}"
Earlier in the talk: "${(b.context ?? "").slice(-800)}"

React in ONE short sentence, under 18 words, in character. Agree, disagree with a specific reason, or make a personal remark that shows you were listening (if they said something negative or doubtful, say why they may be wrong). Do NOT ask a question. No preamble, no quotes.`;
    return [{ role: "system" as const, content: sys }, { role: "user" as const, content: prompt }];
  }
  if (b.kind === "comment") {
    const prompt = `The speaker${b.topic ? ` (talk: ${b.topic})` : ""} just answered: "${(b.latest ?? "").slice(0, 600)}"
${who}
Respond in one or two short sentences, in character, like a real person: say what you agree or disagree with and why, or what it made you think. Be specific to their words. Do NOT ask a question. Under 30 words. No preamble, no quotes.`;
    return [{ role: "system" as const, content: sys }, { role: "user" as const, content: prompt }];
  }
  if (b.kind === "question") {
    const avoid = b.avoiding?.length
      ? `\nQuestions already asked this session - do NOT ask any of these again, or anything that means the same thing: ${b.avoiding.map((q) => `"${q}"`).join(", ")}.`
      : "";
    const prompt = `Transcript of the presentation you just watched${b.topic ? ` (topic: ${b.topic})` : ""}:
"${(b.context ?? "").slice(-3000)}"
${b.latest ? `
What the speaker said most recently (respond to THIS first): "${b.latest.slice(0, 600)}"
` : ""}${avoid}

Task: respond like a real person in the room, in character, in two short sentences:
1. FIRST react to what they actually said. If it was negative, self-doubting, one-sided, or questionable, say specifically why they might be wrong (a real reason or counter-example). If it was strong, say what landed for you.
2. THEN ask ONE pointed follow-up question about a specific thing they said, different from earlier questions. ${who}
Never be generic ("tell me more"). Under 40 words total. No preamble, no quotes.`;
    return [{ role: "system" as const, content: sys }, { role: "user" as const, content: prompt }];
  }

  const task = b.isDebate
    ? `Reply with ONE short, pointed rebuttal to what they just said - like a cross-examiner or a jury member who is not convinced yet. Name the specific weak point, demand they justify it, or raise a real counter-example. Do NOT agree, do NOT compliment, do NOT summarize - push back every time, even if their last point was reasonable, find the angle it doesn't cover. Under 20 words. Reply only, no preamble, no quotes.`
    : `Reply like a real person: respond directly to what they just said. If it was negative, self-critical or doubtful, push back kindly with a specific reason they might be wrong; if it was a good point, say what landed. ${b.allowQuestion ? "You may end with one short question." : "Do NOT ask a question; share your view or a relevant thought instead."} Not a summary. Under 35 words. Reply only, no preamble, no quotes.`;
  const turns = (b.history ?? []).slice(-8).map((t) => ({
    role: (t.isUser ? "user" : "assistant") as "user" | "assistant",
    content: t.text.slice(0, 800),
  }));
  return [{ role: "system" as const, content: `${sys}\n\n${task}` }, ...turns];
}

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as Body;
    if (!b || !["question", "comment", "interject", "greeting", "reply"].includes(b.kind) || typeof b.personalityId !== "number") {
      return Response.json({ error: "bad_request", message: "Bad request." }, { status: 400 });
    }
    const text = await groqChat({
      model: CHAT_MODEL,
      messages: build(b),
      maxTokens: 400,
      temperature: 0.7,
      timeoutMs: 9000,
    });
    return Response.json({ text: text.replace(/^["'\s]+|["'\s]+$/g, "") });
  } catch (err) {
    return errorResponse(err);
  }
}
