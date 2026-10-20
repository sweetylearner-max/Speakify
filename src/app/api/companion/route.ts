import { groqChat, errorResponse, CHAT_MODEL } from "@/lib/groq";
import { NextRequest } from "next/server";

export interface CompanionRequest {
  companionId: string;
  persona: string;
  userName: string | null;
  userMessage: string;
  history: { role: "user" | "companion"; text: string }[];
  topInterests: string[];
  sessionCount: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CompanionRequest;
    const {
      persona,
      userName,
      userMessage,
      history,
      topInterests,
      sessionCount,
    } = body;

    const name = userName ?? "friend";
    const interests =
      topInterests.length > 0
        ? `Things ${name} cares about & enjoys (weave these in naturally): ${topInterests.join(", ")}.`
        : `You don't know many specific interests about ${name} yet — be curious and ask what they like!`;

    const isGreeting = userMessage.startsWith("__GREET");

    const context =
      sessionCount <= 1
        ? `This is your first or second conversation with ${name}. Introduce yourself warmly, be playful, and make them feel right at home.`
        : `You have had ${sessionCount} conversations with ${name}. Treat them like a valued, familiar friend. Call back to their interests naturally.`;

    const systemPrompt = `${persona}

ROLE & PERSONALITY RULES:
- Keep replies conversational and concise (2-4 punchy sentences max). No long essays!
- ${context}
- ${interests}
- CRACK JOKES & HAVE FUN: Tell witty puns, tease playfully, or share funny anime/daily life jokes when appropriate.
- BE A SAFE, PERSONALIZED SPACE: Make ${name} comfortable speaking freely without fear of judgment.
- ACTIVE LISTENER: If the user mentions hobbies, feelings, dreams, or favorite things, celebrate it warmly and remember it!
- FORMAT: Output only natural speech. Never output markdown asterisks for actions like *waves*, no bullet points, no numbered lists.`;

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];

    // Add recent history (up to last 8 exchanges)
    const recent = history.slice(-8);
    for (const turn of recent) {
      messages.push({
        role: turn.role === "user" ? "user" : "assistant",
        content: turn.text,
      });
    }

    // Add current message (transforming internal greeting tokens)
    let promptMessage = userMessage;
    if (userMessage.startsWith("__GREET_NEW_USER__")) {
      promptMessage = `(User just joined for the first time. Greet ${name} warmly with your signature anime greeting, introduce who you are, and ask how they're doing today!)`;
    } else if (userMessage.startsWith("__GREET_RETURNING_USER__")) {
      promptMessage = `(User ${name} just returned! Welcome them back warmly and enthusiastically, maybe mentioning something you're excited to chat about!)`;
    }

    messages.push({ role: "user", content: promptMessage });

    const reply = await groqChat({
      model: CHAT_MODEL,
      messages,
      maxTokens: 220,
      temperature: 0.85,
    });

    // Extract topics the user mentioned for interest learning (only on real user messages)
    let detectedTopics: string[] = [];
    if (!isGreeting && userMessage.trim().length > 3) {
      const topicsPrompt = `Analyze this user chat message: "${userMessage}"
Extract any concrete topics, hobbies, games, foods, media, passions, or interests mentioned (e.g. "cooking", "minecraft", "piano", "cats", "ai").
Return ONLY a valid JSON array of lowercase strings (max 3 items), like ["cats", "gaming"].
If no specific interests, hobbies or favorite things are mentioned, return [].`;

      try {
        const raw = await groqChat({
          model: CHAT_MODEL,
          messages: [{ role: "user", content: topicsPrompt }],
          maxTokens: 60,
          temperature: 0.1,
          json: true,
        });
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          detectedTopics = parsed.filter((x) => typeof x === "string").slice(0, 3);
        } else if (parsed.topics && Array.isArray(parsed.topics)) {
          detectedTopics = parsed.topics.filter((x: unknown) => typeof x === "string").slice(0, 3);
        }
      } catch {
        /* best-effort topic extraction */
      }
    }

    return Response.json({ reply, detectedTopics });
  } catch (err) {
    return errorResponse(err);
  }
}
