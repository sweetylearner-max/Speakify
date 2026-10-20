"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { addDemoHistory } from "@/lib/demo";
import { clearAll, saveProfile, useProfile, useSessions } from "@/lib/storage";
import type { Experience, Focus, Goal } from "@/lib/types";

type Perm = "unknown" | "granted" | "denied" | "prompt";

function usePermission(name: "microphone" | "camera"): Perm {
  const [state, setState] = useState<Perm>("unknown");
  useEffect(() => {
    let status: PermissionStatus | null = null;
    navigator.permissions
      ?.query({ name: name as PermissionName })
      .then((s) => {
        status = s;
        setState(s.state as Perm);
        s.onchange = () => setState(s.state as Perm);
      })
      .catch(() => setState("unknown"));
    return () => {
      if (status) status.onchange = null;
    };
  }, [name]);
  return state;
}

const LABEL: Record<Perm, { text: string; cls: string }> = {
  granted: { text: "Allowed", cls: "text-emerald-400" },
  denied: { text: "Blocked", cls: "text-orange-400" },
  prompt: { text: "Not asked yet", cls: "text-indigo-200/60" },
  unknown: { text: "Not asked yet", cls: "text-indigo-200/60" },
};

export default function Settings() {
  const profile = useProfile();
  const sessions = useSessions();
  const router = useRouter();
  const mic = usePermission("microphone");
  const cam = usePermission("camera");
  const [speechApi, setSpeechApi] = useState<boolean | null>(null);
  const [ask, setAsk] = useState<string | null>(null);

  useEffect(() => {
    setSpeechApi("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  }, []);

  if (!profile) return null;

  async function request(kind: "microphone" | "camera") {
    setAsk(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia(kind === "microphone" ? { audio: true } : { video: true });
      s.getTracks().forEach((t) => t.stop());
    } catch {
      setAsk(`${kind === "microphone" ? "Microphone" : "Camera"} access was blocked. Use the lock icon in your address bar to change it.`);
    }
  }

  const update = (patch: Partial<typeof profile>) => saveProfile({ ...profile, ...patch });

  const row = (title: string, state: Perm, kind: "microphone" | "camera") => (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white/5 p-4">
      <span className="font-semibold">{title}</span>
      <span className="flex items-center gap-3">
        <span className={`text-sm font-semibold ${LABEL[state].cls}`}>{LABEL[state].text}</span>
        {state !== "granted" && <button className="btn btn-primary min-h-9 px-4 text-sm" onClick={() => request(kind)}>Allow</button>}
      </span>
    </div>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold md:text-4xl">Settings</h1>

      <section className="card space-y-4 p-6" aria-labelledby="prof">
        <h2 id="prof" className="text-lg font-extrabold">Your coaching profile</h2>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Name</span>
          <input className="field" value={profile.name} maxLength={24} onChange={(e) => update({ name: e.target.value })} />
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Experience</span>
            <select className="field" value={profile.experience} onChange={(e) => update({ experience: e.target.value as Experience })}>
              <option value="beginner">Just starting</option>
              <option value="some">A few times</option>
              <option value="experienced">Quite a lot</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Goal</span>
            <select className="field" value={profile.goal} onChange={(e) => update({ goal: e.target.value as Goal })}>
              <option value="class">Class presentations</option>
              <option value="interview">Interviews</option>
              <option value="speech">Speeches & competitions</option>
              <option value="confidence">Confidence</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Working on</span>
            <select className="field" value={profile.focus} onChange={(e) => update({ focus: e.target.value as Focus })}>
              <option value="nerves">Nerves</option>
              <option value="fillers">Filler words</option>
              <option value="pace">Pace</option>
              <option value="structure">Structure</option>
              <option value="eyecontact">Body language</option>
            </select>
          </label>
        </div>
      </section>

      <section className="card space-y-3 p-6" aria-labelledby="perm">
        <h2 id="perm" className="text-lg font-extrabold">Permissions</h2>
        {row("Microphone", mic, "microphone")}
        {row("Camera (optional, for body language)", cam, "camera")}
        <div className="flex items-center justify-between rounded-xl bg-white/5 p-4">
          <span className="font-semibold">Live speech recognition</span>
          <span className={`text-sm font-semibold ${speechApi ? "text-emerald-400" : "text-orange-400"}`}>
            {speechApi === null ? "…" : speechApi ? "Supported" : "Not in this browser: you can type instead"}
          </span>
        </div>
        {ask && <p role="alert" className="text-sm text-orange-300">{ask}</p>}
        <p className="text-sm text-indigo-100/60">Audio and video are processed in your browser. Only your transcript text and measured numbers are sent to Groq for coaching.</p>
      </section>

      <section className="card space-y-3 p-6" aria-labelledby="data">
        <h2 id="data" className="text-lg font-extrabold">Your data</h2>
        <p className="text-sm text-indigo-100/70">{sessions.length} session{sessions.length === 1 ? "" : "s"} stored on this device.</p>
        <div className="flex flex-wrap gap-3">
          {sessions.length === 0 && <button className="btn btn-ghost" onClick={addDemoHistory}>Load sample history</button>}
          <button
            className="btn btn-danger"
            onClick={() => {
              if (confirm("Delete your profile and all practice history from this device?")) {
                clearAll();
                router.push("/");
              }
            }}
          >
            Delete everything
          </button>
        </div>
      </section>
    </div>
  );
}
