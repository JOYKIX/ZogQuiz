import { create, destroy, patch, transact } from './firebase';
import type { RoundId } from '../types/domain';

export function setLiveRound(round: RoundId, uid = 'react-admin') {
  return patch('quiz/state', { activeRound: round, liveRound: round, updatedBy: uid });
}

export function setRound1Question(questionId: string | null, type: 'participants' | 'viewers' = 'participants') {
  return patch('rooms/manche1/state', { currentQuestionId: questionId, currentType: type, showAnswer: false, buzzerLocked: false, lockedBySessionId: null, lockedByNickname: '', lockedAt: 0 });
}

export function unlockBuzzer() {
  return patch('rooms/manche1/state', { buzzerLocked: false, lockedBySessionId: null, lockedByNickname: '', lockedAt: 0 });
}

export function buzz(sessionId: string, nickname: string) {
  return transact('rooms/manche1/state', (state: any) => {
    if (!state || state.buzzerLocked) return state;
    return { ...state, buzzerLocked: true, lockedBySessionId: sessionId, lockedByNickname: nickname, lockedAt: Date.now(), updatedAt: Date.now() };
  });
}

export function addScore(participantId: string, delta: number) {
  return transact<number>(`rooms/manche1/participants/${participantId}/score`, (score) => (score ?? 0) + delta);
}

export function saveQuestion(path: string, data: Record<string, unknown>, id?: string) {
  return id ? patch(`${path}/${id}`, data) : create(path, data);
}

export function removeQuestion(path: string, id: string) {
  return destroy(`${path}/${id}`);
}

export function startRound3Timer(durationMs: number) {
  return patch('rooms/manche3/state', { timerStatus: 'running', timerRemainingMs: durationMs, timerEndsAt: Date.now() + durationMs, turnEnded: false });
}
export function pauseRound3Timer(remainingMs: number) {
  return patch('rooms/manche3/state', { timerStatus: 'paused', timerRemainingMs: remainingMs, timerEndsAt: null });
}
export function resetRound3Timer(durationMs = 90000) {
  return patch('rooms/manche3/state', { timerStatus: 'idle', timerRemainingMs: durationMs, timerEndsAt: null, turnEnded: false });
}

export function setBlindtestPlayback(playbackState: 'playing' | 'paused' | 'stopped', extra: Record<string, unknown> = {}) {
  return patch('rooms/manche4/blindtest/live', { playbackState, active: playbackState !== 'stopped', syncVersion: Date.now(), ...extra });
}
