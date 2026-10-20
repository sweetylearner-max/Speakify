"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { fmtTime } from "@/lib/metrics";
import { MODE_INFO, fillerTotals, greeting, improvement, recommend, totalSpeakingSeconds } from "@/lib/insights";
import { addDemoHistory } from "@/lib/demo";
import { useProfile, useSessions } from "@/lib/storage";
import { ScoreChart, Stat } from "@/components/ui";

const CompanionOverlay = dynamic(() => import("@/components/CompanionOverlay"), {
  ssr: false,
  loading: () => (
    <div className="card p-6 flex items-center justify-center text-sm text-indigo-200/60">
      Loading your companion…
    </div>
  ),
});

const GOAL_LABEL = {
  class: "class presentations",
  interview: "interviews",
  speech: "speeches",
  confidence: "speaking confidence",
} as const;

export default function Dashboard() {
  const profile = useProfile();
  const sessions = useSessions();
  if (!profile) return null;

  const rec = recommend(profile, sessions);
  const delta = improvement(sessions);
  const fillers = fillerTotals(sessions);
  const maxFiller = fillers[0]?.[1] ?? 1;
  const best = sessions.reduce((m, s) => Math.max(m, s.scores.overall), 0);
  const info = MODE_INFO[rec.mode];

  return (
    <div className="space-y-6">
      <header className="rise">
        <h1 className="text-3xl font-extrabold md:text-4xl">{greeting(profile.name)}</h1>
        <p className="mt-1 text-indigo-100/70">
          {sessions.length
            ? `You're working on ${GOAL_LABEL[profile.goal]}. ${sessions.length} session${sessions.length > 1 ? "s" : ""} so far.`
            : `Let's get a first baseline for your ${GOAL_LABEL[profile.goal]}. One short talk is all it takes.`}
        </p>
      </header>

      {/* ─── Interactive 3D Companion Overlay on Dashboard ─── */}
      <CompanionOverlay userName={profile.name} sessions={sessions} />

      {/* ─── Practice Recommendation Section ─── */}
      <section className="card rise relative overflow-hidden p-6 md:p-8" style={{ borderColor: `${info.accent}66` }} aria-labelledby="next">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-30 blur-3xl" style={{ background: info.accent }} />
        <p className="text-xs font-bold uppercase tracking-widest text-indigo-200/70">
          {rec.focusLabel ? `Current focus · ${rec.focusLabel}` : "Recommended practice"}
        </p>
        <h2 id="next" className="mt-1 text-2xl font-extrabold md:text-3xl">{info.title}</h2>
        <p className="mt-2 max-w-xl text-indigo-100/80">{rec.why}</p>
        <Link href={`/app/session/${rec.mode}`} className="btn btn-primary mt-5 min-h-14 px-8 text-lg">
          Start now →
        </Link>
      </section>

      {sessions.length === 0 ? (
        <section className="card p-6 text-center">
          <h2 className="text-xl font-extrabold">Your progress will show up here</h2>
          <p className="mx-auto mt-2 max-w-md text-indigo-100/70">
            After each practice you get scores, your most common filler words and a chart of how you improve.
          </p>
          <button className="mt-4 text-sm font-semibold text-indigo-300 underline underline-offset-4" onClick={addDemoHistory}>
            Preview with sample history (removable in Settings)
          </button>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Your numbers">
            <Stat label="Latest score" value={String(sessions[0].scores.overall)} sub={delta === null ? "first session" : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)} vs previous`} />
            <Stat label="Best score" value={String(best)} />
            <Stat label="Speaking time" value={fmtTime(totalSpeakingSeconds(sessions))} sub="minutes:seconds" />
            <Stat label="Latest pace" value={`${sessions[0].metrics.wpm}`} sub="words / min (aim 120-160)" />
          </section>

          <div className="grid gap-6 md:grid-cols-5">
            <section className="card p-5 md:col-span-3" aria-labelledby="hist">
              <h2 id="hist" className="mb-2 font-extrabold">Score history</h2>
              {sessions.length >= 2 ? <ScoreChart sessions={sessions} /> : <p className="py-8 text-center text-indigo-100/60">Do one more session to see your trend.</p>}
            </section>
            <section className="card p-5 md:col-span-2" aria-labelledby="fill">
              <h2 id="fill" className="mb-3 font-extrabold">Your filler words</h2>
              {fillers.length ? (
                <ul className="space-y-3">
                  {fillers.map(([w, n]) => (
                    <li key={w}>
                      <div className="mb-1 flex justify-between text-sm"><span className="font-semibold">&ldquo;{w}&rdquo;</span><span>{n}×</span></div>
                      <div className="h-2 rounded-full bg-white/10"><div className="h-full rounded-full bg-fuchsia-400" style={{ width: `${(n / maxFiller) * 100}%` }} /></div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-indigo-100/70">No filler words detected. Impressive.</p>
              )}
            </section>
          </div>

          <section aria-labelledby="recent">
            <h2 id="recent" className="mb-3 text-xl font-extrabold">Recent sessions</h2>
            <ul className="grid gap-3">
              {sessions.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <Link href={`/app/results/${s.id}`} className="card flex items-center gap-4 p-4 transition hover:bg-white/10">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-extrabold" style={{ background: `${MODE_INFO[s.mode].accent}33`, color: "#fff" }}>{s.scores.overall}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{MODE_INFO[s.mode].title}</span>
                      <span className="block truncate text-sm text-indigo-100/60">{s.topic || "Free talk"} · {s.metrics.wpm} WPM · {s.metrics.fillerCount} fillers</span>
                    </span>
                    <span className="hidden text-sm text-indigo-100/50 sm:block">{new Date(s.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
