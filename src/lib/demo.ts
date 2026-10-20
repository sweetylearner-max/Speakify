import { addSession, getSessions } from "./storage";
import { uid } from "./insights";
import type { SessionRecord } from "./types";

const DAY = 86_400_000;

/** Clearly-labelled sample history so the dashboard can be previewed before a first real session. */
export function addDemoHistory() {
  if (getSessions().length) return;
  const rows: { overall: number; clarity: number; confidence: number; engagement: number; wpm: number; fillers: number; mode: SessionRecord["mode"]; topic: string; ago: number }[] = [
    { overall: 52, clarity: 48, confidence: 55, engagement: 50, wpm: 188, fillers: 14, mode: "challenge", topic: "What's a skill everyone should learn?", ago: 6 },
    { overall: 58, clarity: 55, confidence: 58, engagement: 60, wpm: 176, fillers: 11, mode: "discuss", topic: "", ago: 5 },
    { overall: 63, clarity: 62, confidence: 63, engagement: 64, wpm: 166, fillers: 9, mode: "challenge", topic: "Describe your dream job.", ago: 3 },
    { overall: 69, clarity: 70, confidence: 66, engagement: 72, wpm: 154, fillers: 6, mode: "public", topic: "Why teamwork matters", ago: 1 },
  ];
  for (const r of rows) {
    const words = Math.round((r.wpm * 100) / 60);
    addSession({
      id: uid(),
      createdAt: Date.now() - r.ago * DAY,
      mode: r.mode,
      topic: r.topic,
      transcript: "(sample data)",
      metrics: {
        durationSec: 100, wordCount: words, wpm: r.wpm, fillerCount: r.fillers,
        fillers: { um: Math.ceil(r.fillers * 0.5), like: Math.floor(r.fillers * 0.35), "you know": Math.floor(r.fillers * 0.15) },
        pauseCount: 3, longestPauseSec: 2.4, speakingRatio: 0.85,
      },
      body: null,
      scores: { overall: r.overall, clarity: r.clarity, confidence: r.confidence, engagement: r.engagement, bodyLanguage: null },
      reactionRatio: r.engagement / 100,
      qa: [],
      feedback: {
        headline: "Sample session",
        clarityScore: r.clarity, structureScore: r.overall, engagementScore: r.engagement,
        strengths: ["Sample data for previewing the dashboard."],
        improvements: [{ issue: "This is sample data, not a real session.", fix: "Do a real practice to replace it." }],
        nextPractice: [{ title: "Slow-and-clear drill", instructions: "Repeat a topic for 60 seconds, breathing between sentences." }],
        source: "rules",
      },
    });
  }
}
