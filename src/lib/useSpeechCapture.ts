"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/* Minimal typings for the Web Speech API (not in lib.dom for all TS versions) */
interface SRAlternative { transcript: string }
interface SRResult { isFinal: boolean; 0: SRAlternative; length: number }
interface SREvent { resultIndex: number; results: ArrayLike<SRResult> }
interface SRErrorEvent { error: string }
interface SRInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SRCtor = new () => SRInstance;

const PAUSE_GAP_SEC = 1.5;

export type CaptureIssue = "denied" | "no-mic" | "no-speech-api" | "network" | "failed" | null;

export interface CaptureResult {
  transcript: string;
  audioUrl: string | null;
  activeSec: number;
  pauses: number[];
}

function getSR(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function issueMessage(issue: CaptureIssue): string | null {
  switch (issue) {
    case "denied":
      return "Microphone access was blocked. Click the lock icon in your address bar, allow the microphone, then try again.";
    case "no-mic":
      return "No microphone was found. Plug one in or check your system sound settings.";
    case "no-speech-api":
      return "This browser has no live speech recognition (Chrome, Edge and Safari do). You can type or paste what you say instead, and the timer and coaching still work.";
    case "network":
      return "The browser's speech service could not be reached, so live transcription paused. You can keep speaking and type the transcript, or retry.";
    case "failed":
      return "Recording failed to start. Reload the page and try again.";
    default:
      return null;
  }
}

/**
 * Microphone + live transcription + audio level + pause/active-time tracking.
 * Falls back to a "manual transcript" mode when the Web Speech API is missing or fails.
 */
export function useSpeechCapture() {
  const supported = typeof window !== "undefined" ? getSR() !== null : true;
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [issue, setIssue] = useState<CaptureIssue>(null);
  const [level, setLevel] = useState(0);
  const [manual, setManual] = useState(false);

  const recRef = useRef<SRInstance | null>(null);
  const wantRef = useRef(false); // we want recognition running
  const heldRef = useRef(false); // temporarily paused (audience speaking)
  const committedRef = useRef("");
  const instanceRef = useRef({ finals: "", interim: "" });
  const transcriptRef = useRef("");
  const lastChangeRef = useRef(0);
  const gapStartRef = useRef<number | null>(null);
  const activeSecRef = useRef(0);
  const pausesRef = useRef<number[]>([]);
  const turnStartRef = useRef(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef = useRef(0);

  const publish = useCallback(() => {
    const inst = instanceRef.current;
    const text = [committedRef.current, inst.finals, inst.interim].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (text !== transcriptRef.current) {
      const now = performance.now() / 1000;
      if (gapStartRef.current !== null && transcriptRef.current) {
        const gap = now - gapStartRef.current;
        if (gap >= PAUSE_GAP_SEC) pausesRef.current.push(gap);
      }
      gapStartRef.current = now;
      lastChangeRef.current = now;
      transcriptRef.current = text;
      setTranscript(text);
    }
  }, []);

  const startRecognition = useCallback(() => {
    const SR = getSR();
    if (!SR || !wantRef.current || heldRef.current || recRef.current) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    instanceRef.current = { finals: "", interim: "" };

    rec.onresult = (e) => {
      let finals = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finals += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      instanceRef.current = { finals: finals.trim(), interim: interim.trim() };
      publish();
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        wantRef.current = false;
        setIssue("denied");
      } else if (e.error === "audio-capture") {
        wantRef.current = false;
        setIssue("no-mic");
      } else if (e.error === "network") {
        wantRef.current = false;
        setIssue("network");
        setManual(true);
      }
    };
    rec.onend = () => {
      // Recognition ends on its own after silence; bank its text and restart.
      const inst = instanceRef.current;
      committedRef.current = [committedRef.current, inst.finals, inst.interim].filter(Boolean).join(" ");
      instanceRef.current = { finals: "", interim: "" };
      recRef.current = null;
      if (wantRef.current && !heldRef.current) setTimeout(startRecognition, 150);
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      /* already started */
    }
  }, [publish]);

  /** Fold the running recognition instance into the committed text, then detach it. */
  const stopRecognition = useCallback(() => {
    const inst = instanceRef.current;
    committedRef.current = [committedRef.current, inst.finals, inst.interim].filter(Boolean).join(" ");
    instanceRef.current = { finals: "", interim: "" };
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      rec.onresult = null;
      rec.onend = null;
      rec.onerror = null;
      try {
        rec.abort();
      } catch {
        /* noop */
      }
    }
    publish();
  }, [publish]);

  const cleanupAudio = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    setLevel(0);
  }, []);

  const beginClock = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    const buf = new Uint8Array(256);
    lastTickRef.current = performance.now();
    tickRef.current = setInterval(() => {
      const now = performance.now();
      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      if (!heldRef.current) activeSecRef.current += dt;
      const an = analyserRef.current;
      if (an) {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 5));
      }
    }, 100);
  }, []);

  /** Ask for the mic. Resolves true when recording started. */
  const start = useCallback(async (): Promise<boolean> => {
    setIssue(null);
    committedRef.current = "";
    instanceRef.current = { finals: "", interim: "" };
    transcriptRef.current = "";
    setTranscript("");
    activeSecRef.current = 0;
    pausesRef.current = [];
    gapStartRef.current = null;
    turnStartRef.current = 0;
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
    } catch (e) {
      const name = (e as DOMException).name;
      setIssue(name === "NotFoundError" || name === "OverconstrainedError" ? "no-mic" : name === "NotAllowedError" ? "denied" : "failed");
      return false;
    }
    const stream = streamRef.current!;

    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
    } catch {
      /* level meter is optional */
    }

    try {
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.start(1000);
      recorderRef.current = rec;
    } catch {
      recorderRef.current = null; // audio playback is optional
    }

    if (getSR()) {
      wantRef.current = true;
      heldRef.current = false;
      startRecognition();
    } else {
      setManual(true);
      setIssue("no-speech-api");
    }

    beginClock();
    setListening(true);
    return true;
  }, [startRecognition, beginClock]);

  const resetCounters = useCallback(() => {
    committedRef.current = "";
    instanceRef.current = { finals: "", interim: "" };
    transcriptRef.current = "";
    setTranscript("");
    activeSecRef.current = 0;
    pausesRef.current = [];
    gapStartRef.current = null;
    turnStartRef.current = 0;
    lastChangeRef.current = performance.now() / 1000;
  }, []);

  /** Typing mode: no microphone, the student types or pastes their transcript. The clock still runs. */
  const startManual = useCallback(() => {
    setIssue(null);
    resetCounters();
    setManual(true);
    heldRef.current = false;
    beginClock();
    setListening(true);
  }, [beginClock, resetCounters]);

  /** Temporarily stop transcribing (e.g. while an audience member talks). */
  const hold = useCallback(() => {
    heldRef.current = true;
    stopRecognition();
    if (recorderRef.current?.state === "recording") recorderRef.current.pause();
  }, [stopRecognition]);

  const release = useCallback(() => {
    heldRef.current = false;
    lastChangeRef.current = performance.now() / 1000;
    gapStartRef.current = null;
    if (recorderRef.current?.state === "paused") recorderRef.current.resume();
    if (wantRef.current) startRecognition();
  }, [startRecognition]);

  const stop = useCallback(async (): Promise<CaptureResult> => {
    wantRef.current = false;
    stopRecognition();
    const recorder = recorderRef.current;
    let audioUrl: string | null = null;
    if (recorder && recorder.state !== "inactive") {
      audioUrl = await new Promise<string | null>((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          resolve(blob.size ? URL.createObjectURL(blob) : null);
        };
        recorder.stop();
      });
    }
    recorderRef.current = null;
    cleanupAudio();
    setListening(false);
    await new Promise((r) => setTimeout(r, 120)); // let the final recognition result land
    return {
      transcript: transcriptRef.current,
      audioUrl,
      activeSec: activeSecRef.current,
      pauses: [...pausesRef.current],
    };
  }, [stopRecognition, cleanupAudio]);

  /** Typed/pasted transcript when live recognition is unavailable */
  const setManualText = useCallback((text: string) => {
    committedRef.current = text;
    instanceRef.current = { finals: "", interim: "" };
    transcriptRef.current = text;
    lastChangeRef.current = performance.now() / 1000;
    setTranscript(text);
  }, []);

  useEffect(
    () => () => {
      wantRef.current = false;
      recRef.current?.abort();
      recorderRef.current?.state !== "inactive" && recorderRef.current?.stop();
      cleanupAudio();
    },
    [cleanupAudio],
  );

  return {
    supported,
    listening,
    transcript,
    issue,
    level,
    manual,
    start,
    stop,
    hold,
    release,
    startManual,
    resetCounters,
    setManualText,
    /** text spoken since the last markTurn() */
    turnText: () => transcriptRef.current.slice(turnStartRef.current).trim(),
    markTurn: () => {
      turnStartRef.current = transcriptRef.current.length;
    },
    secondsSinceChange: () => performance.now() / 1000 - lastChangeRef.current,
    resetSilenceClock: () => {
      lastChangeRef.current = performance.now() / 1000;
    },
    activeSeconds: () => activeSecRef.current,
    snapshot: () => ({ transcript: transcriptRef.current, activeSec: activeSecRef.current, pauses: [...pausesRef.current] }),
  };
}
