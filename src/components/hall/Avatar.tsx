"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import type { Personality } from "@/lib/types";

export interface Reaction {
  positive: boolean;
  /** changes on every new reaction so the same value can re-trigger */
  t: number;
}

interface Props {
  person: Personality;
  position: [number, number, number];
  lookAt: [number, number, number];
  speaking: boolean;
  reaction?: Reaction;
}

// Maps personality ID directly to the anime character VRM from X G.I.R.L.S
const VRM_MAP: Record<number, string> = {
  0: "/models/AvatarSample_B.vrm", // Hana 🌸
  1: "/models/AvatarSample_C.vrm", // Kira ⚡
  2: "/models/AvatarSample_A.vrm", // Sora ☁️
  3: "/models/Unagirl.vrm",        // Una 🌙
  4: "/models/AvatarSample_A.vrm", // Priya (Sora base)
  5: "/models/AvatarSample_B.vrm", // Sam (Hana base)
};

/**
 * Applies natural standing idle posture and friendly waving animation.
 * Characters wave "hi" one at a time in sequence every few seconds.
 */
function applyStandingPose(
  vrm: VRM,
  time: number,
  active: boolean,
  positive: boolean,
  speaking: boolean,
  personId: number
) {
  const hum = vrm.humanoid;
  if (!hum) return;

  const bone = (n: Parameters<typeof hum.getNormalizedBoneNode>[0]) => hum.getNormalizedBoneNode(n);
  const set = (n: Parameters<typeof hum.getNormalizedBoneNode>[0], x: number, y: number, z: number) => {
    const b = bone(n);
    if (b) b.rotation.set(x, y, z);
  };

  // ─── 1. LEGS: Standing upright with slight natural balance ───
  set("leftUpperLeg", 0, 0, -0.04);
  set("rightUpperLeg", 0, 0, 0.04);
  set("leftLowerLeg", 0, 0, 0);
  set("rightLowerLeg", 0, 0, 0);
  set("leftFoot", 0, 0, 0);
  set("rightFoot", 0, 0, 0);

  // ─── 2. SPINE & BREATHING ───
  const breath = Math.sin(time * 1.6) * 0.01;
  const sway = Math.sin(time * 0.8 + personId) * 0.015;
  set("spine", breath, sway * 0.3, 0);
  set("chest", breath * 0.8, sway * 0.2, 0);

  // ─── 3. LEFT ARM: Natural relaxed resting posture at side ───
  set("leftUpperArm", 0.08, 0, 1.25);
  set("leftLowerArm", 0, 0.15, 0.1);

  // ─── 4. RIGHT ARM: Idle at side OR waving "hi" one-at-a-time ───
  // Wave cycle: each wave lasts 1.8s, staggered by 2.6s per character ID
  const cyclePeriod = 15.0; // repeats every 15s
  const staggerOffset = personId * 2.5; // one character waves at a time
  const tCycle = (time + staggerOffset) % cyclePeriod;
  const isWaving = tCycle < 1.8;

  let waveEnvelope = 0;
  if (isWaving) {
    // Smooth bell-curve envelope: 0 -> 1 -> 0 over 1.8 seconds
    waveEnvelope = Math.sin((tCycle / 1.8) * Math.PI);
  }

  // Right upper arm: interpolate from relaxed side (Z = -1.25) to raised wave (Z = -2.35, X = -0.3)
  const armX = THREE.MathUtils.lerp(0.08, -0.32, waveEnvelope);
  const armY = THREE.MathUtils.lerp(0, 0.18, waveEnvelope);
  const armZ = THREE.MathUtils.lerp(-1.25, -2.35, waveEnvelope);
  set("rightUpperArm", armX, armY, armZ);

  // Right forearm: bent upward with rapid cute waving oscillation
  const waveFlutter = Math.sin(time * 13) * 0.32 * waveEnvelope;
  const foreX = THREE.MathUtils.lerp(0, 0.05, waveEnvelope);
  const foreY = THREE.MathUtils.lerp(-0.15, -0.55 + waveFlutter, waveEnvelope);
  const foreZ = THREE.MathUtils.lerp(-0.1, -1.15, waveEnvelope);
  set("rightLowerArm", foreX, foreY, foreZ);

  // ─── 5. HEAD & NECK: Looking forward, nodding, or tilting during wave ───
  let pitch = Math.sin(time * 0.9) * 0.02;
  let yaw = Math.sin(time * 0.5) * 0.035;
  let roll = 0;

  if (isWaving) {
    roll += 0.12 * waveEnvelope; // Playful anime head tilt while waving
    pitch += 0.04 * waveEnvelope;
  }

  if (active) {
    if (positive) {
      pitch += Math.sin(time * 8.5) * 0.13; // Enthusiastic agreement nod
    } else {
      yaw += (personId % 2 === 0 ? 0.22 : -0.22); // Pondering tilt
      roll += 0.07;
    }
  }

  if (speaking) {
    pitch += Math.sin(time * 6.5) * 0.025; // Subtle speech nod
  }

  const neck = bone("neck");
  if (neck) neck.rotation.set(pitch * 0.6, yaw * 0.6, roll * 0.6);
  const head = bone("head");
  if (head) head.rotation.set(pitch * 0.4, yaw * 0.4, roll * 0.4);
}

