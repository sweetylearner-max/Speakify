"use client";
/**
 * Shared voice-level bus so VRM avatars can read real-time audio amplitude
 * without depending on the TTS internals.
 */
export const voiceBus: { level: number; speaking: boolean } = {
  level: 0,
  speaking: false,
};
