"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { Mood } from "@/components/VrmAvatar";
import type { Personality } from "@/lib/types";
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
import { useProfile } from "@/lib/storage";

// Dynamic import: heavy THREE/VRM bundle only loads client-side
const VrmAvatar = dynamic(() => import("@/components/VrmAvatar"), { ssr: false });

/* ---------- helpers ---------- */

/** Build a minimal Personality object from a CompanionCharacter so we can pass it to speak(). */
function toPersonality(c: CompanionCharacter, idx: number): Personality {
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
    positiveBias: 0.8,
    sampleQuestions: [],
  };
}

function moodFromReply(text: string): Mood {
  const t = text.toLowerCase();
  if (/hehe|haha|lol|funny|pun|joke|hilarious|laugh|lmao|giggle/.test(t)) return "happy";
  if (/hmm|think|wonder|interesting|curious|fascinating/.test(t)) return "thinking";
  if (/oh no|sorry|sad|worried|concerned|hope you|breathe|okay\?/.test(t)) return "concerned";
  if (/wow|amazing|awesome|incredible|sugoi|yay|woohoo|love that/.test(t)) return "excited";
  return "neutral";
}

/* ---------- sub-components ---------- */

function TypingDots() {
  return (
    <span className="inline-flex items-end gap-1 h-4">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

function useTyped(text: string, cps = 55) {
  const [shown, setShown] = useState("");
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (!text) {
      setShown("");
      return;
    }
    setTyping(true);
    setShown("");
    const start = performance.now();
    const id = setInterval(() => {
      const k = Math.min(text.length, Math.floor(((performance.now() - start) / 1000) * cps));
      setShown(text.slice(0, k));
      if (k >= text.length) {
        clearInterval(id);
        setTyping(false);
      }
    }, 25);
    return () => clearInterval(id);
  }, [text, cps]);
  return { shown, typing };
}

