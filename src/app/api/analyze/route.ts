import { CHAT_MODEL, REPORT_MODEL, GroqError, errorResponse, groqChat } from "@/lib/groq";
import type { AnalyzeRequest, CoachFeedback } from "@/lib/types";

export const runtime = "nodejs";

const GOAL_TEXT = {
  class: "class presentations and discussions",
  interview: "job/internship interviews",
  speech: "formal speeches and competitions",
  confidence: "general speaking confidence",
} as const;

const FOCUS_TEXT = {
  fillers: "cutting filler words",
  pace: "controlling speaking pace",
  nerves: "managing nerves",
  structure: "organizing ideas clearly",
  eyecontact: "eye contact and presence",
} as const;

const SYSTEM = `You are Speakify's public speaking coach for students. You receive a speech transcript (produced by browser speech recognition, so it may have small errors and no punctuation) plus measured delivery metrics.

Rules:
- The measured metrics (WPM, filler counts, pauses, duration) are ground truth. Never recompute or contradict them. You interpret them and judge the CONTENT.
- Be specific and actionable. Quote or paraphrase actual moments from the transcript. Never say generic things like "improve your confidence".
- Coach the student by first name, in a warm but honest tone. Fit the advice to their experience level, goal and current focus area.
- If previous results are provided, mention real progress or regression against them.
- Score honestly on 0-100. A short or rambling talk should not score above 70.
- Respond with ONLY a JSON object, no markdown, in exactly this shape:
{
  "headline": "one sentence summary of this attempt, addressed to the student",
  "clarityScore": 0-100 (how clearly the message and ideas come across),
  "structureScore": 0-100 (opening, logical order, conclusion),
  "engagementScore": 0-100 (examples, stories, energy, connection to audience),
  "strengths": ["2-3 specific things done well, referencing the transcript"],
  "improvements": [{"issue": "specific problem observed", "fix": "concrete action to fix it next time"}] (2-3 items),
  "nextPractice": [{"title": "short drill name", "instructions": "1-2 sentence exercise for the next attempt"}] (1-2 items)
}`;

function clampScore(v: unknown, fallback = 60) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback;
}

const strArr = (v: unknown, max: number) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, max) : [];

function normalize(raw: unknown): CoachFeedback {
  const r = (raw ?? {}) as Record<string, unknown>;
  const improvements = (Array.isArray(r.improvements) ? r.improvements : [])
    .map((i) => i as Record<string, unknown>)
    .filter((i) => typeof i?.issue === "string" && typeof i?.fix === "string")
    .slice(0, 3)
    .map((i) => ({ issue: String(i.issue), fix: String(i.fix) }));
  const nextPractice = (Array.isArray(r.nextPractice) ? r.nextPractice : [])
    .map((i) => i as Record<string, unknown>)
    .filter((i) => typeof i?.title === "string" && typeof i?.instructions === "string")
    .slice(0, 2)
    .map((i) => ({ title: String(i.title), instructions: String(i.instructions) }));
  const strengths = strArr(r.strengths, 3);
  if (!strengths.length || !improvements.length || !nextPractice.length) {
    throw new GroqError("bad_response", "Groq's feedback was incomplete.", 502);
  }
  return {
    headline: typeof r.headline === "string" ? r.headline : "Here's your coaching for this attempt.",
    clarityScore: clampScore(r.clarityScore),
    structureScore: clampScore(r.structureScore),
    engagementScore: clampScore(r.engagementScore),
    strengths,
    improvements,
    nextPractice,
    source: "groq",
  };
}

function buildUserPrompt(b: AnalyzeRequest) {
  const modeText = {
    public: "Public Session: a speech to a virtual audience, followed by audience Q&A",
    discuss: "Discuss Session: a free one-on-one conversation",
    challenge: "2-Minute Challenge: an impromptu talk on a random topic after 1 minute of prep",
    debate: "Debate Session: defending positions against a skeptical opponent",
  }[b.mode];
  const m = b.metrics;
  return JSON.stringify(
    {
      student: {
        firstName: b.profile.name,
        experience: b.profile.experience,
        goal: GOAL_TEXT[b.profile.goal],
        selfRatedNervousness: `${b.profile.nerves}/5`,
        currentFocus: FOCUS_TEXT[b.profile.focus],
      },
      session: { type: modeText, topic: b.topic || "free choice" },
      measured: {
        durationSeconds: m.durationSec,
        words: m.wordCount,
        wordsPerMinute: m.wpm,
        idealWpmRange: "120-160",
        fillerWordCount: m.fillerCount,
        fillerBreakdown: m.fillers,
        pausesOver1500ms: m.pauseCount,
        longestPauseSeconds: m.longestPauseSec,
        camera: b.body
          ? { posture: b.body.posture, headStability: b.body.headStability, gestureActivity: b.body.gestures }
          : "not used",
        audienceReactionPositiveRatio: Math.round(b.reactionRatio * 100) / 100,
      },
      audienceQuestions: b.qa.map((q) => `${q.member}: ${q.question}`),
      previousSessions: b.previous.slice(0, 3),
      transcript: b.transcript.slice(-6000),
    },
    null,
    1,
  );
}

function validate(b: unknown): b is AnalyzeRequest {
  const r = b as AnalyzeRequest;
  return (
    !!r &&
    typeof r.transcript === "string" &&
    !!r.metrics &&
    typeof r.metrics.wpm === "number" &&
    !!r.profile &&
    typeof r.profile.name === "string" &&
    Array.isArray(r.previous) &&
    Array.isArray(r.qa)
  );
}

function parseJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new GroqError("bad_response", "Groq did not return JSON.", 502);
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new GroqError("bad_response", "Groq returned malformed JSON.", 502);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!validate(body)) return Response.json({ error: "bad_request", message: "Missing fields." }, { status: 400 });
    if (body.metrics.wordCount < 8) {
      return Response.json({ error: "empty", message: "Not enough speech to analyze." }, { status: 422 });
    }
    const messages = [
      { role: "system" as const, content: SYSTEM },
      { role: "user" as const, content: buildUserPrompt(body) },
    ];
    let text: string;
    try {
      text = await groqChat({ model: REPORT_MODEL, messages, json: true, maxTokens: 1400, temperature: 0.5 });
    } catch (e) {
      // Model-specific failures (not auth/rate-limit) fall back to the fast chat model
      if (e instanceof GroqError && (e.code === "bad_response" || e.code === "network")) {
        text = await groqChat({ model: CHAT_MODEL, messages, json: true, maxTokens: 1200, temperature: 0.5 });
      } else throw e;
    }
    return Response.json({ feedback: normalize(parseJson(text)) });
  } catch (err) {
    return errorResponse(err);
  }
}
