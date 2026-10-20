"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { saveProfile } from "@/lib/storage";
import type { Experience, Focus, Goal, Profile } from "@/lib/types";

function Choice<T extends string>({
  value, current, onPick, title, hint,
}: { value: T; current: T | null; onPick: (v: T) => void; title: string; hint?: string }) {
  const on = current === value;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={() => onPick(value)}
      className={`w-full rounded-2xl border p-4 text-left transition ${on ? "border-indigo-300 bg-indigo-500/25" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
    >
      <span className="block font-bold">{title}</span>
      {hint && <span className="block text-sm text-indigo-100/65">{hint}</span>}
    </button>
  );
}

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [experience, setExperience] = useState<Experience | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [nerves, setNerves] = useState<Profile["nerves"]>(3);
  const [focus, setFocus] = useState<Focus | null>(null);

  const canNext = step === 0 ? name.trim().length > 0 : step === 1 ? !!experience && !!goal : !!focus;

  function finish() {
    if (!experience || !goal || !focus) return;
    saveProfile({ name: name.trim(), experience, goal, nerves, focus, createdAt: Date.now() });
    router.push("/app");
  }

  return (
    <main id="main" className="mx-auto flex min-h-[100svh] max-w-xl flex-col justify-center px-5 py-10">
      <Logo className="mb-8 text-xl" />
      <div className="mb-6 flex gap-2" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step + 1} aria-label="Onboarding progress">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-indigo-400" : "bg-white/10"}`} />
        ))}
      </div>

      <div className="card rise p-6 md:p-8" key={step}>
        {step === 0 && (
          <form onSubmit={(e) => { e.preventDefault(); if (canNext) setStep(1); }}>
            <h1 className="mb-2 text-3xl font-extrabold">Hi! What should we call you?</h1>
            <p className="mb-6 text-indigo-100/70">Your coach and your audience will use your name.</p>
            <label htmlFor="name" className="sr-only">Your first name</label>
            <input id="name" className="field text-lg" placeholder="First name" value={name} maxLength={24} autoFocus autoComplete="given-name" onChange={(e) => setName(e.target.value)} />
          </form>
        )}

        {step === 1 && (
          <div>
            <h1 className="mb-6 text-3xl font-extrabold">Nice to meet you, {name.trim()}.</h1>
            <fieldset className="mb-6">
              <legend className="mb-2 font-bold">How much have you spoken in public?</legend>
              <div role="radiogroup" className="grid gap-2">
                <Choice value="beginner" current={experience} onPick={setExperience} title="Just starting" hint="A friendly audience of 4 to begin with" />
                <Choice value="some" current={experience} onPick={setExperience} title="A few times" hint="A 5-person audience, including a sceptic" />
                <Choice value="experienced" current={experience} onPick={setExperience} title="Quite a lot" hint="The full 6-person hall, tough crowd included" />
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 font-bold">What are you practicing for?</legend>
              <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
                <Choice value="class" current={goal} onPick={setGoal} title="Class presentations" />
                <Choice value="interview" current={goal} onPick={setGoal} title="Interviews" />
                <Choice value="speech" current={goal} onPick={setGoal} title="Speeches & competitions" />
                <Choice value="confidence" current={goal} onPick={setGoal} title="Just feeling confident" />
              </div>
            </fieldset>
          </div>
        )}

        {step === 2 && (
          <div>
            <h1 className="mb-6 text-3xl font-extrabold">What trips you up most?</h1>
            <fieldset className="mb-6">
              <legend className="sr-only">Main challenge</legend>
              <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
                <Choice value="nerves" current={focus} onPick={setFocus} title="Nerves" />
                <Choice value="fillers" current={focus} onPick={setFocus} title="Um, like, you know…" hint="Filler words" />
                <Choice value="pace" current={focus} onPick={setFocus} title="Speaking too fast or slow" />
                <Choice value="structure" current={focus} onPick={setFocus} title="Organizing my ideas" />
                <Choice value="eyecontact" current={focus} onPick={setFocus} title="Body language & presence" />
              </div>
            </fieldset>
            <label htmlFor="nerves" className="mb-2 block font-bold">
              How nervous do you feel before speaking? <span className="text-indigo-300">{nerves}/5</span>
            </label>
            <input id="nerves" type="range" min={1} max={5} value={nerves} onChange={(e) => setNerves(Number(e.target.value) as Profile["nerves"])} className="w-full accent-indigo-400" />
            <div className="flex justify-between text-xs text-indigo-100/60"><span>Calm</span><span>Terrified</span></div>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between">
          <button className="btn btn-ghost" onClick={() => (step === 0 ? router.push("/") : setStep(step - 1))}>Back</button>
          {step < 2 ? (
            <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Next</button>
          ) : (
            <button className="btn btn-primary" disabled={!canNext} onClick={finish}>Enter my dashboard</button>
          )}
        </div>
      </div>
    </main>
  );
}
