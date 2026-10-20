"use client";
import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { Personality } from "@/lib/types";
import { Avatar, type Reaction } from "./Avatar";

const CAMERA: [number, number, number] = [0, 1.6, 2.4];
const TARGET: [number, number, number] = [0, 1.1, -2];

interface HallProps {
  audience: Personality[];
  /** id of the member currently talking */
  speakingId?: number | null;
  /** latest reaction per member id */
  reactions?: Record<number, Reaction>;
  bubble?: { id: number; text: string } | null;
  /** 0..1 live mic level; makes the stage glow pulse */
  level?: number;
  /** hero mode: slow camera sway, occasional automatic reactions */
  demo?: boolean;
  /** single-seat layout for Discuss / Debate */
  focusOne?: boolean;
  interactive?: boolean;
  /** slides a lone avatar sideways (used while a setup card covers the centre) */
  shiftX?: number;
}

function seatLayout(n: number, focusOne: boolean) {
  if (focusOne || n === 1) return [{ pos: [0, 0, -2.3] as [number, number, number] }];
  const span = n <= 4 ? 44 : 56; // degrees each side
  return Array.from({ length: n }, (_, i) => {
    const a = THREE.MathUtils.degToRad(n === 1 ? 0 : -span + (i * 2 * span) / (n - 1));
    const r = 2.9;
    return { pos: [Math.sin(a) * r, 0, -Math.cos(a) * r + 0.4] as [number, number, number] };
  });
}

type Anchors = Record<number, { x: number; y: number; visible: boolean }>;

/** Projects each member's head position to screen pixels every frame (DOM labels read it) */
function AnchorProjector({ audience, seats, anchors }: { audience: Personality[]; seats: { pos: [number, number, number] }[]; anchors: MutableRefObject<Anchors> }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame((state) => {
    audience.forEach((p, i) => {
      const s = seats[i]?.pos ?? [0, 0, -2.3];
      v.set(s[0], 1.72, s[2]).project(state.camera);
      anchors.current[p.id] = { x: ((v.x + 1) / 2) * state.size.width, y: ((1 - v.y) / 2) * state.size.height, visible: v.z < 1 };
    });
  });
  return null;
}