/**
 * 3D Anime Audience Member:
 * Stands on the floor in a relaxed idle pose with periodic staggered "hi" waves.
 * Zero chairs, zero clipping, fully animated.
 */
export function Avatar({ person, position, lookAt, speaking, reaction }: Props) {
  const root = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const seen = useRef({ t: -1, start: -10, positive: true });
  const phase = useMemo(() => Math.random() * 10, []);
  const [vrm, setVrm] = useState<VRM | null>(null);

  const vrmSrc = VRM_MAP[person.id] || "/models/AvatarSample_B.vrm";

  const haloMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#4ade80", transparent: true, opacity: 0, side: THREE.DoubleSide }),
    []
  );

  // Load the 3D Anime VRM Model
  useEffect(() => {
    let disposed = false;
    const loader = new GLTFLoader();
    loader.register((p) => new VRMLoaderPlugin(p));

    loader.load(
      vrmSrc,
      (gltf) => {
        if (disposed) return;
        const v = gltf.userData.vrm as VRM;
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.rotateVRM0(v);

        // Ensure character faces forward toward speaker stage (+Z)
        if (Math.abs(v.scene.rotation.y) < 0.01) {
          v.scene.rotation.y = Math.PI;
        }

        v.scene.traverse((o) => (o.frustumCulled = false));

        // Disable automatic lookAt eye bone update to eliminate eye twitch
        if (v.lookAt) {
          v.lookAt.autoUpdate = false;
        }

        // Apply standing pose initially
        applyStandingPose(v, 0, false, true, false, person.id);
        v.update(0);

        // Feet placed firmly on the floor at Y = 0
        v.scene.position.set(0, 0, 0);
        v.scene.scale.setScalar(0.95);

        setVrm(v);
      },
      undefined,
      (err) => {
        console.error("Error loading anime VRM for audience:", err);
      }
    );

    return () => {
      disposed = true;
      if (vrm) {
        VRMUtils.deepDispose(vrm.scene);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vrmSrc]);

  useFrame((state, dt) => {
    const time = state.clock.elapsedTime + phase;

    // Reaction triggering
    if (reaction && reaction.t !== seen.current.t) {
      seen.current = { t: reaction.t, start: state.clock.elapsedTime, positive: reaction.positive };
      haloMat.color.set(reaction.positive ? "#4ade80" : "#f87171");
    }
    const since = state.clock.elapsedTime - seen.current.start;
    const active = since >= 0 && since < 2.2;

    // Audience reaction halo on floor
    if (halo.current) {
      const v = active ? Math.sin(Math.min(1, since / 2.2) * Math.PI) : 0;
      haloMat.opacity = 0.55 * v;
      halo.current.scale.setScalar(1 + v * 0.25);
    }

    if (!vrm) return;

    // Enforce standing pose & waving animation every frame
    applyStandingPose(vrm, time, active, seen.current.positive, speaking, person.id);

    // Expressions: Eyes wide open, crisp blink, speech mouth visemes
    const em = vrm.expressionManager;
    if (em) {
      // Big, wide anime eyes without squinting
      em.setValue("surprised", 0.18);
      em.setValue("happy", 0);
      em.setValue("relaxed", 0);
      em.setValue("sad", 0);

      // Clean synchronized blink every ~3.8s
      const blinkCycle = time % 3.8;
      const blink = blinkCycle < 0.14 ? Math.sin((blinkCycle / 0.14) * Math.PI) : 0;
      em.setValue("blink", blink);
      em.setValue("blinkLeft", 0);
      em.setValue("blinkRight", 0);

      // Mouth animation when speaking in the auditorium
      const mouthOpen = speaking ? 0.2 + 0.65 * Math.abs(Math.sin(time * 14) * Math.sin(time * 7.5)) : 0;
      em.setValue("aa", mouthOpen);
      em.setValue("a", mouthOpen);
      em.setValue("ih", mouthOpen * 0.15);
      em.setValue("oh", mouthOpen * 0.2);
    }

    vrm.update(dt);
  });

  return (
    <group ref={root} position={position} onUpdate={(g) => g.lookAt(lookAt[0], position[1], lookAt[2])}>
      {/* Real 3D Anime VRM Model standing on the stage/floor */}
      {vrm && <primitive object={vrm.scene} />}

      {/* Stage spotlight glow ring around feet */}
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.42, 32]} />
        <meshBasicMaterial color={person.color} transparent opacity={0.35} />
      </mesh>

      {/* Reaction halo on floor */}
      <mesh ref={halo} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={haloMat}>
        <ringGeometry args={[0.55, 0.72, 40]} />
      </mesh>
    </group>
  );
}
