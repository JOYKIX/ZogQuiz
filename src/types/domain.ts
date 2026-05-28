export type RoundId = 'manche1' | 'manche2' | 'manche3' | 'manche4' | 'manche5' | 'manche6' | 'finale';

export type QuizState = {
  activeRound: RoundId;
  liveRound: RoundId;
  updatedAt?: number;
  updatedBy?: string;
};

export type Participant = {
  id: string;
  nickname: string;
  displayName?: string;
  score?: number;
  color?: string;
  blockedQuestionIds?: Record<string, boolean>;
  sessionId?: string;
  online?: boolean;
  buzzerSound?: string;
};

export type GuestAccount = {
  id: string;
  loginId: string;
  displayName?: string;
  passwordHash: string;
  participantId?: string;
  buzzerSound?: string;
  createdAt?: number;
  updatedAt?: number;
};

export type Question = {
  id: string;
  question: string;
  answer?: string;
  imageUrl?: string;
  work?: string;
  location?: string;
  points?: number;
  createdAt?: number;
  updatedAt?: number;
};

export type Round1State = {
  currentType: 'participants' | 'viewers';
  currentQuestionId: string | null;
  showAnswer: boolean;
  buzzerLocked: boolean;
  lockedBySessionId: string | null;
  lockedByNickname: string;
  lockedAt: number;
  updatedAt: number;
};

export type Round3State = {
  activePlayerId: string | null;
  activeThemeId: string | null;
  questionIndex: number;
  timerStatus: 'idle' | 'running' | 'paused' | 'ended';
  timerRemainingMs: number;
  timerEndsAt: number | null;
  turnEnded: boolean;
  updatedAt?: number;
};

export type BlindtestTrack = {
  id: string;
  title: string;
  artist?: string;
  answer?: string;
  youtubeId?: string;
  url?: string;
  durationSeconds?: number;
};

export type BlindtestLive = {
  active: boolean;
  trackId: string | null;
  trackIndex: number;
  playbackState: 'stopped' | 'playing' | 'paused';
  startedAt: number | null;
  pausedAtSeconds: number;
  syncVersion: number;
  lastError?: string;
  stopOnAnswer?: boolean;
  revealAnswer?: boolean;
  participantAnswers?: Record<string, string>;
  updatedAt?: number;
};

export type OverlayConfig = Record<string, string | number | boolean | null | undefined>;

export type Dictionary<T> = Record<string, T>;
