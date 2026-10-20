"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useMemo } from "react";
import { MetricBar, ScoreRing } from "@/components/ui";
import { getAudio } from "@/lib/audioStash";
import { MODE_INFO } from "@/lib/insights";
import { fillersPer100, fmtTime } from "@/lib/metrics";
import { useProfile, useSessions } from "@/lib/storage";

const FILLER_SPLIT = /\b(um+|uh+|er+|ah+|like|you know|basically|actually|literally|i mean|sort of|kind of)\b/gi;

function paceVerdict(wpm: number) {
  if (wpm > 160) return { text: "A little fast. Listeners need beats to absorb ideas.", tone: "text-amber-300" };
  if (wpm >= 120) return { text: "In the sweet spot for clear, natural speech.", tone: "text-emerald-300" };
  if (wpm >= 100) return { text: "Slightly slow. Fine for complex points, but keep momentum.", tone: "text-amber-300" };
  return { text: "Quite slow. Try finishing sentences with more energy.", tone: "text-rose-300" };
}

export default function Results() {
  const { id } = useParams<{ id: string }>();
  const sessions = useSessions();
  const profile = useProfile();
  const idx = sessions.findIndex((s) => s.id === id);
  const s = sessions[idx];
  const prev = idx >= 0 ? sessions[idx + 1] : undefined;
  const audioUrl = useMemo(() => getAudio(id), [id]);

  if (!profile) return null;
  if (!s) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-2xl font-extrabold">Session not found</h1>
        <p className="mt-2 text-indigo-100/70">It may have been deleted from this device.</p>
        <Link href="/app" className="btn btn-primary mt-5">Back to dashboard</Link>
      </div>
    );
  }

  const m = s.metrics;
  const delta = prev ? s.scores.overall - prev.scores.overall : null;
  const pace = paceVerdict(m.wpm);
  const fillerList = Object.entries(m.fillers).sort((a, b) => b[1] - a[1]);
  const parts = s.transcript.split(FILLER_SPLIT);
  const f = s.feedback;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-200/60">{MODE_INFO[s.mode].title} · {new Date(s.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p>
          <h1 className="text-3xl font-extrabold md:text-4xl">Your results</h1>
        </div>
        <Link href="/app" className="btn btn-ghost min-h-10 text-sm">Dashboard</Link>
      </div>

      {/* overall */}
      <section className="card rise flex flex-col items-center gap-6 p-6 md:flex-row md:p-8" aria-labelledby="overall">
        <ScoreRing value={s.scores.overall} size={168} label="Overall" />
        <div className="flex-1 text-center md:text-left">
          <h2 id="overall" className="text-2xl font-extrabold leading-snug">{f.headline}</h2>
          {delta !== null && (
            <p className={`mt-2 font-semibold ${delta >= 0 ? "text-emerald-300" : "text-amber-300"}`}>
              {delta === 0 ? "Same as your last session." : `${delta > 0 ? "▲ Up" : "▼ Down"} ${Math.abs(delta)} points from your last session (${prev!.scores.overall}).`}
            </p>
          )}
          {s.topic && <p className="mt-1 text-sm text-indigo-100/60">Topic: {s.topic}</p>}
          <span className="mt-3 inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-indigo-200">
            {f.source === "groq" ? "Coaching by Groq AI · delivery numbers measured in your browser" : "Built-in feedback from your measured numbers (AI was unavailable)"}
          </span>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card space-y-4 p-6" aria-labelledby="break">
          <h2 id="break" className="text-lg font-extrabold">Breakdown</h2>
          <MetricBar label="Clarity" value={s.scores.clarity} hint="Pace, filler words, and how clearly your message came across" />
          <MetricBar label="Confidence" value={s.scores.confidence} hint="Flow, pauses and steadiness" />
          <MetricBar label="Engagement" value={s.scores.engagement} hint="How your audience reacted" />
          {s.scores.bodyLanguage !== null ? (
            <MetricBar label="Body language" value={s.scores.bodyLanguage} hint="Posture, head steadiness and gestures from your camera" />
          ) : (
            <p className="text-sm text-indigo-100/50">Body language wasn&apos;t measured. Turn on the camera next time to add it.</p>
          )}
        </section>

        <section className="card p-6" aria-labelledby="nums">
          <h2 id="nums" className="mb-4 text-lg font-extrabold">Measured delivery</h2>
          <dl className="grid grid-cols-2 gap-4">
            <div><dt className="text-xs uppercase tracking-widest text-indigo-200/60">Pace</dt><dd className="text-3xl font-extrabold">{m.wpm}<span className="text-base font-semibold text-indigo-200/70"> WPM</span></dd></div>
            <div><dt className="text-xs uppercase tracking-widest text-indigo-200/60">Filler words</dt><dd className="text-3xl font-extrabold">{m.fillerCount}<span className="text-base font-semibold text-indigo-200/70"> · {fillersPer100(m).toFixed(1)}/100 words</span></dd></div>
            <div><dt className="text-xs uppercase tracking-widest text-indigo-200/60">Speaking time</dt><dd className="text-3xl font-extrabold">{fmtTime(m.durationSec)}</dd></div>
            <div><dt className="text-xs uppercase tracking-widest text-indigo-200/60">Pauses &gt; 1.5s</dt><dd className="text-3xl font-extrabold">{m.pauseCount}<span className="text-base font-semibold text-indigo-200/70"> · longest {m.longestPauseSec}s</span></dd></div>
          </dl>
          <p className={`mt-4 text-sm font-semibold ${pace.tone}`}>{pace.text} Target: 120-160 WPM.</p>
          {fillerList.length > 0 && (
            <p className="mt-2 text-sm text-indigo-100/70">
              Fillers: {fillerList.map(([w, n]) => `"${w}" ×${n}`).join(", ")}
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card p-6" aria-labelledby="good">
          <h2 id="good" className="mb-3 text-lg font-extrabold text-emerald-300">What you did well</h2>
          <ul className="space-y-3">
            {f.strengths.map((t, i) => (
              <li key={i} className="flex gap-3"><span aria-hidden className="mt-0.5 text-emerald-400">✓</span><span>{t}</span></li>
            ))}
          </ul>
        </section>
        <section className="card p-6" aria-labelledby="fix">
          <h2 id="fix" className="mb-3 text-lg font-extrabold text-amber-300">What to fix</h2>
          <ul className="space-y-4">
            {f.improvements.map((t, i) => (
              <li key={i}>
                <p className="font-semibold">{t.issue}</p>
                <p className="mt-0.5 text-indigo-100/75"><span className="font-bold text-indigo-300">Try: </span>{t.fix}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card relative overflow-hidden border-indigo-400/40 p-6 md:p-8" aria-labelledby="next">
        <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-indigo-500/30 blur-3xl" />
        <h2 id="next" className="text-lg font-extrabold">Your next practice</h2>
        <ul className="mt-3 space-y-3">
          {f.nextPractice.map((t, i) => (
            <li key={i} className="rounded-2xl bg-white/5 p-4">
              <p className="font-extrabold">{t.title}</p>
              <p className="text-indigo-100/80">{t.instructions}</p>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href={`/app/session/${s.mode}`} className="btn btn-primary min-h-14 px-8 text-lg">Practice again →</Link>
          <Link href="/app/practice" className="btn btn-ghost min-h-14">Try another session type</Link>
        </div>
      </section>

      {s.qa.length > 0 && (
        <section className="card p-6" aria-labelledby="qa">
          <h2 id="qa" className="mb-3 text-lg font-extrabold">Audience questions</h2>
          <ul className="space-y-2">
            {s.qa.map((q, i) => (
              <li key={i}><span className="font-bold text-indigo-300">{q.member}: </span>{q.question}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-6" aria-labelledby="tr">
        <h2 id="tr" className="mb-3 text-lg font-extrabold">Transcript <span className="text-sm font-normal text-indigo-100/60">(filler words highlighted)</span></h2>
        {audioUrl && (
          <audio controls src={audioUrl} className="mb-4 w-full" aria-label="Playback of your recording">
            Your browser can&apos;t play audio.
          </audio>
        )}
        <p className="leading-relaxed text-indigo-50/90">
          {parts.map((p, i) =>
            i % 2 === 1 ? <mark key={i} className="rounded bg-fuchsia-500/40 px-1 text-white">{p}</mark> : <Fragment key={i}>{p}</Fragment>,
          )}
        </p>
      </section>
    </div>
  );
}
