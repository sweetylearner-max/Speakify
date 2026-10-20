"use client";
import dynamic from "next/dynamic";

const CompanionChat = dynamic(() => import("@/components/CompanionChat"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center bg-[#08061a]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-indigo-400/20 border-t-indigo-300" />
        <p className="text-indigo-200/60 text-sm">Loading your companion…</p>
      </div>
    </div>
  ),
});

export default function CompanionLoader() {
  return <CompanionChat />;
}
