"use client";
import { notFound, useParams } from "next/navigation";
import SessionRunner from "@/components/SessionRunner";
import type { SessionMode } from "@/lib/types";

const MODES: SessionMode[] = ["public", "discuss", "challenge", "debate"];

export default function SessionPage() {
  const { mode } = useParams<{ mode: string }>();
  if (!MODES.includes(mode as SessionMode)) notFound();
  return <SessionRunner mode={mode as SessionMode} />;
}