function Bubble({
  role,
  text,
  accent,
  animate = false,
}: {
  role: "user" | "companion";
  text: string;
  accent: string;
  animate?: boolean;
}) {
  const { shown } = useTyped(role === "companion" && animate ? text : "");
  const display = role === "companion" && animate ? shown : text;
  return (
    <div
      className={`flex w-full ${role === "user" ? "justify-end" : "justify-start"}`}
      style={{ animation: "fadeSlideUp 0.3s ease both" }}
    >
      <div
        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          role === "user"
            ? "rounded-br-sm bg-white/10 text-white font-medium"
            : "rounded-bl-sm text-white shadow-lg"
        }`}
        style={
          role === "companion"
            ? {
                background: `linear-gradient(135deg, ${accent}26, ${accent}12)`,
                border: `1px solid ${accent}4d`,
                boxShadow: `0 4px 20px ${accent}1a`,
              }
            : {}
        }
      >
        {display}
      </div>
    </div>
  );
}

function CharacterPicker({
  selected,
  onSelect,
}: {
  selected: CompanionId;
  onSelect: (id: CompanionId) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 max-w-2xl w-full">
      {COMPANION_LIST.map((c) => {
        const isSel = selected === c.id;
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`group flex flex-col items-center gap-1.5 rounded-2xl border p-3.5 transition-all duration-200 hover:scale-105 ${
              isSel ? "scale-105 shadow-xl" : "border-white/10 bg-white/5 hover:border-white/25"
            }`}
            style={
              isSel
                ? {
                    borderColor: `${c.accent}aa`,
                    background: `${c.accent}22`,
                    boxShadow: `0 0 25px ${c.accent}44`,
                  }
                : {}
            }
          >
            <span className="text-3xl filter drop-shadow">{c.emoji}</span>
            <span className="text-sm font-bold text-white">{c.name}</span>
            <span className="text-[11px] text-white/60 line-clamp-1">{c.role}</span>
          </button>
        );
      })}
    </div>
  );
}

function InterestTags({
  interests,
  onClear,
}: {
  interests: string[];
  onClear?: () => void;
}) {
  if (!interests.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 bg-black/40 backdrop-blur border-t border-white/5">
      <div className="flex items-center justify-between w-full mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50 flex items-center gap-1">
          <span>🧠</span> What I remember about you:
        </span>
        {onClear && (
          <button
            onClick={onClear}
            className="text-[9px] text-white/30 hover:text-white/70 transition underline"
          >
            reset
          </button>
        )}
      </div>
      {interests.map((t) => (
        <span
          key={t}
          className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-white/80 transition hover:bg-white/15"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

/* ================================================================
   MAIN COMPONENT
   ================================================================ */
interface Message {
  role: "user" | "companion";
  text: string;
}

export default function CompanionChat() {
  const router = useRouter();
  const profile = useProfile();

  const [interests, setInterests] = useState<InterestProfile>(loadInterests);
  const [companionId, setCompanionId] = useState<CompanionId>(() => {
    const saved = loadInterests().preferredCompanionId;
    return (saved as CompanionId | null) ?? "hana";
  });
  const companion: CompanionCharacter = COMPANIONS[companionId];

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [learnedBanner, setLearnedBanner] = useState<string | null>(null);
  const [mood, setMood] = useState<Mood>("neutral");
  const [phase, setPhase] = useState<"pick" | "chat">("pick");
  const [newestCompIdx, setNewestCompIdx] = useState(-1);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const recognitionRef = useRef<any>(null);

  // Scroll to bottom on new message
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  // Cleanup TTS on unmount
  useEffect(() => () => stopSpeaking(), []);

  // Web Speech Recognition setup
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
      /* Speech recognition not supported */
    }

    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const toggleMic = useCallback(() => {
    if (!recognitionRef.current) {
      alert("Voice input is not supported in this browser. You can type in the box below!");
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
  }, [isListening]);

  // Auto-greet when entering chat
  useEffect(() => {
    if (phase !== "chat") return;
    void greet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, companionId]);

  const greet = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessages([]);
    setMood("happy");

    const name = profile?.name ?? interests.preferredName ?? null;
    const tops = topInterests(interests);

    try {
      const res = await fetch("/api/companion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companionId,
          persona: companion.persona,
          userName: name,
          userMessage:
            interests.sessionCount === 0
              ? "__GREET_NEW_USER__"
              : `__GREET_RETURNING_USER__ Sessions: ${interests.sessionCount}`,
          history: interests.recentExchanges,
          topInterests: tops,
          sessionCount: interests.sessionCount,
        }),
      });
      const data = (await res.json()) as { reply: string; detectedTopics: string[] };
      const reply = data.reply ?? `Hey there! I'm ${companion.name}~ So excited to chat with you! ${companion.emoji}`;

      setMessages([{ role: "companion", text: reply }]);
      setNewestCompIdx(0);
      setMood(moodFromReply(reply));

      // Persist updated session count
      const updated: InterestProfile = {
        ...interests,
        sessionCount: interests.sessionCount + 1,
        preferredCompanionId: companionId,
        recentExchanges: [...interests.recentExchanges, { role: "companion", text: reply }],
      };
      saveInterests(updated);
      setInterests(updated);

      if (!voiceMuted) {
        setIsSpeaking(true);
        await speak(reply, toPersonality(companion, 0));
      }
    } catch {
      const fallback = `Hi! I'm ${companion.name}! So happy to meet you~ ${companion.emoji}`;
      setMessages([{ role: "companion", text: fallback }]);
      setNewestCompIdx(0);
    } finally {
      setIsSpeaking(false);
      setMood("neutral");
      setBusy(false);
      busyRef.current = false;
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [companion, companionId, interests, profile, voiceMuted]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      stopSpeaking();

      setMessages((prev) => [...prev, { role: "user", text }]);
      setInput("");
      setMood("thinking");

      const name = profile?.name ?? interests.preferredName ?? null;
      const tops = topInterests(interests);

      try {
        const res = await fetch("/api/companion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companionId,
            persona: companion.persona,
            userName: name,
            userMessage: text,
            history: interests.recentExchanges,
            topInterests: tops,
            sessionCount: interests.sessionCount,
          }),
        });

        const data = (await res.json()) as { reply: string; detectedTopics: string[] };
        const reply = data.reply ?? "Hmm, I got a little tongue-tied~ try again?";

        setMessages((prev) => {
          const idx = prev.length;
          setNewestCompIdx(idx);
          return [...prev, { role: "companion", text: reply }];
        });
        setMood(moodFromReply(reply));

        // Update interest profile
        const updated: InterestProfile = { ...interests };
        const newTopics: string[] = [];
        for (const t of data.detectedTopics ?? []) {
          if (!updated.interests[t]) newTopics.push(t);
          boostInterest(updated, t, 1);
        }

        if (newTopics.length > 0) {
          setLearnedBanner(`✨ ${companion.name} learned you like: ${newTopics.join(", ")}`);
          setTimeout(() => setLearnedBanner(null), 4500);
        }

        // Try to learn the user's name
        const nameMatch = text.match(/(?:i'm|im|my name is|call me)\s+([A-Za-z]{2,20})/i);
        if (nameMatch?.[1] && !updated.preferredName) updated.preferredName = nameMatch[1];

        updated.recentExchanges = [
          ...interests.recentExchanges,
          { role: "user", text },
          { role: "companion", text: reply },
        ];
        saveInterests(updated);
        setInterests(updated);

        if (!voiceMuted) {
          setIsSpeaking(true);
          await speak(reply, toPersonality(companion, 0));
        }
      } catch {
        const err = "Oops, my brain glitched for a second~ could you repeat that?";
        setMessages((prev) => {
          setNewestCompIdx(prev.length);
          return [...prev, { role: "companion", text: err }];
        });
      } finally {
        setIsSpeaking(false);
        setMood("neutral");
        setBusy(false);
        busyRef.current = false;
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    },
    [companion, companionId, interests, profile, voiceMuted]
  );

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  const handleClearInterests = () => {
    if (confirm("Reset learned interests and conversation memory?")) {
      const reset: InterestProfile = {
        interests: {},
        memories: {},
        preferredName: null,
        sessionCount: 1,
        preferredCompanionId: companionId,
        recentExchanges: [],
      };
      saveInterests(reset);
      setInterests(reset);
      setLearnedBanner("Memory reset. Starting fresh!");
      setTimeout(() => setLearnedBanner(null), 3000);
    }
  };

  const knownInterests = topInterests(interests, 6);

  /* Quick action prompts */
  const quickPrompts = [
    { label: "Tell me a joke! 🎭", prompt: "Crack a hilarious joke or pun for me!" },
    { label: "What are your hobbies? 🌸", prompt: "What are your favorite things to do?" },
    { label: "Ask me a question ✨", prompt: "Ask me something about what I like!" },
    { label: "Having a long day ☕", prompt: "I've had a busy day today, cheer me up?" },
  ];

  /* ---- PHASE: character picker ---- */
  if (phase === "pick") {
    return (
      <div className="fixed inset-0 overflow-hidden bg-[#08061a] flex flex-col">
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between p-4">
          <button
            className="btn btn-ghost min-h-10 bg-black/40 backdrop-blur border border-white/10"
            onClick={() => router.push("/app")}
          >
            ← Back to App
          </button>
          <div className="text-xs text-white/50 bg-black/40 px-3 py-1.5 rounded-full border border-white/10">
            3D Anime Companion AI
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4 pt-16 pb-8 overflow-y-auto">
          {/* Large VRM preview */}
          <div
            className="relative w-64 h-64 md:w-80 md:h-80 rounded-3xl overflow-hidden flex-shrink-0"
            style={{ boxShadow: `0 0 60px ${companion.accent}55, 0 0 120px ${companion.accent}22` }}
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: `radial-gradient(circle at 50% 30%, ${companion.accent}33, transparent 70%)` }}
            />
            <VrmAvatar
              src={companion.vrm}
              accent={companion.accent}
              mood="happy"
              speaking={false}
              framing="bust"
              className="absolute inset-0 w-full h-full"
            />
            {/* Name overlay */}
            <div
              className="absolute bottom-0 inset-x-0 p-4"
              style={{ background: "linear-gradient(to top, rgba(0,0,0,0.9), transparent)" }}
            >
              <div className="text-xs font-bold uppercase tracking-widest" style={{ color: companion.accent }}>
                {companion.role}
              </div>
              <div className="text-xl font-extrabold text-white flex items-center gap-2">
                <span>{companion.name}</span>
                <span>{companion.emoji}</span>
              </div>
              <div className="text-xs text-white/70 mt-0.5">{companion.tagline}</div>
            </div>
          </div>

          <div className="text-center max-w-md">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Choose your anime companion</h1>
            <p className="text-sm text-indigo-100/60 mt-1.5">
              Personalized AI that learns your interests, tells jokes, and speaks with you in real-time.
            </p>
          </div>

          <CharacterPicker selected={companionId} onSelect={setCompanionId} />

          <button
            className="btn mt-2 min-h-14 w-full max-w-sm text-lg font-extrabold text-white rounded-2xl transition hover:opacity-95 active:scale-95 shadow-xl"
            style={{
              background: `linear-gradient(135deg, ${companion.accent}dd, ${companion.accent}88)`,
              boxShadow: `0 0 35px ${companion.accent}66`,
            }}
            onClick={() => {
              const updated: InterestProfile = { ...interests, preferredCompanionId: companionId };
              saveInterests(updated);
              setInterests(updated);
              setPhase("chat");
            }}
          >
            Start Chatting with {companion.name} {companion.emoji}
          </button>
        </div>

        <style>{`
          @keyframes fadeSlideUp {
            from { opacity: 0; transform: translateY(10px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  /* ---- PHASE: chat ---- */
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#08061a] flex flex-col md:flex-row">
      {/* Learned interest floating toast notification */}
      {learnedBanner && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-full px-5 py-2 text-xs font-semibold text-white shadow-2xl backdrop-blur border border-white/20 animate-bounce"
          style={{ background: `linear-gradient(135deg, ${companion.accent}ee, #1e153b)` }}
        >
          {learnedBanner}
        </div>
      )}

      {/* ─── Left: VRM character panel ─── */}
      <div
        className="relative flex-shrink-0 h-[44vh] md:h-full md:w-[40%] lg:w-[35%] border-b md:border-b-0 md:border-r border-white/10 flex flex-col"
        style={{ background: `radial-gradient(ellipse at 50% 20%, ${companion.accent}24, #08061a 75%)` }}
      >
        {/* Accent glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(circle at 50% 35%, ${companion.accent}14, transparent 65%)` }}
        />

        <VrmAvatar
          src={companion.vrm}
          accent={companion.accent}
          mood={mood}
          speaking={isSpeaking}
          framing="bust"
          className="absolute inset-0 w-full h-full"
        />

        {/* Character name badge */}
        <div className="absolute top-4 left-4 z-10">
          <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: companion.accent }}>
            {companion.role}
          </div>
          <div className="text-xl font-extrabold text-white drop-shadow-lg flex items-center gap-1.5">
            <span>{companion.name}</span>
            <span className="text-base">{companion.emoji}</span>
          </div>
        </div>

        {/* Top-right actions */}
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          {/* Mute/Unmute voice button */}
          <button
            title={voiceMuted ? "Unmute Voice" : "Mute Voice"}
            className="rounded-full border border-white/15 bg-black/50 p-2 text-xs font-semibold text-white/80 backdrop-blur transition hover:bg-white/15"
            onClick={() => {
              if (!voiceMuted) stopSpeaking();
              setVoiceMuted((v) => !v);
            }}
          >
            {voiceMuted ? "🔇" : "🔊"}
          </button>
          <button
            className="rounded-full border border-white/15 bg-black/50 px-3 py-1.5 text-xs font-semibold text-white/80 backdrop-blur transition hover:bg-white/15"
            onClick={() => {
              stopSpeaking();
              setMessages([]);
              setPhase("pick");
            }}
          >
            Switch
          </button>
          <button
            className="rounded-full border border-white/15 bg-black/50 px-3 py-1.5 text-xs font-semibold text-white/80 backdrop-blur transition hover:bg-white/15"
            onClick={() => {
              stopSpeaking();
              router.push("/app");
            }}
          >
            ← Back
          </button>
        </div>

        {/* Thinking / speaking status pill */}
        {busy && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 rounded-full border border-white/20 bg-black/70 px-4 py-1.5 text-xs font-medium text-white/90 backdrop-blur shadow-lg flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full animate-ping"
              style={{ background: companion.accent }}
            />
            {mood === "thinking" ? `${companion.name} is thinking…` : `${companion.name} is speaking…`}
          </div>
        )}

        {/* Known interest tags footer */}
        <div className="mt-auto relative z-10">
          <InterestTags interests={knownInterests} onClear={handleClearInterests} />
        </div>
      </div>

      {/* ─── Right: Chat panel ─── */}
      <div className="flex flex-1 flex-col min-h-0 bg-[#0c0922]">
        {/* Header */}
        <div className="flex-shrink-0 px-4 py-3 border-b border-white/10 flex items-center gap-3 bg-black/30 backdrop-blur">
          <span className="text-2xl">{companion.emoji}</span>
          <div>
            <div className="text-sm font-bold text-white flex items-center gap-2">
              <span>{companion.name}</span>
              {interests.preferredName && (
                <span className="text-[11px] font-normal text-white/50">
                  (talking with {interests.preferredName})
                </span>
              )}
            </div>
            <div className="text-xs text-white/45">{companion.tagline}</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {isSpeaking && (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-300 border border-emerald-500/30">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Speaking
              </span>
            )}
            {interests.sessionCount > 0 && (
              <span className="hidden sm:block text-[10px] text-white/40 border border-white/10 rounded-full px-2.5 py-0.5">
                Session #{interests.sessionCount}
              </span>
            )}
          </div>
        </div>

        {/* Quick conversation starter chips */}
        <div className="flex-shrink-0 px-4 py-2 border-b border-white/5 flex gap-2 overflow-x-auto no-scrollbar bg-black/20">
          {quickPrompts.map((q, idx) => (
            <button
              key={idx}
              disabled={busy}
              onClick={() => void sendMessage(q.prompt)}
              className="flex-shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75 hover:bg-white/15 hover:border-white/20 transition disabled:opacity-40"
            >
              {q.label}
            </button>
          ))}
        </div>

        {/* Messages feed */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-3 min-h-0">
          {messages.length === 0 && busy && (
            <div className="flex justify-start">
              <div
                className="rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-white/70"
                style={{ background: `${companion.accent}18`, border: `1px solid ${companion.accent}33` }}
              >
                <TypingDots />
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <Bubble
              key={i}
              role={m.role}
              text={m.text}
              accent={companion.accent}
              animate={i === newestCompIdx && m.role === "companion"}
            />
          ))}
          {/* Typing indicator while companion prepares response */}
          {busy && messages.length > 0 && messages[messages.length - 1].role === "user" && (
            <div className="flex justify-start">
              <div
                className="rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-white/70"
                style={{ background: `${companion.accent}18`, border: `1px solid ${companion.accent}33` }}
              >
                <TypingDots />
              </div>
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="flex-shrink-0 border-t border-white/10 p-3 sm:p-4 bg-black/30">
          <div className="flex gap-2 items-center">
            {/* Microphone voice button */}
            <button
              type="button"
              className={`flex-shrink-0 h-12 w-12 rounded-2xl flex items-center justify-center text-lg font-bold border transition-all hover:scale-105 active:scale-95 ${
                isListening
                  ? "bg-rose-500 border-rose-400 text-white animate-pulse shadow-lg shadow-rose-500/50"
                  : "bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:border-white/20"
              }`}
              onClick={toggleMic}
              title={isListening ? "Listening... click to stop" : "Speak with microphone"}
              disabled={busy}
            >
              {isListening ? "🎙️" : "🎤"}
            </button>

            <input
              ref={inputRef}
              id="companion-input"
              type="text"
              className="flex-1 min-h-12 rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition"
              placeholder={
                isListening
                  ? "Listening to your voice..."
                  : busy
                  ? `${companion.name} is thinking…`
                  : `Speak or type to ${companion.name}…`
              }
              value={input}
              disabled={busy}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              autoComplete="off"
            />

            <button
              className="flex-shrink-0 h-12 w-12 rounded-2xl flex items-center justify-center text-lg font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-30"
              style={{
                background: input.trim()
                  ? `linear-gradient(135deg, ${companion.accent}ee, ${companion.accent}99)`
                  : "rgba(255,255,255,0.07)",
              }}
              disabled={busy || !input.trim()}
              onClick={() => void sendMessage(input)}
              aria-label="Send message"
            >
              ↑
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-white/35 px-1">
            <span>Click 🎤 to speak with your voice or press Enter to send</span>
            <span>{companion.name} learns your interests as you chat</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
