const YOUTUBE_PATTERNS = [
  /^https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/i,
  /^https?:\/\/(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/i,
  /^https?:\/\/(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/i,
  /^https?:\/\/(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/i,
];

let iframeApiPromise = null;

export function extractYoutubeVideoId(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (parsed.hostname.includes("youtube.com") || parsed.hostname.includes("youtu.be")) {
      const v = parsed.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    }
  } catch {
    // fallback regex below
  }

  for (const pattern of YOUTUBE_PATTERNS) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

export function validateYoutubeUrl(url) {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) {
    return {
      valid: false,
      reason: "URL YouTube invalide. Exemple attendu : https://www.youtube.com/watch?v=XXXXXXXXXXX",
      videoId: null,
    };
  }
  return { valid: true, reason: "", videoId };
}

export function loadYoutubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (iframeApiPromise) return iframeApiPromise;

  iframeApiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };

    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => reject(new Error("Impossible de charger l’API YouTube IFrame"));
      document.head.appendChild(script);
    }
  });

  return iframeApiPromise;
}

export class YoutubeAudioPlayer {
  constructor({ hostId, onStateChange, onError }) {
    this.hostId = hostId;
    this.onStateChange = onStateChange;
    this.onError = onError;
    this.player = null;
    this.ready = false;
    this.lastVideoId = null;
  }

  async ensureReady() {
    if (this.ready && this.player) return;
    const YT = await loadYoutubeIframeApi();

    await new Promise((resolve) => {
      this.player = new YT.Player(this.hostId, {
        width: "1",
        height: "1",
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            this.ready = true;
            resolve();
          },
          onStateChange: (event) => this.onStateChange?.(event),
          onError: (event) => this.onError?.(event),
        },
      });
    });
  }

  async loadVideo(videoId, startSeconds = 0, autoPlay = false) {
    await this.ensureReady();
    if (!videoId) return;

    const safeStart = Math.max(0, Number(startSeconds || 0));
    if (this.lastVideoId !== videoId) {
      this.lastVideoId = videoId;
      this.player.loadVideoById({ videoId, startSeconds: safeStart });
      if (!autoPlay) this.player.pauseVideo();
      return;
    }

    this.seekTo(safeStart);
    if (autoPlay) this.play();
  }

  play() {
    if (!this.player) return;
    this.player.playVideo();
  }

  pause() {
    if (!this.player) return;
    this.player.pauseVideo();
  }

  stop() {
    if (!this.player) return;
    this.player.stopVideo();
  }

  seekTo(seconds) {
    if (!this.player) return;
    this.player.seekTo(Math.max(0, Number(seconds || 0)), true);
  }

  getCurrentTime() {
    if (!this.player?.getCurrentTime) return 0;
    return Number(this.player.getCurrentTime() || 0);
  }

  setVolume(volume) {
    if (!this.player?.setVolume) return;
    this.player.setVolume(Math.max(0, Math.min(100, Number(volume || 0))));
  }

  mute() {
    this.player?.mute?.();
  }

  unMute() {
    this.player?.unMute?.();
  }
}

export function parseYoutubeError(code) {
  const known = {
    2: "ID vidéo invalide.",
    5: "Erreur lecteur HTML5 YouTube.",
    100: "Vidéo YouTube introuvable ou privée.",
    101: "Lecture embarquée interdite pour cette vidéo.",
    150: "Lecture embarquée interdite pour cette vidéo.",
  };
  return known[Number(code)] || `Erreur YouTube inconnue (${code}).`;
}
