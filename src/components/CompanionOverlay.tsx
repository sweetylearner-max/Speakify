"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { Mood } from "@/components/VrmAvatar";
import type { Personality, SessionRecord } from "@/lib/types";
import {
  COMPANIONS,
  COMPANION_LIST,
  type CompanionCharacter,
  type CompanionId,
} from "@/lib/companions";
import {
  loadInterests,
  saveInterests,
  boostInterest,
  topInterests,
  type InterestProfile,
} from "@/lib/companionStorage";
import { speak, stopSpeaking } from "@/lib/tts";

const VrmAvatar = dynamic(() => import("@/components/VrmAvatar"), { ssr: false });

function toPersonality(c: CompanionCharacter, idx = 0): Personality {
  return {
    id: idx,
    name: c.name,
    short: c.name,
    trait: c.role,
    speakingStyle: c.persona,
    color: c.accent,
    skin: "#e2a97e",
    hair: "#1f1a17",
    voiceRate: c.voiceRate,
    voicePitch: c.voicePitch,
    positiveBias: 0.85,
    sampleQuestions: [],
  };
}

interface CompanionOverlayProps {
  userName: string;
  sessions: SessionRecord[];
}

export default function CompanionOverlay({ userName, sessions }: CompanionOverlayProps) {
  const [minimized, setMinimized] = useState(false);
  const [interests, setInterests] = useState<InterestProfile>(loadInterests);
  const [companionId, setCompanionId] = useState<CompanionId>(() => {
    const saved = loadInterests().preferredCompanionId;
    return (saved as CompanionId | null) ?? "hana";
  });
  const companion = COMPANIONS[companionId] ?? COMPANIONS.hana;

  const [mood, setMood] = useState<Mood>("happy");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [speechBubble, setSpeechBubble] = useState<string>("");

  const recognitionRef = useRef<any>(null);

  // Generate dynamic contextual greeting based on dashboard metrics
  useEffect(() => {
    const tops = topInterests(interests);
    const topInterest = tops[0] ? ` Still thinking about ${tops[0]}?` : "";
    if (sessions.length === 0) {
      setSpeechBubble(
        `Hi ${userName}! I'm ${companion.name}. Ready to take your first speaking step together? ${companion.emoji}`
      );
    } else {
      const best = sessions.reduce((m, s) => Math.max(m, s.scores.overall), 0);
      setSpeechBubble(
        `Welcome back ${userName}! Your best score is ${best}.${topInterest} Let's have a great session! ✨`
      );
    }
  }, [companion, companionId, userName, sessions, interests]);

  // Speech recognition for mic voice chat
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
      const recog = new SpeechRecognition();
      recog.continuous = false;
      recog.interimResults = true;
      recog.lang = "en-US";

      recog.onstart = () => setIsListening(true);
      recog.onresult = (e: any) => {
        let transcript = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          transcript += e.results[i][0].transcript;
        }
        setInput(transcript);
      };
      recog.onerror = () => setIsListening(false);
      recog.onend = () => setIsListening(false);

      recognitionRef.current = recog;
    } catch {
      /* not supported */
    }

    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const toggleMic = () => {
    if (!recognitionRef.current) {
      alert("Microphone recognition is not supported in this browser.");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      stopSpeaking();
      try {
        recognitionRef.current.start();
      } catch {
        recognitionRef.current.stop();
      }
    }
  };

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() || busy) return;
      setBusy(true);
      stopSpeaking();
      setInput("");
      setMood("thinking");
      setSpeechBubble("Thinking…");

      const tops = topInterests(interests);

      try {
        const res = await fetch("/api/companion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companionId,
            persona: companion.persona,
            userName,
            userMessage: text,
            history: interests.recentExchanges.slice(-4),
            topInterests: tops,
            sessionCount: interests.sessionCount,
          }),
        });

        const data = (await res.json()) as { reply: string; detectedTopics: string[] };
        const reply = data.reply ?? `I'm cheering for you, ${userName}!`;

        setSpeechBubble(reply);
        setMood("happy");

        // Learn interests
        const updated = { ...interests };
        for (const t of data.detectedTopics ?? []) boostInterest(updated, t, 1);
        updated.recentExchanges = [
          ...interests.recentExchanges,
          { role: "user", text },
          { role: "companion", text: reply },
        ];
        saveInterests(updated);
        setInterests(updated);

        setIsSpeaking(true);
        await speak(reply, toPersonality(companion));
      } catch {
        setSpeechBubble(`Oops, got a little tongue-tied! But I'm always cheering for you~`);
      } finally {
        setIsSpeaking(false);
        setMood("neutral");
        setBusy(false);
      }
    },
    [busy, companion, companionId, interests, userName]
  );

  const switchCompanion = (id: CompanionId) => {
    stopSpeaking();
    setCompanionId(id);
    const updated = { ...interests, preferredCompanionId: id };
    saveInterests(updated);
    setInterests(updated);
  };

  /* ─── MINIMIZED FLOATING BADGE ─── */
  if (minimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3">
        <div
          onClick={() => setMinimized(false)}
          className="cursor-pointer rounded-2xl bg-black/80 px-4 py-2.5 text-xs text-white/90 backdrop-blur border border-white/20 shadow-2xl transition hover:scale-105 flex items-center gap-2 max-w-xs truncate"
          style={{ borderColor: `${companion.accent}66` }}
        >
          <span className="text-xl">{companion.emoji}</span>
          <span className="truncate">{speechBubble || `Chat with ${companion.name}`}</span>
        </div>
        <button
          onClick={() => setMinimized(false)}
          className="h-14 w-14 rounded-full flex items-center justify-center text-2xl shadow-2xl border-2 transition hover:scale-110 active:scale-95"
          style={{
            background: `linear-gradient(135deg, ${companion.accent}ee, #100b2b)`,
            borderColor: companion.accent,
            boxShadow: `0 0 25px ${companion.accent}66`,
          }}
          title={`Expand ${companion.name}`}
        >
          {companion.emoji}
        </button>
      </div>
    );
  }

  /* ─── EXPANDED INTERACTIVE COMPANION STATION ─── */
  return (
    <div
      className="card rise relative overflow-hidden p-6 md:p-7 border backdrop-blur transition-all"
      style={{
        borderColor: `${companion.accent}55`,
        background: `radial-gradient(ellipse at 85% 30%, ${companion.accent}14, rgba(12,9,34,0.7) 70%)`,
        boxShadow: `0 10px 40px ${companion.accent}1a`,
      }}
    >
      {/* Glow aura */}
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full opacity-25 blur-3xl"
        style={{ background: companion.accent }}
      />

      <div className="relative z-10 flex flex-col md:flex-row gap-6 items-center">
        {/* 3D VRM Avatar Box */}
        <div
          className="relative h-60 w-60 sm:h-64 sm:w-64 flex-shrink-0 rounded-3xl overflow-hidden border"
          style={{
            borderColor: `${companion.accent}44`,
            background: `radial-gradient(circle at 50% 30%, ${companion.accent}22, #08061a 75%)`,
            boxShadow: `0 0 35px ${companion.accent}33`,
          }}
        >
          <VrmAvatar
            src={companion.vrm}
            accent={companion.accent}
            mood={mood}
            speaking={isSpeaking}
            framing="bust"
            className="absolute inset-0 w-full h-full"
          />

          {/* Top character badge */}
          <div className="absolute top-3 left-3 z-10">
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border backdrop-blur bg-black/60"
              style={{ color: companion.accent, borderColor: `${companion.accent}55` }}
            >
              {companion.role}
            </span>
          </div>

          {/* Speaking indicator */}
          {isSpeaking && (
            <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 rounded-full bg-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/40 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Speaking
            </div>
          )}

          {/* Full room link */}
          <Link
            href="/app/companion"
            className="absolute bottom-3 right-3 z-10 rounded-full bg-black/60 px-2.5 py-0.5 text-[10px] font-semibold text-white/80 border border-white/20 backdrop-blur transition hover:bg-white/20"
          >
            Full Room ↗
          </Link>
        </div>

        {/* Companion Interactive Dialogue & Controls */}
        <div className="flex-1 min-w-0 flex flex-col justify-between w-full">
          <div>
            {/* Header: Name, Switcher & Minimize */}
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{companion.emoji}</span>
                <div>
                  <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                    <span>{companion.name}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/10 text-white/70">
                      Live Companion
                    </span>
                  </h2>
                  <p className="text-xs text-white/50">{companion.tagline}</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {/* Switcher buttons */}
                <div className="hidden sm:flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
                  {COMPANION_LIST.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => switchCompanion(c.id)}
                      className={`h-7 w-7 rounded-lg text-sm flex items-center justify-center transition ${
                        companionId === c.id
                          ? "bg-white/20 scale-105 shadow"
                          : "opacity-60 hover:opacity-100"
                      }`}
                      title={c.name}
                    >
                      {c.emoji}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setMinimized(true)}
                  className="rounded-lg p-1.5 text-xs text-white/40 hover:text-white/80 transition"
                  title="Minimize companion"
                >
                  —
                </button>
              </div>
            </div>

            {/* Speech Dialogue Bubble */}
            <div
              className="rounded-2xl p-4 text-sm leading-relaxed text-white shadow-lg border transition-all"
              style={{
                background: `linear-gradient(135deg, ${companion.accent}20, rgba(255,255,255,0.03))`,
                borderColor: `${companion.accent}44`,
              }}
            >
              {speechBubble}
            </div>

            {/* Quick interactive action chips */}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                disabled={busy}
                onClick={() => void handleSend("Crack a funny anime joke or witty pun for me!")}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80 hover:bg-white/15 transition disabled:opacity-40"
              >
                Tell me a joke 🎭
              </button>
              <button
                disabled={busy}
                onClick={() => void handleSend("Give me quick warm encouragement for my speaking practice today!")}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80 hover:bg-white/15 transition disabled:opacity-40"
              >
                Cheer me up 🌸
              </button>
              <button
                disabled={busy}
                onClick={() => void handleSend("What is one fun speaking tip to keep my voice relaxed?")}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80 hover:bg-white/15 transition disabled:opacity-40"
              >
                Quick Tip ⚡
              </button>
            </div>
          </div>

          {/* Input row: Mic + Text + Send */}
          <div className="mt-4 flex gap-2 items-center">
            <button
              type="button"
              onClick={toggleMic}
              disabled={busy}
              className={`h-11 w-11 rounded-xl flex items-center justify-center text-base font-bold border transition ${
                isListening
                  ? "bg-rose-500 border-rose-400 text-white animate-pulse"
                  : "bg-white/5 border-white/10 text-white/80 hover:bg-white/10"
              }`}
              title={isListening ? "Listening... click to stop" : "Speak with mic"}
            >
              {isListening ? "🎙️" : "🎤"}
            </button>

            <input
              type="text"
              className="flex-1 min-h-11 rounded-xl bg-white/5 border border-white/10 px-3.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition"
              placeholder={
                isListening
                  ? "Listening to your voice..."
                  : busy
                  ? `${companion.name} is thinking…`
                  : `Say something to ${companion.name}…`
              }
              value={input}
              disabled={busy}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend(input);
                }
              }}
            />

            <button
              onClick={() => void handleSend(input)}
              disabled={busy || !input.trim()}
              className="h-11 px-4 rounded-xl text-xs font-bold transition disabled:opacity-30"
              style={{
                background: input.trim()
                  ? `linear-gradient(135deg, ${companion.accent}ee, ${companion.accent}99)`
                  : "rgba(255,255,255,0.08)",
                color: "#fff",
              }}
            >
              Send ↑
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
