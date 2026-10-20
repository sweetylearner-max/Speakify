"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Logo } from "@/components/Logo";
import { useProfile } from "@/lib/storage";

const NAV = [
  { href: "/app", label: "Dashboard", icon: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10" },
  { href: "/app/practice", label: "Practice", icon: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" },
  { href: "/app/companion", label: "Companion", icon: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 10h.01M15 10h.01M9.5 14.5s.8 1.5 2.5 1.5 2.5-1.5 2.5-1.5" },
  { href: "/app/settings", label: "Settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.3 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = useProfile();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (profile === null) router.replace("/onboarding");
  }, [profile, router]);

  if (!profile) {
    return (
      <div className="flex min-h-[100svh] items-center justify-center text-indigo-200/70" role="status">
        Loading your space…
      </div>
    );
  }

  // These pages take the whole screen
  if (path.startsWith("/app/session") || path.startsWith("/app/companion")) return <main id="main">{children}</main>;

  const active = (href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));

  return (
    <div className="min-h-[100svh] md:flex">
      <aside className="sticky top-0 hidden h-[100svh] w-64 shrink-0 flex-col border-r border-white/10 bg-black/20 p-5 backdrop-blur md:flex">
        <Link href="/" aria-label="Speakify home"><Logo className="mb-8 text-xl" /></Link>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 font-semibold transition ${active(n.href) ? "bg-indigo-500/25 text-white" : "text-indigo-100/70 hover:bg-white/5"}`}>
              <Icon d={n.icon} /> {n.label}
            </Link>
          ))}
        </nav>
        <Link href="/app/practice" className="btn btn-primary w-full">Start practice</Link>
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-white/5 p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/40 font-extrabold">{profile.name[0]?.toUpperCase()}</span>
          <span className="truncate font-semibold">{profile.name}</span>
        </div>
      </aside>

      <main id="main" className="min-w-0 flex-1 px-4 pb-28 pt-6 md:px-10 md:pb-10 md:pt-10">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-white/10 bg-[#0b0920]/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}
            className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-semibold ${active(n.href) ? "text-indigo-300" : "text-indigo-100/60"}`}>
            <Icon d={n.icon} /> {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
