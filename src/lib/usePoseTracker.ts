"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BodyMetrics } from "./types";

interface Pt { x: number; y: number }
type Landmark = Pt & { visibility?: number };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const inverseLerp = (a: number, b: number, v: number) => (b === a ? 0 : clamp01((v - a) / (b - a)));

function variance(points: Pt[]) {
  if (points.length < 2) return 0;
  const mx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const my = points.reduce((s, p) => s + p.y, 0) / points.length;
  return points.reduce((s, p) => s + (p.x - mx) ** 2 + (p.y - my) ** 2, 0) / points.length;
}

/**
 * Body-language heuristics ported from the iOS BodyLanguageAnalyzer (same joints, same bands),
 * fed by MediaPipe Pose instead of Apple Vision. Scores are averaged across the whole session.
 * Video never leaves the browser.
 */
export function usePoseTracker() {
  const [status, setStatus] = useState<"off" | "loading" | "on" | "error">("off");
  const [personVisible, setPersonVisible] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const landmarkerRef = useRef<{ detectForVideo: (v: HTMLVideoElement, t: number) => { landmarks: Landmark[][] }; close: () => void } | null>(null);

  const acc = useRef({ posture: 0, head: 0, gesture: 0, n: 0, gestureN: 0 });
  const headHist = useRef<Pt[]>([]);
  const handHist = useRef<Pt[]>([]);
  const lastRun = useRef(0);

  const consume = useCallback((lm: Landmark[]) => {
    const nose = lm[0], ls = lm[11], rs = lm[12];
    if (!nose || !ls || !rs || (ls.visibility ?? 1) < 0.4 || (rs.visibility ?? 1) < 0.4) {
      setPersonVisible(false);
      return;
    }
    setPersonVisible(true);
    const mid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };

    // Posture proxy from shoulder tilt + how centred the head is over the shoulders
    const tilt = Math.abs((Math.atan2(rs.y - ls.y, rs.x - ls.x) * 180) / Math.PI);
    const tiltScore = clamp01(1 - inverseLerp(5, 20, Math.min(tilt, 180 - tilt)));
    const centered = clamp01(1 - inverseLerp(0.03, 0.12, Math.abs(nose.x - mid.x)));
    const posture = 0.5 * tiltScore + 0.5 * centered;

    headHist.current.push({ x: nose.x, y: nose.y });
    if (headHist.current.length > 8) headHist.current.shift();
    const head = clamp01(1 - inverseLerp(0.0003, 0.01, variance(headHist.current)));

    const wrists = [lm[15], lm[16]].filter((w) => w && (w.visibility ?? 1) > 0.4);
    let gesture: number | null = null;
    if (wrists.length) {
      const active = wrists.reduce((a, b) => (Math.hypot(a.x - mid.x, a.y - mid.y) > Math.hypot(b.x - mid.x, b.y - mid.y) ? a : b));
      handHist.current.push({ x: active.x, y: active.y });
      if (handHist.current.length > 8) handHist.current.shift();
      const band = inverseLerp(0.0005, 0.02, variance(handHist.current));
      gesture = clamp01(1 - Math.abs(band - 0.5) * 2);
    }

    const a = acc.current;
    a.posture += posture;
    a.head += head;
    a.n++;
    if (gesture !== null) {
      a.gesture += gesture;
      a.gestureN++;
    }
  }, []);

  const loop = useCallback(() => {
    const video = videoRef.current;
    const lmk = landmarkerRef.current;
    if (video && lmk && video.readyState >= 2) {
      const now = performance.now();
      if (now - lastRun.current > 100) {
        lastRun.current = now;
        try {
          const res = lmk.detectForVideo(video, now);
          if (res.landmarks[0]) consume(res.landmarks[0]);
          else setPersonVisible(false);
        } catch {
          /* transient frame error */
        }
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [consume]);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setPersonVisible(false);
    setStatus("off");
  }, []);

  const start = useCallback(async () => {
    setStatus("loading");
    acc.current = { posture: 0, head: 0, gesture: 0, n: 0, gestureN: 0 };
    headHist.current = [];
    handHist.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("no video element");
      video.srcObject = stream;
      await video.play();

      const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      landmarkerRef.current = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: "/mediapipe/pose_landmarker_lite.task", delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
      });
      setStatus("on");
      rafRef.current = requestAnimationFrame(loop);
    } catch {
      stop();
      setStatus("error");
    }
  }, [loop, stop]);

  const reset = useCallback(() => {
    acc.current = { posture: 0, head: 0, gesture: 0, n: 0, gestureN: 0 };
    headHist.current = [];
    handHist.current = [];
  }, []);

  const getMetrics = useCallback((): BodyMetrics | null => {
    const a = acc.current;
    if (a.n < 15) return null; // ~1.5s of real detections, otherwise "no signal" rather than a fabricated score
    return {
      posture: a.posture / a.n,
      headStability: a.head / a.n,
      gestures: a.gestureN ? a.gesture / a.gestureN : 0.5,
      framesSeen: a.n,
    };
  }, []);

  useEffect(() => stop, [stop]);

  return { videoRef, status, personVisible, start, stop, reset, getMetrics };
}
