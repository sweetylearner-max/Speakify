"use client";
import dynamic from "next/dynamic";

const Hall = dynamic(() => import("./Hall"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-indigo-200/70" role="status">
      Setting up the auditorium…
    </div>
  ),
});

export default Hall;
