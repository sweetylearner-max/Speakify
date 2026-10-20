import type { BodyMetrics, CoachFeedback, Scores, SpeechMetrics } from "./types";

// iOS: um+ | uh+ | like | you know | basically. Extended with a few classic student fillers.
const FILLER_REGEX = /\b(um+|uh+|er+|ah+|like|you know|basically|actually|literally|i mean|sort of|kind of)\b/gi;
const THANK_YOU_REGEX = /\bthank you\b/i;

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const pct = (v: number) => Math.round(clamp01(v) * 100);

export const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
export const hasThankYou = (text: string) => THANK_YOU_REGEX.test(text);

export function countFillers(text: string): { total: number; byWord: Record<string, number> } {
  const byWord: Record<string, number> = {};
  let total = 0;
  for (const m of text.matchAll(FILLER_REGEX)) {
    const w = m[1].toLowerCase().replace(/^(um)+$/, "um").replace(/^(uh)+$/, "uh");
    byWord[w] = (byWord[w] ?? 0) + 1;
    total++;
  }
  return { total, byWord };
}

export interface RawTiming {
  /** seconds the student was actually in "speaking mode" (audience TTS excluded) */
  activeSec: number;
  /** gaps (sec) between transcript growth events longer than the pause threshold */
  pauses: number[];
}

export function buildSpeechMetrics(transcript: string, timing: RawTiming): SpeechMetrics {
  const words = countWords(transcript);
  const { total, byWord } = countFillers(transcript);
  const minutes = Math.max(timing.activeSec, 1) / 60;
  const pauseTotal = timing.pauses.reduce((a, b) => a + b, 0);
  return {
    durationSec: Math.round(timing.activeSec),
    wordCount: words,
    wpm: Math.round(words / minutes),
    fillerCount: total,
    fillers: byWord,
    pauseCount: timing.pauses.length,
    longestPauseSec: Math.round(Math.max(0, ...timing.pauses) * 10) / 10,
    speakingRatio: clamp01(1 - pauseTotal / Math.max(timing.activeSec, 1)),
  };
}

/** Full score for 120-160 WPM, decaying to 0 at 90 / 190 (same band as the iOS scorer). */
export function wpmBandScore(wpm: number): number {
  if (wpm >= 120 && wpm <= 160) return 1;
  if (wpm < 120) return clamp01((wpm - 90) / 30);
  return 1 - clamp01((wpm - 160) / 30);
}

export const fillersPer100 = (m: SpeechMetrics) => (m.wordCount ? (m.fillerCount / m.wordCount) * 100 : 0);

export interface DeterministicScores {
  clarity: number;
  confidence: number;
  engagement: number;
  bodyLanguage: number | null;
}

export function deterministicScores(m: SpeechMetrics, body: BodyMetrics | null, reactionRatio: number): DeterministicScores {
  const fillerScore = 1 - clamp01(fillersPer100(m) / 8);
  const clarity = 0.6 * wpmBandScore(m.wpm) + 0.4 * fillerScore;

  const pausesPerMin = m.pauseCount / Math.max(m.durationSec / 60, 0.25);
  const steadiness = 1 - clamp01(pausesPerMin / 8);
  const flow = clamp01(m.speakingRatio / 0.85);
  const confidence = body ? 0.4 * body.headStability + 0.3 * steadiness + 0.3 * flow : 0.5 * steadiness + 0.5 * flow;

  const bodyLanguage = body ? 0.4 * body.posture + 0.3 * body.headStability + 0.3 * body.gestures : null;
  return { clarity: clamp01(clarity), confidence: clamp01(confidence), engagement: clamp01(reactionRatio), bodyLanguage };
}

