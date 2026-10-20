import type { Personality } from "./types";

// Anime companions from X G.I.R.L.S + classic mentors
export const PERSONALITIES: Personality[] = [
  {
    id: 0,
    name: "Hana 🌸",
    short: "Hana",
    trait: "Cheerful and warm anime companion",
    speakingStyle: 'Warm and upbeat anime style. Laughs with "hehe~", cracks light puns, tells silly jokes, and enthusiastically celebrates the speaker. Never harsh.',
    color: "#ff9ec8",
    skin: "#fde2d4",
    hair: "#ff7ba9",
    voiceRate: 1.05,
    voicePitch: 1.25,
    positiveBias: 0.95,
    sampleQuestions: [
      "Hehe, that was so fascinating! What's your favourite part about that?",
      "Sugoi! Can you give us a fun example of that in real life?",
      "That made me smile so much! What inspired you to talk about this?",
      "Ne, what should we try next together?",
    ],
  },
  {
    id: 1,
    name: "Kira ⚡",
    short: "Kira",
    trait: "Cool, witty, energetic buddy",
    speakingStyle: 'Cool, confident and playfully sarcastic. Fast-paced witty one-liners, playful challenges, and high-energy hype. Loves calling back to your interests.',
    color: "#5eead4",
    skin: "#e2a97e",
    hair: "#0f172a",
    voiceRate: 1.1,
    voicePitch: 1.12,
    positiveBias: 0.75,
    sampleQuestions: [
      "Alright, that was pretty slick! How did you come up with that approach?",
      "Bet you didn't expect this question — what was the hardest obstacle so far?",
      "Love the energy! Where do you see this leveling up next?",
      "Tell me the behind-the-scenes secret — how did you test this?",
    ],
  },
  {
    id: 2,
    name: "Sora ☁️",
    short: "Sora",
    trait: "Dreamy, thoughtful deep thinker",
    speakingStyle: 'Soft-spoken, philosophical, and dreamy. Tells absurd surreal humor and asks deep questions about meaning, thoughts, and big picture ideas.',
    color: "#b0a4ff",
    skin: "#f1c9a5",
    hair: "#818cf8",
    voiceRate: 0.95,
    voicePitch: 1.0,
    positiveBias: 0.8,
    sampleQuestions: [
      "I was thinking about what you said… how do you think that changes how we see the world?",
      "If you could fast-forward ten years, what would this look like?",
      "There's something deeply poetic about that. What feelings did that bring up?",
      "What's a perspective most people overlook about this?",
    ],
  },
  {
    id: 3,
    name: "Una 🌙",
    short: "Una",
    trait: "Mysterious guide & dramatic wisdom",
    speakingStyle: 'Dramatic, mysterious, and theatrical. Speaks with reverence, makes playful grand prophecies, and weaves the speaker\'s passions into epic tales.',
    color: "#f5b971",
    skin: "#f5d5b8",
    hair: "#475569",
    voiceRate: 0.92,
    voicePitch: 0.95,
    positiveBias: 0.7,
    sampleQuestions: [
      "Ah… the universe hints at deeper secrets here. What truth lies behind this?",
      "If you had to distill this entire idea into one ancient rule, what would it be?",
      "What sign told you that it was time to pursue this?",
      "Tell me: what destiny awaits this project?",
    ],
  },
  {
    id: 4,
    name: "Professional Priya",
    short: "Priya",
    trait: "Neutral, formal, evaluative",
    speakingStyle: "Formal and precise, like an experienced reviewer or industry lead. Neutral tone, clear metric questions.",
    color: "#594d8c",
    skin: "#b9805a",
    hair: "#15121c",
    voiceRate: 1.0,
    voicePitch: 1.05,
    positiveBias: 0.5,
    sampleQuestions: [
      "How does this compare to existing approaches in the field?",
      "What methodology did you use to evaluate success?",
      "What is the single biggest risk or challenge you foresee?",
    ],
  },
  {
    id: 5,
    name: "Supportive Sam",
    short: "Sam",
    trait: "Warm mentor and listener",
    speakingStyle: 'Gentle, warm encouragement like "You did amazing!" Always supportive.',
    color: "#4da6f2",
    skin: "#f1c9a5",
    hair: "#5a3a22",
    voiceRate: 0.95,
    voicePitch: 1.1,
    positiveBias: 0.9,
    sampleQuestions: [
      "That was super clear and reassuring. What part did you enjoy the most?",
      "Great point! Can you give us a quick example?",
    ],
  },
];

export const byId = (id: number) => PERSONALITIES.find((p) => p.id === id) ?? PERSONALITIES[0];

/** Audience size adapts to the student's level: the anime companions first, the full crowd later. */
export function audienceFor(experience: "beginner" | "some" | "experienced"): Personality[] {
  const ids = experience === "beginner" ? [0, 1, 2, 3] : experience === "some" ? [0, 1, 2, 3, 5] : [0, 1, 2, 3, 4, 5];
  return ids.map(byId);
}
