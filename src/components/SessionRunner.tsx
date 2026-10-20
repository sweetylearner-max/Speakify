"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Hall from "@/components/hall/HallLoader";
import type { Reaction } from "@/components/hall/Avatar";
import { ErrorBanner, InfoBanner } from "@/components/ui";
import { stashAudio } from "@/lib/audioStash";
import { MODE_INFO, uid } from "@/lib/insights";
import {
  buildSpeechMetrics, countWords, deterministicScores, finalScores, fmtTime, hasThankYou, isPositiveTurn, rulesFeedback, wpmBandScore,
} from "@/lib/metrics";
import { audienceFor, byId } from "@/lib/personalities";
import { addSession, useProfile, useSessions } from "@/lib/storage";
import { pickTopic } from "@/lib/topics";
import { speak, stopSpeaking } from "@/lib/tts";
import type { AnalyzeRequest, BodyMetrics, CoachFeedback, Personality, QAEntry, SessionMode, SessionRecord, SpeechMetrics } from "@/lib/types";
import { issueMessage, useSpeechCapture } from "@/lib/useSpeechCapture";
import { usePoseTracker } from "@/lib/usePoseTracker";

type Phase = "setup" | "intro" | "prep" | "live" | "analyzing" | "empty" | "error";

const PREP_SECONDS = 60;
const SPEAK_SECONDS = 120;
const QUIET_SECONDS = 1.8; // same turn-ending silence as the iOS app

interface Pending {
  transcript: string;
  metrics: SpeechMetrics;
  body: BodyMetrics | null;
  reactionRatio: number;
  qa: QAEntry[];
  audioUrl: string | null;
}

const COMMENT_FALLBACKS = ["Hm, that's a fair point.", "I can see where you're coming from.", "Okay, that actually makes sense.", "I'm not sure I agree, but go on."];

const DEBATE_FALLBACKS = [
  "That doesn't hold up for me. What happens when that's not true?",
  "I'm not convinced. What's your strongest evidence for that?",
  "That's a claim, not proof. Back it up.",
  "Sounds good in theory. Where does it actually break down?",
];

