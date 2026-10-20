import type { SessionRecord } from "@/lib/types";

export function ScoreRing({ value, size = 140, label, stroke = 12 }: { value: number; size?: number; label?: string; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = value >= 80 ? "#34d399" : value >= 60 ? "#818cf8" : value >= 40 ? "#fbbf24" : "#fb7185";
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${label ?? "Score"}: ${value} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.09)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="font-extrabold leading-none" style={{ fontSize: size * 0.32 }}>{value}</div>
        {label && <div className="mt-1 text-xs font-semibold uppercase tracking-widest text-indigo-200/70">{label}</div>}
      </div>
    </div>
  );
}

export function MetricBar({ label, value, hint }: { label: string; value: number; hint?: string }) {
  const color = value >= 80 ? "bg-emerald-400" : value >= 60 ? "bg-indigo-400" : value >= 40 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-semibold">{label}</span>
        <span className="font-extrabold">{value}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/10" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%`, transition: "width 0.9s ease" }} />
      </div>
      {hint && <p className="mt-1 text-xs text-indigo-100/60">{hint}</p>}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-widest text-indigo-200/60">{label}</div>
      <div className="mt-1 text-3xl font-extrabold">{value}</div>
      {sub && <div className="text-sm text-indigo-100/60">{sub}</div>}
    </div>
  );
}

/** Overall score across sessions, oldest to newest */
export function ScoreChart({ sessions }: { sessions: SessionRecord[] }) {
  const data = [...sessions].reverse().slice(-12);
  const w = 560, h = 180, pad = 26;
  if (data.length < 2) return null;
  const x = (i: number) => pad + (i * (w - pad * 2)) / (data.length - 1);
  const y = (v: number) => h - pad - (v / 100) * (h - pad * 2);
  const path = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.scores.overall)}`).join(" ");
  const area = `${path} L${x(data.length - 1)},${h - pad} L${x(0)},${h - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={`Overall score over your last ${data.length} sessions, from ${data[0].scores.overall} to ${data[data.length - 1].scores.overall}`}>
      <defs>
        <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#818cf8" stopOpacity="0.45" />
          <stop offset="1" stopColor="#818cf8" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 50, 100].map((g) => (
        <g key={g}>
          <line x1={pad} x2={w - pad} y1={y(g)} y2={y(g)} stroke="rgba(255,255,255,0.08)" />
          <text x={4} y={y(g) + 4} fontSize="10" fill="rgba(255,255,255,0.4)">{g}</text>
        </g>
      ))}
      <path d={area} fill="url(#area)" />
      <path d={path} fill="none" stroke="#a5b4fc" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <g key={d.id}>
          <circle cx={x(i)} cy={y(d.scores.overall)} r="5" fill="#0f0c26" stroke="#c7d2fe" strokeWidth="2.5" />
          <text x={x(i)} y={y(d.scores.overall) - 11} fontSize="11" fontWeight="700" textAnchor="middle" fill="#e0e7ff">{d.scores.overall}</text>
        </g>
      ))}
    </svg>
  );
}

export function ErrorBanner({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-rose-400/40 bg-rose-500/15 px-4 py-3 text-sm text-rose-100">
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}

export function InfoBanner({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
      {children}
    </div>
  );
}
