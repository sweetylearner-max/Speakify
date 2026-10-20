// Holds the just-recorded audio URL in memory so the results page can offer playback.
// Audio is never persisted or uploaded.
let stash: { id: string; url: string } | null = null;

export const stashAudio = (id: string, url: string | null) => {
  if (stash) URL.revokeObjectURL(stash.url);
  stash = url ? { id, url } : null;
};
export const getAudio = (id: string) => (stash && stash.id === id ? stash.url : null);
