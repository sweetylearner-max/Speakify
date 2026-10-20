"use client";
import Link from "next/link";
import { MODE_INFO } from "@/lib/insights";
import { audienceFor } from "@/lib/personalities";
import { useProfile } from "@/lib/storage";
import type { SessionMode } from "@/lib/types";

const ORDER: SessionMode[] = ["challenge", "public", "discuss", "debate"];
const META: Record<SessionMode, { time: string; who: (n: number) => string }> = {
  challenge: { time: "1 min prep · 2 min talk", who: () => "Host: Supportive Sam" },
  public: { time: "Your pace · ends with Q&A", who: (n) => `${n} listeners, scored on delivery` },
  discuss: { time: "Open-ended", who: () => "With Curious Cam or Professional Priya" },
  debate: { time: "Open-ended", who: () => "Against Skeptical Sasha" },
};

export default function Practice() {
  const profile = useProfile();
  if (!profile) return null;
  const n = audienceFor(profile.experience).length;

  return (
    <div>
      <h1 className="text-3xl font-extrabold md:text-4xl">Choose a session</h1>
      <p className="mt-1 mb-6 text-indigo-100/70">How would you like to practice today, {profile.name}?</p>
      <div className="grid gap-4 md:grid-cols-2">
        {ORDER.map((m) => (
          <Link key={m} href={`/app/session/${m}`} className="card group relative overflow-hidden p-6 transition hover:-translate-y-1 hover:bg-white/10">
            <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full opacity-25 blur-2xl transition group-hover:opacity-50" style={{ background: MODE_INFO[m].accent }} />
            <h2 className="text-xl font-extrabold">{MODE_INFO[m].title}</h2>
            <p className="mt-1 text-indigo-100/75">{MODE_INFO[m].blurb}</p>
            <p className="mt-4 text-sm font-semibold" style={{ color: MODE_INFO[m].accent === "#6366f1" ? "#a5b4fc" : MODE_INFO[m].accent }}>
              {META[m].time} · {META[m].who(n)}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
