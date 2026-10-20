import type { Focus, Profile, SessionMode, SessionRecord } from "./types";

export const MODE_INFO: Record<SessionMode, { title: string; blurb: string; accent: string }> = {
  public: { title: "Public Session", blurb: "Give a talk to a full audience. They react as you speak, then ask real questions.", accent: "#6366f1" },
  challenge: { title: "2-Minute Challenge", blurb: "A random topic, 1 minute to prepare, 2 minutes to speak. The classic impromptu drill.", accent: "#f97316" },
  discuss: { title: "Discuss Session", blurb: "A relaxed one-on-one conversation. Great for warming up or building confidence.", accent: "#14b8a6" },
  debate: { title: "Debate Session", blurb: "A sceptical opponent pushes back on every point. Learn to hold your ground.", accent: "#ef4444" },
};

type Metric = "clarity" | "confidence" | "engagement" | "bodyLanguage";
export const METRIC_LABEL: Record<Metric, string> = {
  clarity: "Clarity",
  confidence: "Confidence",
  engagement: "Engagement",
  bodyLanguage: "Body language",
};

const METRIC_ADVICE: Record<Metric, { mode: SessionMode; why: string }> = {
  clarity: { mode: "challenge", why: "Your clarity (pace and filler words) is your lowest area. Short impromptu talks train it fastest." },
  confidence: { mode: "discuss", why: "Confidence is your lowest area. A low-pressure conversation builds flow without an audience staring at you." },
  engagement: { mode: "public", why: "Audience engagement is your lowest area. Practice with the full crowd and answer their questions." },
  bodyLanguage: { mode: "public", why: "Body language is your lowest area. Turn the camera on and practice standing tall with open gestures." },
};

const FOCUS_START: Record<Focus, { mode: SessionMode; why: string }> = {
  nerves: { mode: "discuss", why: "You said nerves are the hard part, so start with a friendly one-on-one conversation." },
  fillers: { mode: "challenge", why: "You want to cut filler words. A 2-minute challenge gives you a clean baseline." },
  pace: { mode: "challenge", why: "You want to control your pace. A timed 2-minute talk shows your real words per minute." },
  structure: { mode: "public", why: "You want clearer structure. Give a short talk and let the audience test it with questions." },
  eyecontact: { mode: "public", why: "You want stronger presence. Turn the camera on during a public session." },
};

export function average(nums: number[]) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

export function weakestMetric(sessions: SessionRecord[]): Metric | null {
  const recent = sessions.slice(0, 3);
  if (!recent.length) return null;
  const metrics: Metric[] = ["clarity", "confidence", "engagement", "bodyLanguage"];
  let worst: { m: Metric; v: number } | null = null;
  for (const m of metrics) {
    const vals = recent.map((s) => s.scores[m]).filter((v): v is number => v !== null);
    if (!vals.length) continue;
    const v = average(vals);
    if (!worst || v < worst.v) worst = { m, v };
  }
  return worst?.m ?? null;
}

export function recommend(profile: Profile, sessions: SessionRecord[]) {
  const weak = weakestMetric(sessions);
  if (!weak) return { ...FOCUS_START[profile.focus], focusLabel: null as string | null };
  const base = METRIC_ADVICE[weak];
  const last = sessions[0];
  const drill = last?.feedback.nextPractice[0];
  return {
    mode: base.mode,
    why: drill ? `${base.why} Last coaching drill: ${drill.title}.` : base.why,
    focusLabel: METRIC_LABEL[weak],
  };
}

export function fillerTotals(sessions: SessionRecord[]) {
  const totals: Record<string, number> = {};
  for (const s of sessions) for (const [w, n] of Object.entries(s.metrics.fillers)) totals[w] = (totals[w] ?? 0) + n;
  return Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 5);
}

export function totalSpeakingSeconds(sessions: SessionRecord[]) {
  return sessions.reduce((a, s) => a + s.metrics.durationSec, 0);
}

export function improvement(sessions: SessionRecord[]) {
  if (sessions.length < 2) return null;
  return sessions[0].scores.overall - sessions[1].scores.overall;
}

export function greeting(name: string) {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return `${part}, ${name}`;
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
