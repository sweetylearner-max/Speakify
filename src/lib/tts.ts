"use client";
import type { Personality } from "./types";
import { voiceBus } from "./voiceBus";

let voicesCache: SpeechSynthesisVoice[] = [];

function loadVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  if (!voicesCache.length) {
    voicesCache = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
  }
  return voicesCache;
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    voicesCache = [];
    loadVoices();
  };
}

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

/** Rough length of a spoken line, used when TTS is unavailable so the flow keeps its rhythm */
export const estimateSeconds = (text: string) => Math.max(1.5, text.split(/\s+/).length / 2.6);

function voiceFor(p: Personality): SpeechSynthesisVoice | undefined {
  const voices = loadVoices();
  if (!voices.length) return undefined;
  const preferred = voices.filter((v) => /female|zira|samantha|aria|jenny|google uk english female|google us english/i.test(v.name));
  const pool = preferred.length >= 3 ? preferred : voices;
  return pool[p.id % pool.length];
}

/** Speak a line in a personality's voice. Resolves when finished (or after a safety timeout). */
export function speak(text: string, p: Personality): Promise<void> {
  if (!canSpeak()) return new Promise((r) => setTimeout(r, estimateSeconds(text) * 1000));
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = voiceFor(p);
    if (v) u.voice = v;
    u.rate = p.voiceRate;
    u.pitch = p.voicePitch;
    let done = false;
    let wobble: ReturnType<typeof setInterval> | null = null;

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (wobble) clearInterval(wobble);
      voiceBus.speaking = false;
      voiceBus.level = 0;
      resolve();
    };

    const timer = setTimeout(finish, estimateSeconds(text) * 1000 + 4000);

    u.onstart = () => {
      voiceBus.speaking = true;
      voiceBus.level = 0.6;
      let phase = 0;
      wobble = setInterval(() => {
        phase += 0.35;
        // Natural speech modulation wave
        const amp = 0.25 + 0.45 * Math.abs(Math.sin(phase) * Math.cos(phase * 0.7));
        voiceBus.level = Math.min(1, amp + Math.random() * 0.2);
      }, 60);
    };

    u.onboundary = (event: SpeechSynthesisEvent) => {
      // Pulse voice level on word boundaries for tight lip sync
      voiceBus.speaking = true;
      voiceBus.level = 0.75 + Math.random() * 0.25;
    };

    u.onend = finish;
    u.onerror = finish;
    synth.speak(u);
  });
}

export const stopSpeaking = () => {
  if (canSpeak()) window.speechSynthesis.cancel();
  voiceBus.speaking = false;
  voiceBus.level = 0;
};