function Overlay({ audience, anchors, bubble }: { audience: Personality[]; anchors: MutableRefObject<Anchors>; bubble?: { id: number; text: string } | null }) {
  const labels = useRef<Record<number, HTMLDivElement | null>>({});
  const bubbleEl = useRef<HTMLDivElement | null>(null);
  const bubbleId = bubble?.id;
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      for (const p of audience) {
        const a = anchors.current[p.id];
        const el = labels.current[p.id];
        if (a && el) {
          el.style.transform = `translate(${a.x}px, ${a.y}px) translate(-50%, -100%)`;
          el.style.opacity = a.visible ? "1" : "0";
        }
      }
      const b = bubbleId !== undefined ? anchors.current[bubbleId] : undefined;
      if (b && bubbleEl.current) bubbleEl.current.style.transform = `translate(${b.x}px, ${b.y - 32}px) translate(-50%, -100%)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [audience, anchors, bubbleId]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {audience.map((p) => (
        <div key={p.id} ref={(el) => { labels.current[p.id] = el; }} className="absolute left-0 top-0 whitespace-nowrap rounded-full border border-white/15 bg-black/55 px-2.5 py-0.5 text-[11px] font-semibold text-white opacity-0 backdrop-blur">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: p.color }} />
          {p.short}
        </div>
      ))}
      {bubble && (
        <div ref={bubbleEl} className="absolute left-0 top-0 w-64 max-w-[80vw] rounded-2xl border border-indigo-300/40 bg-indigo-950/90 px-3.5 py-2.5 text-center text-sm leading-snug text-white shadow-xl shadow-indigo-500/20 backdrop-blur">
          {bubble.text}
        </div>
      )}
    </div>
  );
}

function Rig({ demo }: { demo: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  // Portrait screens: pull back and widen so the whole audience still fits
  useEffect(() => {
    const k = THREE.MathUtils.clamp((1.78 - aspect) / 1.3, 0, 1);
    camera.position.z = CAMERA[2] + k * 3.4;
    camera.fov = 60 + k * 14;
    camera.updateProjectionMatrix();
    camera.lookAt(TARGET[0], TARGET[1], TARGET[2]);
  }, [aspect, camera]);
  useFrame((state) => {
    if (!demo) return;
    const t = state.clock.elapsedTime;
    state.camera.position.x = Math.sin(t * 0.18) * 0.7;
    state.camera.position.y = CAMERA[1] + Math.sin(t * 0.13) * 0.08;
    state.camera.lookAt(TARGET[0], TARGET[1], TARGET[2]);
  });
  return null;
}

function StageGlow({ level }: { level: number }) {
  const ring = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  useFrame(() => {
    const target = 0.25 + level * 0.9;
    if (ring.current) {
      const m = ring.current.material as THREE.MeshBasicMaterial;
      m.opacity = THREE.MathUtils.lerp(m.opacity, target, 0.2);
      ring.current.scale.setScalar(THREE.MathUtils.lerp(ring.current.scale.x, 1 + level * 0.35, 0.2));
    }
    if (light.current) light.current.intensity = THREE.MathUtils.lerp(light.current.intensity, 2 + level * 14, 0.2);
  });
  return (
    <group position={[0, 0.02, 0.6]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.85, 0.95, 64]} />
        <meshBasicMaterial color="#818cf8" transparent opacity={0.3} />
      </mesh>
      <pointLight ref={light} position={[0, 1.2, 0.2]} color="#818cf8" intensity={2} distance={6} />
    </group>
  );
}

function Room() {
  const banners = [-4.2, -1.4, 1.4, 4.2];
  return (
    <group>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[24, 24]} />
        <meshStandardMaterial color="#141127" roughness={0.85} />
      </mesh>
      {/* stage disc where the speaker stands */}
      <mesh position={[0, 0.05, 0.6]} receiveShadow>
        <cylinderGeometry args={[1.5, 1.6, 0.1, 64]} />
        <meshStandardMaterial color="#2b2450" roughness={0.5} metalness={0.2} />
      </mesh>
      {/* back wall */}
      <mesh position={[0, 2.4, -6.2]}>
        <planeGeometry args={[24, 6]} />
        <meshStandardMaterial color="#0d0b1e" roughness={1} />
      </mesh>
      {banners.map((x) => (
        <mesh key={x} position={[x, 2.6, -6.1]}>
          <planeGeometry args={[1.5, 3.6]} />
          <meshStandardMaterial color="#1e1b4b" roughness={0.9} emissive="#312e81" emissiveIntensity={0.12} />
        </mesh>
      ))}
      {/* lectern at the bottom of the view */}
      <group position={[0, 0, 0.85]}>
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[0.7, 1, 0.45]} />
          <meshStandardMaterial color="#3b2f6b" roughness={0.5} />
        </mesh>
        <mesh position={[0.05, 1.12, -0.05]} rotation={[-0.25, 0, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 0.28]} />
          <meshStandardMaterial color="#c7d2fe" metalness={0.8} roughness={0.2} />
        </mesh>
        <mesh position={[0.05, 1.27, -0.09]}>
          <sphereGeometry args={[0.035, 16, 12]} />
          <meshStandardMaterial color="#e0e7ff" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

function Scene({ audience, speakingId, reactions, level = 0, demo, focusOne, interactive, anchors, shiftX = 0 }: HallProps & { anchors: MutableRefObject<Anchors> }) {
  const seats = useMemo(() => seatLayout(audience.length, !!focusOne).map((s) => ({ pos: [s.pos[0] + (focusOne ? shiftX : 0), s.pos[1], s.pos[2]] as [number, number, number] })), [audience.length, focusOne, shiftX]);
  const [demoReactions, setDemoReactions] = useState<Record<number, Reaction>>({});
  const [demoSpeaker, setDemoSpeaker] = useState<number | null>(null);

  useEffect(() => {
    if (!demo) return;
    const id = setInterval(() => {
      const p = audience[Math.floor(Math.random() * audience.length)];
      setDemoReactions((r) => ({ ...r, [p.id]: { positive: Math.random() < p.positiveBias, t: performance.now() } }));
    }, 1800);
    const talk = setInterval(() => {
      setDemoSpeaker((s) => (s === null ? audience[Math.floor(Math.random() * audience.length)].id : null));
    }, 3500);
    return () => {
      clearInterval(id);
      clearInterval(talk);
    };
  }, [demo, audience]);

  const rx = demo ? demoReactions : reactions ?? {};
  const speaker = demo ? demoSpeaker : speakingId;

  return (
    <>
      <color attach="background" args={["#08061a"]} />
      <fog attach="fog" args={["#08061a", 9, 24]} />
      <ambientLight intensity={0.55} color="#a5b4fc" />
      <hemisphereLight args={["#c7d2fe", "#1a1035", 0.5]} />
      <spotLight position={[0, 6, 0]} angle={0.9} penumbra={0.9} intensity={90} color="#fde68a" castShadow target-position={[0, 0, -2.5]} />
      <spotLight position={[-4, 4, 1]} angle={0.6} penumbra={1} intensity={40} color="#818cf8" />
      <spotLight position={[4, 4, 1]} angle={0.6} penumbra={1} intensity={40} color="#f0abfc" />
      <Room />
      <StageGlow level={level} />
      {audience.map((p, i) => (
        <Avatar
          key={p.id}
          person={p}
          position={seats[i]?.pos ?? [0, 0, -2.3]}
          lookAt={[0, 1.2, 1.4]}
          speaking={speaker === p.id}
          reaction={rx[p.id]}
        />
      ))}
      <ContactShadows position={[0, 0.01, -2.2]} opacity={0.5} scale={14} blur={2.4} far={3} />
      <AnchorProjector audience={audience} seats={seats} anchors={anchors} />
      <Rig demo={!!demo} />
      {interactive && (
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          target={TARGET}
          minPolarAngle={Math.PI * 0.38}
          maxPolarAngle={Math.PI * 0.55}
          minAzimuthAngle={-0.9}
          maxAzimuthAngle={0.9}
          rotateSpeed={0.5}
        />
      )}
    </>
  );
}

export default function Hall(props: HallProps) {
  const anchors = useRef<Anchors>({});
  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: CAMERA, fov: 60, near: 0.1, far: 40 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ camera }) => camera.lookAt(...TARGET)}
        aria-label="3D virtual auditorium with your audience"
        role="img"
      >
        <Suspense fallback={null}>
          <Scene {...props} anchors={anchors} />
        </Suspense>
      </Canvas>
      <Overlay audience={props.audience} anchors={anchors} bubble={props.demo ? null : props.bubble} />
    </div>
  );
}
