import type { Goal } from "./types";

// Ported from SpeakifyAR/Performance/ImpromptuTopics.swift
export const IMPROMPTU_TOPICS: string[] = [
  "Describe your perfect weekend.",
  "What's a skill everyone should learn?",
  "Talk about a time you overcame a challenge.",
  "If you could have dinner with anyone, who would it be and why?",
  "What does success mean to you?",
  "Describe your dream job.",
  "What's the best advice you've ever received?",
  "Talk about a book or movie that changed your perspective.",
  "What's one habit that changed your life?",
  "Describe a place you'd love to visit.",
  "What's something you're genuinely passionate about?",
  "Talk about a mentor who influenced you.",
  "What does leadership mean to you?",
  "Describe a moment you felt proud of yourself.",
  "What's a lesson failure has taught you?",
  "Talk about why teamwork matters.",
  "What's your favorite way to spend free time?",
  "Describe a piece of technology that excites you.",
  "What's a tradition you value?",
  "Talk about a goal you're working toward right now.",
  "What makes a good friend?",
  "Describe your ideal morning routine.",
  "What's one change you'd make in your community?",
  "Talk about something you learned recently.",
  "What does creativity mean to you?",
  "Describe a challenge facing your generation.",
  "What's a small thing that makes you happy?",
  "Talk about a risk that paid off for you.",
];

// Extra prompts matched to the student's stated goal
export const GOAL_TOPICS: Record<Goal, string[]> = {
  class: [
    "Explain a concept you learned this week as if teaching a classmate.",
    "Argue whether homework helps or hurts learning.",
    "Present one idea from a class you'd want everyone to remember.",
    "Should schools start later in the day? Make your case.",
  ],
  interview: [
    "Tell me about yourself in a way that fits a job or internship interview.",
    "Describe a time you worked in a team and something went wrong.",
    "Why should someone pick you for a role you really want?",
    "Tell me about your biggest strength and a weakness you're working on.",
  ],
  speech: [
    "Persuade people to care about something you believe in.",
    "Deliver a short toast for a friend's big achievement.",
    "Give an opening statement for a student election campaign.",
    "Inspire your audience to try something new this month.",
  ],
  confidence: [
    "Introduce yourself to a room of strangers.",
    "Talk about something you're proud of, without downplaying it.",
    "Describe a fear you've faced and what it taught you.",
    "Tell the room one thing most people don't know about you.",
  ],
};

export function pickTopic(goal: Goal, avoid?: string): string {
  const pool = [...IMPROMPTU_TOPICS, ...GOAL_TOPICS[goal], ...GOAL_TOPICS[goal]].filter((t) => t !== avoid);
  return pool[Math.floor(Math.random() * pool.length)];
}
