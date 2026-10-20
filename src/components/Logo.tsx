export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-extrabold tracking-tight ${className}`}>
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <linearGradient id="lg" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#818cf8" />
            <stop offset="1" stopColor="#c084fc" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#lg)" />
        <rect x="13" y="6" width="6" height="12" rx="3" fill="#fff" />
        <path d="M9 14a7 7 0 0 0 14 0M16 21v4M12 25h8" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" />
      </svg>
      Speakify
    </span>
  );
}
