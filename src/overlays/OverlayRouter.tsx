import { useMemo } from 'react';
import { useFirebaseValue } from '../hooks/useFirebaseValue';
import { useNow } from '../hooks/useNow';
import type { BlindtestLive, BlindtestTrack, OverlayConfig, Question, Round1State, Round3State } from '../types/domain';
import { formatClock, toArray } from '../utils/format';

export function OverlayRouter({ name }: { name: string }) {
  if (name.includes('round2')) return <Round2Overlay />;
  if (name.includes('round3')) return <Round3Overlay />;
  if (name.includes('round4')) return <Round4Overlay />;
  if (name.includes('round5')) return <GenericOverlay round="round5" title="Mort subite" />;
  if (name.includes('round6')) return <GenericOverlay round="round6" title="Duel final" />;
  return <Round1Overlay />;
}

function Round1Overlay() {
  const [state] = useFirebaseValue<Round1State>('rooms/manche1/state', { currentType: 'participants', currentQuestionId: null, showAnswer: false, buzzerLocked: false, lockedBySessionId: null, lockedByNickname: '', lockedAt: 0, updatedAt: 0 });
  const [questionsMap] = useFirebaseValue<Record<string, Omit<Question, 'id'>>>('rooms/manche1/questions/participants', {});
  const [config] = useFirebaseValue<OverlayConfig>('overlayConfigs/round1', {});
  const questions = useMemo(() => toArray<Question>(questionsMap), [questionsMap]);
  const question = questions.find((item) => item.id === state.currentQuestionId);
  const text = state.showAnswer ? question?.answer : question?.question;
  return <main className="obs-root obs-center" style={{ color: String(config.textColor ?? '#fff'), fontWeight: Number(config.fontWeight ?? 800), padding: Number(config.safePaddingPx ?? 48), textAlign: config.horizontalAlign as never }}><div className="obs-question" style={{ maxWidth: Number(config.maxWidthPx ?? 1600), fontSize: `clamp(${Number(config.minFontSizePx ?? 28)}px, 7vw, ${Number(config.maxFontSizePx ?? 180)}px)`, textShadow: config.textShadow ? '0 10px 40px rgba(0,0,0,.75)' : 'none' }}>{text || ''}</div>{state.buzzerLocked && <div className="obs-buzz">{state.lockedByNickname}</div>}</main>;
}

function Round2Overlay() {
  const [state] = useFirebaseValue<{ activeQuestionId: string | null }>('rooms/manche2/state', { activeQuestionId: null });
  const [questionsMap] = useFirebaseValue<Record<string, Omit<Question, 'id'>>>('rooms/manche2/questions', {});
  const [config] = useFirebaseValue<OverlayConfig>('overlayConfigs/round2', {});
  const questions = useMemo(() => toArray<Question>(questionsMap), [questionsMap]);
  const question = questions.find((item) => item.id === state.activeQuestionId);
  return <main className="obs-root obs-center">{question?.imageUrl && <img className="obs-image" src={question.imageUrl} alt="" style={{ maxWidth: Number(config.maxWidthPx ?? 1400), maxHeight: Number(config.maxHeightPx ?? 820), borderRadius: Number(config.borderRadiusPx ?? 0) }} />}</main>;
}

function Round3Overlay() {
  const [state] = useFirebaseValue<Round3State>('rooms/manche3/state', { activePlayerId: null, activeThemeId: null, questionIndex: 0, timerStatus: 'idle', timerRemainingMs: 90000, timerEndsAt: null, turnEnded: false });
  const [config] = useFirebaseValue<OverlayConfig>('overlayConfigs/round3', {});
  const now = useNow();
  const remaining = state.timerStatus === 'running' && state.timerEndsAt ? Math.max(0, state.timerEndsAt - now) : state.timerRemainingMs;
  return <main className="obs-root obs-stack" style={{ textAlign: config.align as never, gap: Number(config.blockGapPx ?? 14) }}><p style={{ color: String(config.themeColor ?? '#cfe6ff'), fontSize: Number(config.themeFontSizePx ?? 34) }}>Thème : {state.activeThemeId || '—'}</p><h1 style={{ color: String(config.questionColor ?? '#fff'), fontSize: Number(config.questionFontSizePx ?? 74) }}>Question {state.questionIndex + 1}</h1><strong style={{ color: String(config.timerColor ?? '#8cf5dc'), fontSize: Number(config.timerFontSizePx ?? 72) }}>{formatClock(remaining)}</strong></main>;
}

function Round4Overlay() {
  const [live] = useFirebaseValue<BlindtestLive>('rooms/manche4/blindtest/live', { active: false, trackId: null, trackIndex: 0, playbackState: 'stopped', startedAt: null, pausedAtSeconds: 0, syncVersion: 0 });
  const [tracksMap] = useFirebaseValue<Record<string, Omit<BlindtestTrack, 'id'>>>('rooms/manche4/blindtest/tracks', {});
  const [config] = useFirebaseValue<OverlayConfig>('overlayConfigs/round4', {});
  const now = useNow(250);
  const tracks = useMemo(() => toArray<BlindtestTrack>(tracksMap), [tracksMap]);
  const track = tracks.find((item) => item.id === live.trackId);
  const seconds = live.playbackState === 'playing' && live.startedAt ? Math.floor((now - live.startedAt) / 1000) + (live.pausedAtSeconds || 0) : live.pausedAtSeconds || 0;
  const color = live.playbackState === 'playing' ? config.playingColor : live.playbackState === 'paused' ? config.pausedColor : config.stoppedColor;
  return <main className="obs-root obs-card" style={{ maxWidth: Number(config.maxWidthPx ?? 1000), borderRadius: Number(config.cornerRadiusPx ?? 12) }}><p className="eyebrow" style={{ color: String(color ?? '#fff') }}>{live.playbackState}</p><h1 style={{ fontSize: Number(config.primaryFontSizePx ?? 52), color: String(config.primaryColor ?? '#fff') }}>{track ? `Piste ${live.trackIndex + 1}` : 'Blindtest prêt'}</h1><p style={{ fontSize: Number(config.secondaryFontSizePx ?? 30), color: String(config.secondaryColor ?? '#b5cef0') }}>{live.revealAnswer ? track?.answer || track?.title : 'Réponse masquée'}</p><strong className="obs-time">{formatClock(seconds * 1000)}</strong>{live.lastError && <p className="obs-error">{live.lastError}</p>}</main>;
}

function GenericOverlay({ round, title }: { round: string; title: string }) {
  const [state] = useFirebaseValue<Record<string, unknown>>(`rooms/${round.replace('round', 'manche')}/state`, {});
  return <main className="obs-root obs-card"><p className="eyebrow">{title}</p><pre className="obs-json">{JSON.stringify(state, null, 2)}</pre></main>;
}