export default function SessionRunner({ mode }: { mode: SessionMode }) {
  const router = useRouter();
  const profile = useProfile();
  const sessions = useSessions();
  const capture = useSpeechCapture();
  const pose = usePoseTracker();

  const [phase, setPhaseState] = useState<Phase>("setup");
  const phaseRef = useRef<Phase>("setup");
  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };

  const [topic, setTopic] = useState("");
  const [topicBusy, setTopicBusy] = useState(false);
  const [discussWith, setDiscussWith] = useState(1);
  const [useCamera, setUseCamera] = useState(false);
  const [starting, setStarting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);

  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const [bubble, setBubble] = useState<{ id: number; text: string } | null>(null);
  const [reactions, setReactions] = useState<Record<number, Reaction>>({});
  const [prepLeft, setPrepLeft] = useState(PREP_SECONDS);
  const [hud, setHud] = useState({ elapsed: 0, wpm: 0, fillers: 0, words: 0 });

  const busyRef = useRef(false);
  const qaRef = useRef(false);
  const askedRef = useRef<string[]>([]);
  const qaLogRef = useRef<QAEntry[]>([]);
  const historyRef = useRef<{ isUser: boolean; text: string }[]>([]);
  const statsRef = useRef({ pos: 0, total: 0, userTurns: 0 });
  const turnActiveStartRef = useRef(0);
  const nextAskerRef = useRef(1);
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishingRef = useRef(false);
  const lastInterjectRef = useRef(0);
  const turnCountRef = useRef(0);
  const qaStatsRef = useRef({ questions: 0, exchanges: 0 });

  const audience: Personality[] = useMemo(() => {
    if (!profile) return [];
    if (mode === "public") return audienceFor(profile.experience);
    if (mode === "challenge") return [byId(0)];
    if (mode === "debate") return [byId(2)];
    return [byId(discussWith)];
  }, [mode, profile, discussWith]);
  const audienceRef = useRef(audience);
  audienceRef.current = audience;
  const topicRef = useRef(topic);
  topicRef.current = topic;

  const info = MODE_INFO[mode];
  const isConversation = mode === "discuss" || mode === "debate";

  useEffect(() => {
    if (mode === "challenge" && profile && !topic) setTopic(pickTopic(profile.goal));
  }, [mode, profile, topic]);

  useEffect(
    () => () => {
      stopSpeaking();
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    },
    [],
  );

  // ---------- helpers ----------
  const showBubble = useCallback((id: number, text: string, keepMs = 0) => {
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    setBubble({ id, text });
    if (keepMs) bubbleTimerRef.current = setTimeout(() => setBubble(null), keepMs);
  }, []);

  /** An audience member says something out loud: pause transcription so we never hear them as the student. */
  const say = useCallback(
    async (p: Personality, text: string, opts: { keepBubbleMs?: number } = {}) => {
      busyRef.current = true;
      capture.hold();
      setSpeakingId(p.id);
      showBubble(p.id, text);
      await speak(text, p);
      setSpeakingId(null);
      if (opts.keepBubbleMs !== undefined) {
        if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
        bubbleTimerRef.current = setTimeout(() => setBubble(null), opts.keepBubbleMs);
      }
      capture.release();
      capture.markTurn();
      turnActiveStartRef.current = capture.activeSeconds();
      busyRef.current = false;
    },
    [capture, showBubble],
  );

  async function fetchLine(body: Record<string, unknown>, fallback: string): Promise<string> {
    try {
      const res = await fetch("/api/audience", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        setNote(`AI audience is offline (${data.message ?? "error"}). Using built-in lines instead.`);
        return fallback;
      }
      return data.text as string;
    } catch {
      setNote("Couldn't reach the AI audience. Using built-in lines instead.");
      return fallback;
    }
  }

  // ---------- session start ----------
  async function begin(forceManual = false) {
    if (!profile) return;
    setStarting(true);
    setNote(null);
    let ok = true;
    if (forceManual || capture.manual) capture.startManual();
    else ok = await capture.start();
    setStarting(false);
    if (!ok) return;
    if (useCamera) void pose.start();
    stopSpeaking();
    finishingRef.current = false;
    qaRef.current = false;
    askedRef.current = [];
    qaLogRef.current = [];
    historyRef.current = [];
    statsRef.current = { pos: 0, total: 0, userTurns: 0 };
    nextAskerRef.current = 1;
    lastInterjectRef.current = 0;
    turnCountRef.current = 0;
    qaStatsRef.current = { questions: 0, exchanges: 0 };
    setReactions({});
    setBubble(null);

    const host = audienceRef.current[0];
    setPhase("intro");

    if (mode === "challenge") {
      capture.hold(); // no recording while preparing
      setPrepLeft(PREP_SECONDS);
      const t = topicRef.current;
      setPhase("prep");
      await say(host, `Here's your topic: ${t} You have one minute to prepare.`);
      if (phaseRef.current === "prep") capture.hold();
      return;
    }

    if (mode === "public") {
      // iOS icebreaker: the host asks if you're nervous, listens briefly, then reassures
      await say(host, "Are you nervous?");
      await new Promise((r) => setTimeout(r, 2500));
      await say(host, "Don't worry, we've got you covered!", { keepBubbleMs: 1500 });
    } else {
      const fallback = mode === "debate" ? `I'm ${host.short}. State your position. I'm not here to agree with you.` : `Hi, I'm ${host.short}. What would you like to talk about?`;
      const greeting = await fetchLine({ kind: "greeting", personalityId: host.id, isDebate: mode === "debate" }, fallback);
      historyRef.current.push({ isUser: false, text: greeting });
      await say(host, greeting);
    }
    startLive();
  }

  function startLive() {
    capture.resetCounters();
    capture.release();
    pose.reset();
    turnActiveStartRef.current = 0;
    setPhase("live");
  }

  function beginSpeakingFromPrep() {
    if (phaseRef.current !== "prep") return;
    stopSpeaking();
    busyRef.current = false;
    setSpeakingId(null);
    setBubble(null);
    startLive();
  }

  // ---------- prep countdown ----------
  useEffect(() => {
    if (phase !== "prep") return;
    const id = setInterval(() => {
      setPrepLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          setTimeout(beginSpeakingFromPrep, 0);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ---------- live loop ----------
  const endTurn = useCallback(async () => {
    const text = capture.turnText();
    if (countWords(text) < (qaRef.current ? 1 : 3)) return;
    const activeNow = capture.activeSeconds();
    const secs = Math.max(2, activeNow - turnActiveStartRef.current - QUIET_SECONDS);
    capture.markTurn();
    turnActiveStartRef.current = activeNow;

    if (isConversation) {
      statsRef.current.userTurns++;
      historyRef.current.push({ isUser: true, text });
      const p = audienceRef.current[0];
      const isDebate = mode === "debate";
      const fallback = isDebate ? DEBATE_FALLBACKS[Math.floor(Math.random() * DEBATE_FALLBACKS.length)] : p.sampleQuestions[Math.floor(Math.random() * p.sampleQuestions.length)];
      busyRef.current = true; // no second turn while the reply is being written
      const reply = await fetchLine({ kind: "reply", personalityId: p.id, history: historyRef.current, isDebate, allowQuestion: Math.random() < 0.3 }, fallback);
      historyRef.current.push({ isUser: false, text: reply });
      await say(p, reply);
      return;
    }

    // Public / challenge: the audience reacts silently while you present (heuristic from pace + fillers)
    const positive = isPositiveTurn(text, secs);
    statsRef.current.total++;
    if (positive) statsRef.current.pos++;
    setReactions((prev) => {
      const next = { ...prev };
      for (const p of audienceRef.current) {
        if (Math.random() < 0.7) {
          next[p.id] = { positive: positive ? Math.random() < 0.5 + p.positiveBias * 0.45 : Math.random() < p.positiveBias * 0.25, t: performance.now() + p.id };
        }
      }
      return next;
    });

    if (mode !== "public") return;
    const list = audienceRef.current;
    const speaker = profile?.name;

    if (qaRef.current) {
      // Q&A: react to the answer like a person; only occasionally push with a question (max 2)
      const qs = qaStatsRef.current;
      const asQuestion = qs.questions < 2 && (qs.exchanges === 0 || Math.random() < 0.35);
      qs.exchanges++;
      const asker = list[nextAskerRef.current % list.length];
      nextAskerRef.current++;
      busyRef.current = true;
      const context = capture.snapshot().transcript.slice(-3000);
      let line: string;
      if (asQuestion) {
        qs.questions++;
        const pool = asker.sampleQuestions.filter((q) => !askedRef.current.includes(q));
        const fb = pool[Math.floor(Math.random() * pool.length)] ?? asker.sampleQuestions[0];
        line = await fetchLine({ kind: "question", personalityId: asker.id, context, avoiding: askedRef.current, topic: topicRef.current, latest: text, speaker }, fb);
        askedRef.current.push(line);
        qaLogRef.current.push({ member: asker.name, question: line });
      } else {
        line = await fetchLine({ kind: "comment", personalityId: asker.id, topic: topicRef.current, latest: text, speaker }, COMMENT_FALLBACKS[Math.floor(Math.random() * COMMENT_FALLBACKS.length)]);
      }
      await say(asker, line, { keepBubbleMs: 7000 });
      return;
    }

    // Mid-talk: someone can't help reacting out loud, but not too often
    turnCountRef.current++;
    const now = Date.now();
    const negative = /(can't|cannot|never|terrible|bad|hate|boring|useless|worst|pointless|don't think|not good|impossible)/i.test(text);
    const cooled = now - lastInterjectRef.current > 25000;
    if (cooled && turnCountRef.current >= 2 && Math.random() < (negative ? 0.85 : 0.4)) {
      lastInterjectRef.current = now;
      const who = list[Math.floor(Math.random() * list.length)];
      busyRef.current = true;
      const context = capture.snapshot().transcript.slice(-1500);
      const line = await fetchLine({ kind: "interject", personalityId: who.id, context, topic: topicRef.current, latest: text, speaker }, COMMENT_FALLBACKS[Math.floor(Math.random() * COMMENT_FALLBACKS.length)]);
      await say(who, line, { keepBubbleMs: 4500 });
    }
  }, [capture, isConversation, mode, say, profile]);

  const latest = useRef({ endTurn, finish });
  latest.current = { endTurn, finish };

  useEffect(() => {
    if (phase !== "live") return;
    const id = setInterval(() => {
      const snap = capture.snapshot();
      const words = countWords(snap.transcript);
      const minutes = Math.max(snap.activeSec, 1) / 60;
      const fillers = buildSpeechMetrics(snap.transcript, { activeSec: snap.activeSec, pauses: snap.pauses }).fillerCount;
      setHud({ elapsed: snap.activeSec, wpm: snap.activeSec > 4 ? Math.round(words / minutes) : 0, fillers, words });

      if (mode === "challenge" && snap.activeSec >= SPEAK_SECONDS && !finishingRef.current) {
        void latest.current.finish(true);
        return;
      }
      if (busyRef.current || finishingRef.current) return;
      if (mode === "public" && !qaRef.current && hasThankYou(snap.transcript)) qaRef.current = true;
      if (capture.secondsSinceChange() >= QUIET_SECONDS && capture.turnText()) void latest.current.endTurn();
    }, 300);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ---------- finish + analysis ----------
  async function finish(timeUp = false) {
    if (finishingRef.current) return;
    finishingRef.current = true;
    stopSpeaking();
    if (timeUp) {
      const host = audienceRef.current[0];
      void speak("Time's up! Great job.", host);
    }
    setBubble(null);
    setSpeakingId(null);
    busyRef.current = true;
    const result = await capture.stop();
    const body = useCamera ? pose.getMetrics() : null;
    pose.stop();

    const metrics = buildSpeechMetrics(result.transcript, { activeSec: result.activeSec, pauses: result.pauses });
    const stats = statsRef.current;
    const reactionRatio = isConversation ? Math.min(1, stats.userTurns / 6) : stats.total ? stats.pos / stats.total : 0.5;
    const p: Pending = { transcript: result.transcript, metrics, body, reactionRatio, qa: qaLogRef.current, audioUrl: result.audioUrl };
    setPending(p);
    if (metrics.wordCount < 8) {
      setPhase("empty");
      return;
    }
    void analyze(p);
  }

  async function analyze(p: Pending) {
    if (!profile) return;
    setPhase("analyzing");
    setAnalysisError(null);
    const payload: AnalyzeRequest = {
      mode,
      topic,
      transcript: p.transcript,
      metrics: p.metrics,
      body: p.body,
      reactionRatio: p.reactionRatio,
      profile: { name: profile.name, experience: profile.experience, goal: profile.goal, nerves: profile.nerves, focus: profile.focus },
      previous: sessions.slice(0, 3).map((s) => ({ overall: s.scores.overall, wpm: s.metrics.wpm, fillerCount: s.metrics.fillerCount, createdAt: s.createdAt })),
      qa: p.qa,
    };
    try {
      const res = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "The coaching service returned an error.");
      save(p, data.feedback as CoachFeedback);
    } catch (e) {
      const msg = e instanceof TypeError ? "You seem to be offline, so AI coaching couldn't be reached." : (e as Error).message;
      setAnalysisError(msg);
      setPhase("error");
    }
  }

  function save(p: Pending, ai: CoachFeedback | null) {
    const det = deterministicScores(p.metrics, p.body, p.reactionRatio);
    const feedback = ai ?? rulesFeedback(p.metrics, det);
    const rec: SessionRecord = {
      id: uid(),
      createdAt: Date.now(),
      mode,
      topic: topic || "",
      transcript: p.transcript,
      metrics: p.metrics,
      body: p.body,
      scores: finalScores(det, ai ? feedback : null),
      reactionRatio: p.reactionRatio,
      qa: p.qa,
      feedback,
    };
    addSession(rec);
    stashAudio(rec.id, p.audioUrl);
    router.push(`/app/results/${rec.id}`);
  }

  function exit() {
    stopSpeaking();
    void capture.stop();
    pose.stop();
    router.push("/app/practice");
  }

  async function generateTopic() {
    if (!profile) return;
    setTopicBusy(true);
    try {
      const res = await fetch("/api/topic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: profile.name, experience: profile.experience, goal: profile.goal, focus: profile.focus, avoid: [topic] }),
      });
      const data = await res.json();
      if (res.ok && data.topic) setTopic(data.topic);
      else setNote("Couldn't generate a personal topic right now. Try the shuffle button.");
    } catch {
      setNote("You seem to be offline. Try the shuffle button.");
    }
    setTopicBusy(false);
  }

  if (!profile) return null;

  const showHall = phase !== "analyzing" && phase !== "empty" && phase !== "error";
  const issueText = issueMessage(capture.issue);
  const liveWpmOk = wpmBandScore(hud.wpm) === 1;
  const timeShown = mode === "challenge" ? Math.max(0, SPEAK_SECONDS - hud.elapsed) : hud.elapsed;

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#08061a]">
      {showHall && (
        <div className="absolute inset-0">
          <Hall audience={audience} speakingId={speakingId} reactions={reactions} bubble={bubble} level={capture.level} focusOne={mode !== "public"} shiftX={phase === "setup" ? 1.5 : 0} interactive />
        </div>
      )}
      <video ref={pose.videoRef} muted playsInline className={`absolute bottom-28 right-3 z-20 h-32 w-24 -scale-x-100 rounded-2xl border border-white/25 object-cover shadow-xl md:h-44 md:w-32 ${pose.status === "on" && phase === "live" ? "" : "hidden"}`} aria-label="Your camera preview" />

      {/* top bar */}
      {(phase === "setup" || phase === "intro" || phase === "prep" || phase === "live") && (
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 p-3 md:p-5">
          <button className="btn btn-ghost min-h-11 bg-black/40 backdrop-blur" onClick={() => (phase === "setup" ? router.push("/app/practice") : setConfirmExit(true))} aria-label="Leave session">
            ← Back
          </button>
          <div className="rounded-full border border-white/15 bg-black/40 px-4 py-2 text-sm font-bold backdrop-blur" style={{ color: info.accent === "#6366f1" ? "#a5b4fc" : info.accent }}>
            {info.title}
          </div>
        </div>
      )}

      {confirmExit && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-5" role="dialog" aria-modal="true" aria-label="Leave this session?">
          <div className="card max-w-sm p-6 text-center">
            <h2 className="text-xl font-extrabold">Leave this session?</h2>
            <p className="mt-2 text-indigo-100/70">Nothing has been saved yet.</p>
            <div className="mt-5 flex justify-center gap-3">
              <button className="btn btn-ghost" onClick={() => setConfirmExit(false)}>Keep going</button>
              <button className="btn btn-danger" onClick={exit}>Leave</button>
            </div>
          </div>
        </div>
      )}

      {/* SETUP */}
      {phase === "setup" && (
        <div className="absolute inset-0 z-10 flex items-end justify-center overflow-y-auto p-3 pt-20 md:items-center md:justify-start md:p-6 md:pl-[6vw]">
          <div className="card rise w-full max-w-lg bg-[#0d0a24]/90 p-5 md:p-7">
            <h1 className="text-2xl font-extrabold md:text-3xl">{info.title}</h1>
            <p className="mt-1 text-indigo-100/75">{info.blurb}</p>

            {mode === "challenge" && (
              <div className="mt-5">
                <div className="text-xs font-bold uppercase tracking-widest text-indigo-200/60">Your topic</div>
                <p className="mt-1 rounded-2xl bg-white/5 p-4 text-lg font-bold">{topic}</p>
                <div className="mt-2 flex gap-2">
                  <button className="btn btn-ghost min-h-10 px-4 text-sm" onClick={() => profile && setTopic(pickTopic(profile.goal, topic))}>Shuffle</button>
                  <button className="btn btn-ghost min-h-10 px-4 text-sm" disabled={topicBusy} onClick={generateTopic}>{topicBusy ? "Writing…" : "✨ Personalised by AI"}</button>
                </div>
              </div>
            )}

            {(mode === "public" || mode === "debate") && (
              <label className="mt-5 block">
                <span className="mb-1 block text-sm font-semibold">{mode === "public" ? "What is your talk about? (optional)" : "Your position or topic (optional)"}</span>
                <input className="field" value={topic} maxLength={120} onChange={(e) => setTopic(e.target.value)} placeholder={mode === "public" ? "e.g. Why schools should teach public speaking" : "e.g. Homework should be optional"} />
              </label>
            )}

            {mode === "discuss" && (
              <fieldset className="mt-5">
                <legend className="mb-2 text-sm font-semibold">Who do you want to talk with?</legend>
                <div className="grid grid-cols-2 gap-2" role="radiogroup">
                  {[1, 4].map((id) => (
                    <button key={id} role="radio" aria-checked={discussWith === id} onClick={() => setDiscussWith(id)}
                      className={`rounded-2xl border p-3 text-left transition ${discussWith === id ? "border-indigo-300 bg-indigo-500/25" : "border-white/10 bg-white/5"}`}>
                      <span className="block font-bold">{byId(id).name}</span>
                      <span className="block text-xs text-indigo-100/65">{byId(id).trait}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="mt-5 space-y-3 text-sm">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-white/5 p-3">
                <input type="checkbox" className="mt-1 h-5 w-5 accent-indigo-400" checked={useCamera} onChange={(e) => setUseCamera(e.target.checked)} />
                <span>
                  <span className="block font-semibold">Track body language with my camera (optional)</span>
                  <span className="text-indigo-100/60">Posture, head steadiness and gestures. Video stays on your device.</span>
                </span>
              </label>
              <p className="text-indigo-100/60">
                🎙 Your browser will ask for the microphone so it can transcribe your speech and measure your pace. Chrome and Edge may use their own online speech service for this.
              </p>
            </div>

            {issueText && (
              <div className="mt-4 space-y-2">
                <ErrorBanner action={
                  <span className="flex gap-2">
                    {capture.issue !== "no-speech-api" && <button className="btn btn-ghost min-h-9 px-3 text-xs" onClick={() => void begin()}>Try again</button>}
                    <button className="btn btn-ghost min-h-9 px-3 text-xs" onClick={() => void begin(true)}>Type instead</button>
                  </span>
                }>{issueText}</ErrorBanner>
              </div>
            )}
            {note && <div className="mt-3"><InfoBanner>{note}</InfoBanner></div>}

            <button className="btn btn-primary mt-6 min-h-14 w-full text-lg" disabled={starting || (mode === "challenge" && !topic)} onClick={() => void begin()}>
              {starting ? "Waiting for microphone…" : mode === "challenge" ? "Start prep" : mode === "public" ? "Enter the hall" : "Start talking"}
            </button>
          </div>
        </div>
      )}

      {/* PREP */}
      {phase === "prep" && (
        <div className="absolute inset-x-0 top-16 z-10 flex flex-col items-center gap-3 px-4 pt-2 md:top-20">
          <span className="text-xs font-bold uppercase tracking-[0.3em] text-amber-300">Prepare</span>
          <p className="max-w-xl rounded-2xl border border-white/15 bg-black/55 px-5 py-3 text-center text-lg font-bold backdrop-blur md:text-xl">{topic}</p>
          <div className="text-6xl font-extrabold tabular-nums">{fmtTime(prepLeft)}</div>
          <button className="btn btn-primary" onClick={beginSpeakingFromPrep}>I&apos;m ready, start speaking</button>
        </div>
      )}

      {/* INTRO note */}
      {phase === "intro" && (
        <div className="absolute inset-x-0 bottom-10 z-10 text-center text-indigo-100/80" role="status">Your audience is settling in…</div>
      )}

      {/* LIVE */}
      {phase === "live" && (
        <>
          <div className="absolute inset-x-0 top-16 z-10 flex flex-col items-center gap-2 px-3 md:top-20">
            {topic && <p className="max-w-xl rounded-2xl border border-white/15 bg-black/55 px-4 py-2 text-center text-sm font-bold backdrop-blur md:text-base">{topic}</p>}
            <div className="flex flex-wrap items-center justify-center gap-2 text-sm font-bold" aria-live="off">
              <span className="flex items-center gap-2 rounded-full bg-rose-600 px-3 py-1.5"><span className="rec-pulse h-2.5 w-2.5 rounded-full bg-white" /> {mode === "challenge" ? "SPEAK NOW" : "LIVE"} · {fmtTime(timeShown)}</span>
              <span className={`rounded-full px-3 py-1.5 backdrop-blur ${hud.wpm === 0 ? "bg-black/50" : liveWpmOk ? "bg-emerald-500/30 text-emerald-200" : "bg-amber-500/30 text-amber-100"}`}>
                {hud.wpm ? `${hud.wpm} WPM` : "– WPM"}{hud.wpm > 160 ? " · slow down" : hud.wpm && hud.wpm < 110 ? " · pick it up" : ""}
              </span>
              <span className="rounded-full bg-black/50 px-3 py-1.5 backdrop-blur">Fillers: {hud.fillers}</span>
              {useCamera && pose.status !== "off" && (
                <span className="rounded-full bg-black/50 px-3 py-1.5 backdrop-blur">
                  {pose.status === "loading" ? "Camera starting…" : pose.status === "error" ? "Camera unavailable" : pose.personVisible ? "You're in frame" : "Step into frame"}
                </span>
              )}
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 z-10 space-y-3 bg-gradient-to-t from-black/85 via-black/50 to-transparent p-3 pt-16 md:p-6">
            {issueText && <ErrorBanner>{issueText}</ErrorBanner>}
            {note && <InfoBanner>{note}</InfoBanner>}
            {mode === "public" && !qaRef.current && <p className="text-center text-xs text-indigo-100/60">Finish by saying &ldquo;thank you&rdquo; and your audience will ask questions.</p>}

            {capture.manual ? (
              <div>
                <label htmlFor="typed" className="mb-1 block text-xs font-semibold text-indigo-200/70">Type or paste what you&apos;re saying</label>
                <textarea id="typed" className="field min-h-24" value={capture.transcript} onChange={(e) => capture.setManualText(e.target.value)} placeholder="Speak out loud while typing a summary of what you say…" />
              </div>
            ) : (
              <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-center backdrop-blur" aria-live="polite" aria-label="Live transcript">
                <p className="line-clamp-3 min-h-[1.5rem] text-base text-indigo-50/90 md:text-lg">
                  {capture.transcript ? `…${capture.transcript.slice(-180)}` : <span className="text-indigo-100/50">Listening. Start speaking whenever you&apos;re ready.</span>}
                </p>
              </div>
            )}

            <div className="mx-auto flex max-w-2xl items-center gap-4">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(capture.level * 100)}>
                <div className="h-full rounded-full bg-emerald-400 transition-[width] duration-100" style={{ width: `${Math.round(capture.level * 100)}%` }} />
              </div>
              <button className="btn btn-danger min-h-14 px-7 text-base" onClick={() => finish(false)}>
                ■ {isConversation ? "End & get feedback" : "Finish & get feedback"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ANALYZING */}
      {phase === "analyzing" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 p-6 text-center" role="status">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-indigo-400/30 border-t-indigo-300" />
          <h1 className="text-2xl font-extrabold">Your coach is reading your talk…</h1>
          <p className="max-w-sm text-indigo-100/70">Measuring pace and pauses, then asking Groq for personalised feedback.</p>
        </div>
      )}

      {/* ERROR */}
      {phase === "error" && pending && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-5">
          <div className="card max-w-md space-y-4 p-6">
            <h1 className="text-2xl font-extrabold">Couldn&apos;t reach your AI coach</h1>
            <ErrorBanner>{analysisError}</ErrorBanner>
            <p className="text-sm text-indigo-100/70">Your speech is safe. Try again, or continue with built-in feedback based on your measured numbers.</p>
            <div className="flex flex-wrap gap-3">
              <button className="btn btn-primary" onClick={() => analyze(pending)}>Try again</button>
              <button className="btn btn-ghost" onClick={() => save(pending, null)}>Continue without AI</button>
            </div>
          </div>
        </div>
      )}

      {/* EMPTY */}
      {phase === "empty" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-5">
          <div className="card max-w-md space-y-4 p-6 text-center">
            <h1 className="text-2xl font-extrabold">We barely heard anything</h1>
            <p className="text-indigo-100/75">
              {capture.manual
                ? "There wasn't enough text to coach. Type or paste a longer transcript next time."
                : "Not enough speech was transcribed to give useful coaching. Check that the right microphone is selected, speak a bit louder, and try a slightly longer talk (at least 15 seconds)."}
            </p>
            <div className="flex justify-center gap-3">
              <button className="btn btn-primary" onClick={() => window.location.reload()}>Try again</button>
              <button className="btn btn-ghost" onClick={() => router.push("/app")}>Dashboard</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
