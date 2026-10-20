"use client";
import { useSyncExternalStore } from "react";
import type { Profile, SessionRecord } from "./types";

const PROFILE_KEY = "speakify.profile.v1";
const SESSIONS_KEY = "speakify.sessions.v1";

const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: unknown }>();

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return fallback;
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  let value: unknown = fallback;
  try {
    value = raw ? JSON.parse(raw) : fallback;
  } catch {
    value = fallback;
  }
  cache.set(key, { raw, value });
  return value as T;
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: keep working in memory for this tab */
  }
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
};

const NO_SESSIONS: SessionRecord[] = [];

export const getProfile = () => read<Profile | null>(PROFILE_KEY, null);
export const getSessions = () => read<SessionRecord[]>(SESSIONS_KEY, NO_SESSIONS);

export const saveProfile = (p: Profile) => write(PROFILE_KEY, p);
export const addSession = (s: SessionRecord) => write(SESSIONS_KEY, [s, ...getSessions()].slice(0, 100));
export const clearAll = () => {
  write(PROFILE_KEY, null);
  write(SESSIONS_KEY, null);
};

/** undefined = still reading localStorage on the client, null = no profile yet */
export function useProfile(): Profile | null | undefined {
  return useSyncExternalStore(subscribe, getProfile, () => undefined);
}
export function useSessions(): SessionRecord[] {
  return useSyncExternalStore(subscribe, getSessions, () => NO_SESSIONS);
}
