export type Experience = "beginner" | "some" | "experienced";
export type Goal = "class" | "interview" | "speech" | "confidence";
export type Focus = "fillers" | "pace" | "nerves" | "structure" | "eyecontact";

export interface Profile {
  name: string;
  experience: Experience;
  goal: Goal;
  nerves: 1 | 2 | 3 | 4 | 5;
  focus: Focus;
  createdAt: number;
}

export type SessionMode = "public" | "discuss" | "challenge" | "debate";

export interface Personality {
  id: number;
  name: string;
  short: string;
  trait: string;
  speakingStyle: string;
  color: string;
  skin: string;
  hair: string;
  voiceRate: number;
  voicePitch: number;
  positiveBias: number;
  sampleQuestions: string[];
}

export interface SpeechMetrics {
  durationSec: number;
  wordCount: number;
  wpm: number;
  fillerCount: number;
  fillers: Record<string, number>;
  pauseCount: number;
  longestPauseSec: number;
  speakingRatio: number;
}

export interface BodyMetrics {
  posture: number;
  headStability: number;
  gestures: number;
  framesSeen: number;
}

export interface Scores {
  confidence: number;
  clarity: number;
  engagement: number;
  bodyLanguage: number | null;
  overall: number;
}

export interface CoachFeedback {
  headline: string;
  clarityScore: number;
  structureScore: number;
  engagementScore: number;
  strengths: string[];
  improvements: { issue: string; fix: string }[];
  nextPractice: { title: string; instructions: string }[];
  source: "groq" | "rules";
}

export interface QAEntry {
  member: string;
  question: string;
}

export interface SessionRecord {
  id: string;
  createdAt: number;
  mode: SessionMode;
  topic: string;
  transcript: string;
  metrics: SpeechMetrics;
  body: BodyMetrics | null;
  scores: Scores;
  reactionRatio: number;
  qa: QAEntry[];
  feedback: CoachFeedback;
}

export interface AnalyzeRequest {
  mode: SessionMode;
  topic: string;
  transcript: string;
  metrics: SpeechMetrics;
  body: BodyMetrics | null;
  reactionRatio: number;
  profile: Pick<Profile, "name" | "experience" | "goal" | "nerves" | "focus">;
  previous: { overall: number; wpm: number; fillerCount: number; createdAt: number }[];
  qa: QAEntry[];
}
