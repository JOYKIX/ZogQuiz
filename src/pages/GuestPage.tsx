import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Field } from '../components/ui/Field';
import { useFirebaseValue } from '../hooks/useFirebaseValue';
import { useToast } from '../hooks/useToast';
import { getGuestSession, loginGuest, setGuestSession, type GuestSession } from '../services/auth';
import { markPresence } from '../services/firebase';
import { buzz } from '../services/rounds';
import type { BlindtestLive, QuizState, Round1State } from '../types/domain';
import { formatClock } from '../utils/format';
import { useNow } from '../hooks/useNow';

export function GuestPage() {
  const [session, setSession] = useState<GuestSession | null>(() => getGuestSession());
  const [quizState] = useFirebaseValue<QuizState>('quiz/state', { activeRound: 'manche1', liveRound: 'manche1' });
  useEffect(() => { if (session) markPresence(`rooms/manche1/participants/${session.participantId}/presence`, { displayName: session.displayName }); }, [session]);
  if (!session) return <GuestLogin onLogin={(next) => { setGuestSession(next); setSession(next); }} />;
  return <AppShell active="guest"><section className="guest-layout"><header className="hero-card"><p className="eyebrow">Espace invité</p><h1>{session.displayName}</h1><p>Manche live : <strong>{quizState.liveRound}</strong></p><Button variant="danger" onClick={() => { setGuestSession(null); setSession(null); }}>Déconnexion</Button></header>{quizState.liveRound === 'manche1' && <GuestRound1 session={session} />}{quizState.liveRound === 'manche4' && <GuestBlindtest />}{!['manche1', 'manche4'].includes(quizState.liveRound) && <Card><h2>{quizState.liveRound}</h2><p className="muted">Interface synchronisée en lecture : suivez les instructions de l’admin.</p></Card>}</section></AppShell>;
}

function GuestLogin({ onLogin }: { onLogin: (session: GuestSession) => void }) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const { pushToast } = useToast();
  return <main className="auth-page"><Card className="auth-card"><p className="eyebrow">ZogQuiz Live</p><h1>Connexion invité</h1><form className="stack" onSubmit={async (e) => { e.preventDefault(); try { onLogin(await loginGuest(loginId, password)); } catch (error) { pushToast(error instanceof Error ? error.message : 'Connexion impossible', 'danger'); } }}><Field label="ID invité" value={loginId} onChange={(e) => setLoginId(e.target.value)} required /><Field label="Mot de passe" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /><Button>Rejoindre</Button></form></Card></main>;
}

function GuestRound1({ session }: { session: GuestSession }) {
  const [state] = useFirebaseValue<Round1State>('rooms/manche1/state', { currentType: 'participants', currentQuestionId: null, showAnswer: false, buzzerLocked: false, lockedBySessionId: null, lockedByNickname: '', lockedAt: 0, updatedAt: 0 });
  const { pushToast } = useToast();
  const lockedByMe = state.lockedBySessionId === session.participantId;
  async function doBuzz() {
    await buzz(session.participantId, session.displayName);
    pushToast('Buzz envoyé', 'success');
  }
  return <Card className="buzzer-card"><p className="eyebrow">Manche 1</p><h2>{state.buzzerLocked ? lockedByMe ? 'Vous avez buzzé !' : `${state.lockedByNickname} a buzzé` : 'Buzzer ouvert'}</h2><Button className="big-buzz" disabled={state.buzzerLocked} onClick={doBuzz}>BUZZER</Button></Card>;
}

function GuestBlindtest() {
  const [live] = useFirebaseValue<BlindtestLive>('rooms/manche4/blindtest/live', { active: false, trackId: null, trackIndex: 0, playbackState: 'stopped', startedAt: null, pausedAtSeconds: 0, syncVersion: 0 });
  const now = useNow(500);
  const seconds = useMemo(() => live.playbackState === 'playing' && live.startedAt ? Math.floor((now - live.startedAt) / 1000) + (live.pausedAtSeconds || 0) : live.pausedAtSeconds || 0, [live, now]);
  return <Card><p className="eyebrow">Blindtest</p><h2>{live.playbackState === 'playing' ? 'Écoute en cours' : 'En attente'}</h2><p className="timer-display">{formatClock(seconds * 1000)}</p><Field label="Votre réponse" placeholder="Tapez votre proposition" /></Card>;
}
