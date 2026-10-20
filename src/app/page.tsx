"use client";
import Link from "next/link";
import { useState, useMemo } from "react";
import Hall from "@/components/hall/HallLoader";
import { Logo } from "@/components/Logo";
import { PERSONALITIES } from "@/lib/personalities";
import { COMPANION_LIST, type CompanionCharacter } from "@/lib/companions";
import { useProfile } from "@/lib/storage";

const STEPS = [
  {
    n: "1",
    title: "Choose your anime companion",
    body: "Pick Hana, Kira, Sora, or Una to be your personalized AI buddy. They remember your name and interests.",
  },
  {
    n: "2",
    title: "Speak naturally & have fun",
    body: "Talk using your voice. Your companion listens, cracks jokes, asks about your hobbies, and reacts in 3D.",
  },
  {
    n: "3",
    title: "Real-time speech insights",
    body: "Pace, filler words, pauses, and expression are tracked gently to build your confidence step by step.",
  },
  {
    n: "4",
    title: "Grow together every session",
    body: "Your companion remembers past conversations, refers back to what you like, and levels up with you.",
  },
];

export default function Landing() {
  const profile = useProfile();
  const audience = useMemo(() => PERSONALITIES, []);
  const [activeCompanion, setActiveCompanion] = useState<CompanionCharacter>(COMPANION_LIST[0]);
  const cta = profile
    ? { href: "/app", label: `Continue as ${profile.name}` }
    : { href: "/onboarding", label: "Start your journey" };

  return (
    <main id="main">
      {/* ─── Hero Section with 3D Anime Audience ─── */}
      <section className="relative isolate min-h-[100svh] overflow-hidden">
        <div className="absolute inset-x-0 top-0 -z-10 h-[64svh] md:inset-0 md:h-auto">
          <Hall audience={audience} demo />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#07051a] via-[#07051a]/15 to-[#07051a]/70 md:via-[#07051a]/35 md:to-[#07051a]/85" />
        </div>

        <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Logo className="text-xl" />
          <div className="flex items-center gap-3">
            <Link
              href="/app/companion"
              className="rounded-full border border-pink-500/30 bg-pink-500/10 px-3.5 py-1.5 text-xs font-semibold text-pink-300 backdrop-blur transition hover:bg-pink-500/20"
            >
              Meet Companions 🌸
            </Link>
            <Link href={cta.href} className="btn btn-ghost min-h-10 text-sm">
              {profile ? "Open dashboard" : "Try it now"}
            </Link>
          </div>
        </header>

        <div className="mx-auto flex max-w-6xl flex-col justify-end px-5 pb-16 pt-[44svh] md:pt-[28svh]">
          <p className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-pink-400/25 bg-black/50 px-3.5 py-1 text-xs font-semibold uppercase tracking-widest text-pink-200 backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-pink-400 animate-pulse" /> 3D Anime AI Companions · Voice Coaching
          </p>
          <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.06] tracking-tight md:text-6xl">
            Speaking practice that feels like chatting with your
            <span className="block bg-gradient-to-r from-pink-300 via-purple-300 to-cyan-300 bg-clip-text text-transparent">
              favorite anime companion.
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-indigo-100/80 leading-relaxed">
            Meet Hana, Kira, Sora, and Una — personalized 3D anime AI companions who learn your interests, crack jokes, and make speaking comfortable and fun.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/app/companion" className="btn btn-primary min-h-14 px-8 text-lg shadow-xl shadow-indigo-500/20">
              Chat with Companions 🌸
            </Link>
            <Link href={cta.href} className="btn btn-ghost min-h-14 px-6 text-sm border border-white/10">
              {cta.label} →
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Meet The Anime Characters Section ─── */}
      <section className="mx-auto max-w-6xl px-5 py-16" aria-labelledby="companions-heading">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-pink-400">Featured Anime Companions</span>
          <h2 id="companions-heading" className="text-3xl sm:text-4xl font-extrabold text-white mt-1">
            Pick your personalized speaking partner
          </h2>
          <p className="text-sm text-indigo-100/60 mt-2">
            Each character has their own personality, voice, humor style, and 3D VRM avatar.
          </p>
        </div>

        {/* Character cards grid */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {COMPANION_LIST.map((c) => {
            const isSelected = activeCompanion.id === c.id;
            return (
              <div
                key={c.id}
                onClick={() => setActiveCompanion(c)}
                className={`card p-6 flex flex-col justify-between transition-all duration-300 cursor-pointer group hover:-translate-y-1 ${
                  isSelected ? "shadow-2xl" : "hover:border-white/20"
                }`}
                style={{
                  borderColor: isSelected ? `${c.accent}99` : undefined,
                  background: isSelected
                    ? `linear-gradient(135deg, ${c.accent}18, rgba(255,255,255,0.03))`
                    : undefined,
                  boxShadow: isSelected ? `0 8px 30px ${c.accent}33` : undefined,
                }}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-4xl filter drop-shadow">{c.emoji}</span>
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border"
                      style={{
                        color: c.accent,
                        borderColor: `${c.accent}44`,
                        background: `${c.accent}14`,
                      }}
                    >
                      3D VRM
                    </span>
                  </div>
                  <h3 className="text-xl font-extrabold text-white group-hover:text-white transition flex items-center gap-1.5">
                    {c.name}
                  </h3>
                  <p className="text-xs font-semibold mt-0.5" style={{ color: c.accent }}>
                    {c.role}
                  </p>
                  <p className="text-xs text-indigo-100/70 mt-3 line-clamp-3 leading-relaxed">
                    {c.tagline}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
                  <span className="text-[11px] text-white/50">Personalized AI</span>
                  <Link
                    href={`/app/companion`}
                    className="text-xs font-bold transition flex items-center gap-1 group-hover:translate-x-1"
                    style={{ color: c.accent }}
                  >
                    Chat now →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* Highlight quote banner */}
        <div
          className="mt-8 rounded-3xl p-6 sm:p-8 border flex flex-col sm:flex-row items-center gap-6 backdrop-blur"
          style={{
            borderColor: `${activeCompanion.accent}44`,
            background: `radial-gradient(ellipse at 30% 50%, ${activeCompanion.accent}1a, rgba(12,9,34,0.85))`,
          }}
        >
          <div
            className="flex-shrink-0 h-16 w-16 rounded-2xl flex items-center justify-center text-3xl shadow-lg"
            style={{ background: `${activeCompanion.accent}26`, border: `1px solid ${activeCompanion.accent}55` }}
          >
            {activeCompanion.emoji}
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: activeCompanion.accent }}>
              About {activeCompanion.name}
            </span>
            <p className="text-sm sm:text-base text-white/90 font-medium mt-1">
              &ldquo;{activeCompanion.tagline}&rdquo;
            </p>
            <p className="text-xs text-white/55 mt-1.5">
              Learns your favorite topics · Cracks funny jokes · Dynamic 3D face & voice
            </p>
          </div>
          <Link
            href="/app/companion"
            className="btn min-h-12 px-6 font-bold text-white rounded-xl shadow-lg hover:scale-105 active:scale-95 transition"
            style={{ background: activeCompanion.accent }}
          >
            Start Chatting →
          </Link>
        </div>
      </section>

      {/* ─── How It Works Section ─── */}
      <section className="mx-auto max-w-6xl px-5 py-16" aria-labelledby="how">
        <h2 id="how" className="mb-8 text-2xl font-extrabold md:text-3xl text-center sm:text-left">
          Practice → Connect → Improve → Level Up
        </h2>
        <ol className="grid gap-4 md:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.n} className="card p-5">
              <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/25 font-extrabold text-indigo-200">
                {s.n}
              </span>
              <h3 className="mb-1 font-bold">{s.title}</h3>
              <p className="text-sm text-indigo-100/70">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
