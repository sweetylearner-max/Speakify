"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import { voiceBus } from "@/lib/voiceBus";

export type Mood = "neutral" | "happy" | "thinking" | "concerned" | "excited";

// Wide-open eyes configurations (using surprised for large, clear anime eyes; ZERO squinting)
const MOOD_EYES: Record<Mood, number> = {
  neutral: 0.12,
  happy: 0.22,
  thinking: 0.12,
  concerned: 0.08,
  excited: 0.35,
};

type Props = {
  src: string;
  mood?: Mood;
  speaking?: boolean;
  accent?: string;
  framing?: "bust" | "upper" | "full";
  className?: string;
  idleIntensity?: number;
};

/**
 * High-fidelity WebGL VRM avatar renderer:
 * - Eyes wide open with zero squinting
 * - Stable, jitter-free eye tracking (no gimbal singularity twitch)
 * - Smooth synchronized eyelid blinking
 * - Dynamic mouth viseme animation synced with live speech
 */
export default function VrmAvatar({
  src,
  mood = "neutral",
  speaking = false,
  accent = "#8b9cff",
  framing = "bust",
  className = "",
  idleIntensity = 1,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef({ mood, speaking });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    live.current = { mood, speaking };
  }, [mood, speaking]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let raf = 0;
    let vrm: VRM | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    setReady(false);
    setError(false);

    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      setError(true);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block;opacity:0;transition:opacity .6s ease";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const fov = framing === "full" ? 32 : framing === "upper" ? 28 : 22;
    const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 20);

    const key = new THREE.DirectionalLight(0xffffff, Math.PI * 1.15);
    key.position.set(0.8, 1.4, 2);
    const rim = new THREE.DirectionalLight(new THREE.Color(accent), Math.PI * 0.75);
    rim.position.set(-1.5, 1.2, -1);
    const fill = new THREE.DirectionalLight(new THREE.Color(accent), Math.PI * 0.35);
    fill.position.set(1.5, 0.5, 1.5);
    scene.add(key, rim, fill, new THREE.HemisphereLight(0xffffff, 0x2a2f55, Math.PI * 0.5));

    const pointer = { x: 0, y: 0 };

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      pointer.x = THREE.MathUtils.clamp(((e.clientX - (r.left + r.width / 2)) / window.innerWidth) * 2.8, -1, 1);
      pointer.y = THREE.MathUtils.clamp(((e.clientY - (r.top + r.height / 3)) / window.innerHeight) * 2.8, -1, 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer!.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.01 });
    io.observe(el);

    let baseRotY = Math.PI;

    const loader = new GLTFLoader();
    loader.register((p) => new VRMLoaderPlugin(p));
    loader
      .loadAsync(src)
      .then((gltf) => {
        if (disposed) return;
        vrm = gltf.userData.vrm as VRM;
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.rotateVRM0(vrm);

        // Ensure models face forward towards user camera (+Z)
        if (Math.abs(vrm.scene.rotation.y) < 0.01) {
          vrm.scene.rotation.y = Math.PI;
        }
        baseRotY = vrm.scene.rotation.y;
        vrm.scene.traverse((o) => (o.frustumCulled = false));

        // Disable VRMLookAt auto-update to eliminate eye twitch / gimbal singularity flutter
        if (vrm.lookAt) {
          vrm.lookAt.autoUpdate = false;
        }

        scene.add(vrm.scene);

        const h = vrm.humanoid;
        const bone = (n: Parameters<typeof h.getNormalizedBoneNode>[0]) => h.getNormalizedBoneNode(n);
        const set = (n: Parameters<typeof h.getNormalizedBoneNode>[0], x: number, y: number, z: number) =>
          bone(n)?.rotation.set(x, y, z);

        // Natural relaxed anime arm pose
        set("leftUpperArm", 0, 0, 1.25);
        set("rightUpperArm", 0, 0, -1.25);
        set("leftLowerArm", 0, 0, 0.12);
        set("rightLowerArm", 0, 0, -0.12);
        vrm.update(0);

        const headVec = new THREE.Vector3();
        bone("head")?.getWorldPosition(headVec);
        const headY = headVec.y || 1.4;
        let targetY: number, dist: number;
        if (framing === "full") {
          targetY = headY * 0.4;
          dist = 3.1;
        } else if (framing === "upper") {
          targetY = headY - 0.3;
          dist = 2.1;
        } else {
          targetY = headY - 0.18;
          dist = 1.75;
        }
        camera.position.set(0, targetY + 0.02, dist);
        camera.lookAt(0, targetY, 0);

        setReady(true);
        renderer!.domElement.style.opacity = "1";
      })
      .catch(() => {
        if (!disposed) setError(true);
      });

    let last = performance.now();
    let t = 0;
    const expr = { surprised: 0.15, blink: 0, mouth: 0 };
    let nextBlink = 2.2;
    let blinkT = -1;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      t += dt;
      if (!vrm || !visible) return;

      const { mood: m, speaking: talk } = live.current;
      const isActuallySpeaking = talk || voiceBus.speaking;

      // ─── 1. EYES: Keep wide open, never squint ───
      const eyeGoal = MOOD_EYES[m] ?? 0.15;
      const k = 1 - Math.exp(-dt * 8);
      expr.surprised += (eyeGoal - expr.surprised) * k;

      // ─── 2. BLINK: Clean, synchronized, crisp blink ───
      if (t > nextBlink && blinkT < 0) {
        blinkT = 0;
      }
      if (blinkT >= 0) {
        blinkT += dt;
        const blinkDuration = 0.14; // fast, crisp 140ms anime blink
        const p = blinkT / blinkDuration;
        if (p < 1) {
          expr.blink = Math.sin(p * Math.PI);
        } else {
          expr.blink = 0;
          blinkT = -1;
          nextBlink = t + 2.8 + Math.random() * 2.8;
        }
      }

      // ─── 3. MOUTH: Rhythmic syllable animation with voice amplitude ───
      let targetMouth = 0;
      if (isActuallySpeaking) {
        const level = voiceBus.speaking && voiceBus.level > 0.05 ? voiceBus.level : 0.6;
        // Natural speech syllable rhythm (4.8Hz + 9.6Hz harmonics)
        const syllable = Math.max(0, Math.sin(t * 16) * 0.55 + Math.sin(t * 8.5) * 0.45);
        targetMouth = THREE.MathUtils.clamp((0.2 + level * 0.75) * syllable, 0, 0.85);
      }
      expr.mouth += (targetMouth - expr.mouth) * (1 - Math.exp(-dt * 26));

      // ─── Apply to Expression Manager ───
      const em = vrm.expressionManager;
      if (em) {
        // Eyes wide open (surprised increases iris & eye aperture)
        em.setValue("surprised", expr.surprised);

        // Explicitly ZERO out all eyelid-closing and squinting morphs
        em.setValue("happy", 0);
        em.setValue("relaxed", 0);
        em.setValue("sad", 0);

        // Synchronized blinking on both eyes (no one-eye winking)
        em.setValue("blink", expr.blink);
        em.setValue("blinkLeft", 0);
        em.setValue("blinkRight", 0);

        // Mouth visemes (both VRM 1.0 and 0.0 presets)
        em.setValue("aa", expr.mouth);
        em.setValue("a", expr.mouth);
        em.setValue("ih", expr.mouth * 0.15);
        em.setValue("i", expr.mouth * 0.15);
        em.setValue("oh", expr.mouth * 0.2);
        em.setValue("o", expr.mouth * 0.2);
      }

      // ─── 4. NATURAL LIFE & POINTER TRACKING (No Eye Jitter) ───
      const hum = vrm.humanoid;
      const breath = Math.sin(t * 1.6) * idleIntensity;
      const spine = hum.getNormalizedBoneNode("spine");
      if (spine) spine.rotation.x = breath * 0.012;
      const chest = hum.getNormalizedBoneNode("chest");
      if (chest) chest.rotation.x = breath * 0.01;

      // Neck and Head follow pointer smoothly without eye bone jitter
      const neck = hum.getNormalizedBoneNode("neck");
      if (neck) {
        neck.rotation.y = THREE.MathUtils.lerp(neck.rotation.y, -pointer.x * 0.16 + Math.sin(t * 0.5) * 0.02 * idleIntensity, k);
        neck.rotation.x = THREE.MathUtils.lerp(neck.rotation.x, pointer.y * 0.07, k);
      }
      const head = hum.getNormalizedBoneNode("head");
      if (head) {
        const talkBob = isActuallySpeaking ? Math.sin(t * 7.5) * 0.012 : 0;
        head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, -pointer.x * 0.12, k);
        head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, pointer.y * 0.06 + talkBob, k);
      }

      // Gentle body sway
      vrm.scene.rotation.y = baseRotY + Math.sin(t * 0.35) * 0.04 * idleIntensity;

      vrm.update(dt);
      renderer!.render(scene, camera);
    };
    loop();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      ro.disconnect();
      io.disconnect();
      if (vrm) {
        scene.remove(vrm.scene);
        VRMUtils.deepDispose(vrm.scene);
      }
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, [src, accent, framing, idleIntensity]);

  return (
    <div className={className || "relative h-full w-full"}>
      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-white/60" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-4xl">
          🎭
        </div>
      )}
      <div ref={host} className="absolute inset-0" />
    </div>
  );
}
