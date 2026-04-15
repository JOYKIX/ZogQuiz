export const blindtestTracks = [
  { file: "/sound/blindtest/music1.mp3" },
];

export function getBlindtestTrack(index) {
  if (!Number.isInteger(index) || index < 0 || index >= blindtestTracks.length) return null;
  return blindtestTracks[index];
}