/** Blend measured delivery with Groq's read of the content (50/50) where the AI has a view. */
export function finalScores(d: DeterministicScores, ai: Pick<CoachFeedback, "clarityScore" | "structureScore" | "engagementScore"> | null): Scores {
  const clarity = ai ? 0.5 * d.clarity + 0.5 * (ai.clarityScore / 100) : d.clarity;
  const engagement = ai ? 0.5 * d.engagement + 0.5 * (ai.engagementScore / 100) : d.engagement;
  const parts = [clarity, d.confidence, engagement];
  if (d.bodyLanguage !== null) parts.push(d.bodyLanguage);
  if (ai) parts.push(ai.structureScore / 100);
  const overall = parts.reduce((a, b) => a + b, 0) / parts.length;
  return {
    clarity: pct(clarity),
    confidence: pct(d.confidence),
    engagement: pct(engagement),
    bodyLanguage: d.bodyLanguage === null ? null : pct(d.bodyLanguage),
    overall: pct(overall),
  };
}

/** Audience reaction rule from iOS SessionController.reactToTurn: good pace and few fillers. */
export function isPositiveTurn(turnText: string, turnSeconds: number): boolean {
  const wpm = countWords(turnText) / Math.max(turnSeconds / 60, 0.1);
  return wpm >= 100 && wpm <= 180 && countFillers(turnText).total < 5;
}

/** Deterministic coaching used when Groq is unreachable, built from the iOS recommendation rules. */
export function rulesFeedback(m: SpeechMetrics, d: DeterministicScores): CoachFeedback {
  const strengths: string[] = [];
  const improvements: CoachFeedback["improvements"] = [];
  const nextPractice: CoachFeedback["nextPractice"] = [];

  if (m.wpm >= 120 && m.wpm <= 160) strengths.push(`Your pace of ${m.wpm} words per minute sits in the easy-to-follow range.`);
  if (fillersPer100(m) < 2) strengths.push("You kept filler words very low, which makes you sound prepared.");
  if (m.pauseCount >= 1 && m.pauseCount <= 6) strengths.push("You used natural pauses instead of rushing straight through.");
  if (!strengths.length) strengths.push("You finished your talk. Getting through a full practice round is the hardest first step.");

  if (m.wpm > 160) improvements.push({ issue: `You spoke at ${m.wpm} WPM, which is fast enough that listeners lose the thread.`, fix: "Finish each sentence, breathe, then start the next one. Aim for 130-150 WPM." });
  else if (m.wpm < 120 && m.wordCount > 20) improvements.push({ issue: `Your pace was ${m.wpm} WPM, slower than a natural speaking rhythm.`, fix: "Speak in complete phrases and cut the trailing-off between ideas." });
  if (m.fillerCount > 3) {
    const top = Object.entries(m.fillers).sort((a, b) => b[1] - a[1])[0];
    improvements.push({ issue: `You used ${m.fillerCount} filler words${top ? `, mostly "${top[0]}"` : ""}.`, fix: "Replace each filler with a silent one-beat pause. It sounds more confident." });
  }
  if (m.longestPauseSec > 4) improvements.push({ issue: `There was a ${m.longestPauseSec}s stall in the middle of your talk.`, fix: "Keep a 3-point outline in mind so you always know your next idea." });
  if (!improvements.length) improvements.push({ issue: "Nothing major stands out in the delivery numbers.", fix: "Push on content next: add one concrete example or story." });

  const weakest = d.clarity < d.confidence ? "clarity" : "confidence";
  nextPractice.push(
    weakest === "clarity"
      ? { title: "Slow-and-clear drill", instructions: "Repeat the same topic for 60 seconds, ending every sentence with a full stop and a breath." }
      : { title: "Pause power drill", instructions: "Give the same talk again and insert a deliberate 2-second pause after your main point." },
  );

  return {
    headline: d.clarity > 0.75 ? "Solid delivery. Now sharpen the finish." : "Good start. A few small habits will lift this quickly.",
    clarityScore: Math.round(d.clarity * 100),
    structureScore: 60,
    engagementScore: Math.round(d.engagement * 100),
    strengths,
    improvements,
    nextPractice,
    source: "rules",
  };
}

export const fmtTime = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
