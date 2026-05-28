import { useMemo, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Field, TextareaField } from '../components/ui/Field';
import { useFirebaseValue } from '../hooks/useFirebaseValue';
import { useToast } from '../hooks/useToast';
import { patch } from '../services/firebase';
import { removeQuestion, saveQuestion, startRound3Timer, pauseRound3Timer, resetRound3Timer, setBlindtestPlayback } from '../services/rounds';
import type { BlindtestLive, BlindtestTrack, Question, Round3State } from '../types/domain';
import { formatClock, toArray } from '../utils/format';
import { useNow } from '../hooks/useNow';

export function Round2Panel() {
  const [questionsMap] = useFirebaseValue<Record<string, Omit<Question, 'id'>>>('rooms/manche2/questions', {});
  const [state] = useFirebaseValue<{ activeQuestionId: string | null }>('rooms/manche2/state', { activeQuestionId: null });
  const [form, setForm] = useState({ imageUrl: '', work: '', location: '', question: '' });
  const { pushToast } = useToast();
  const questions = useMemo(() => toArray<Question>(questionsMap), [questionsMap]);
  return <Card><p className="eyebrow">Manche 2</p><h2>Images & localisation</h2><form className="form-grid" onSubmit={async (e) => { e.preventDefault(); await saveQuestion('rooms/manche2/questions', form); setForm({ imageUrl: '', work: '', location: '', question: '' }); pushToast('Image ajoutée', 'success'); }}><Field label="URL image" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} /><Field label="Œuvre" value={form.work} onChange={(e) => setForm({ ...form, work: e.target.value })} /><Field label="Lieu" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /><Field label="Question" value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} /><Button>Ajouter</Button></form><div className="media-grid">{questions.map((question) => <article className="media-card" key={question.id}><img src={question.imageUrl} alt="" /><strong>{question.work || question.question}</strong><p>{question.location}</p><div className="row"><Button variant="secondary" onClick={() => patch('rooms/manche2/state', { activeQuestionId: question.id })}>{state.activeQuestionId === question.id ? 'En live' : 'Live'}</Button><Button variant="danger" onClick={() => removeQuestion('rooms/manche2/questions', question.id)}>Supprimer</Button></div></article>)}</div></Card>;
}

export function Round3Panel() {
  const [state] = useFirebaseValue<Round3State>('rooms/manche3/state', { activePlayerId: null, activeThemeId: null, questionIndex: 0, timerStatus: 'idle', timerRemainingMs: 90000, timerEndsAt: null, turnEnded: false });
  const now = useNow();
  const remaining = state.timerStatus === 'running' && state.timerEndsAt ? Math.max(0, state.timerEndsAt - now) : state.timerRemainingMs;
  return <Card><p className="eyebrow">Manche 3</p><h2>Timer synchronisé</h2><div className="timer-display">{formatClock(remaining)}</div><div className="control-grid"><Button onClick={() => startRound3Timer(remaining || 90000)}>Démarrer</Button><Button variant="secondary" onClick={() => pauseRound3Timer(remaining)}>Pause</Button><Button variant="ghost" onClick={() => resetRound3Timer()}>Reset</Button></div><div className="form-grid"><Field label="Joueur actif" value={state.activePlayerId ?? ''} onChange={(e) => patch('rooms/manche3/state', { activePlayerId: e.target.value || null })} /><Field label="Thème actif" value={state.activeThemeId ?? ''} onChange={(e) => patch('rooms/manche3/state', { activeThemeId: e.target.value || null })} /><Field label="Index question" type="number" value={state.questionIndex} onChange={(e) => patch('rooms/manche3/state', { questionIndex: Number(e.target.value) })} /></div></Card>;
}

export function BlindtestPanel() {
  const [tracksMap] = useFirebaseValue<Record<string, Omit<BlindtestTrack, 'id'>>>('rooms/manche4/blindtest/tracks', {});
  const [live] = useFirebaseValue<BlindtestLive>('rooms/manche4/blindtest/live', { active: false, trackId: null, trackIndex: 0, playbackState: 'stopped', startedAt: null, pausedAtSeconds: 0, syncVersion: 0 });
  const [form, setForm] = useState({ title: '', artist: '', youtubeId: '', answer: '' });
  const tracks = useMemo(() => toArray<BlindtestTrack>(tracksMap), [tracksMap]);
  return <Card><p className="eyebrow">Manche 4</p><h2>Blindtest live</h2><form className="form-grid" onSubmit={async (e) => { e.preventDefault(); await saveQuestion('rooms/manche4/blindtest/tracks', form); setForm({ title: '', artist: '', youtubeId: '', answer: '' }); }}><Field label="Titre" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /><Field label="Artiste" value={form.artist} onChange={(e) => setForm({ ...form, artist: e.target.value })} /><Field label="YouTube ID" value={form.youtubeId} onChange={(e) => setForm({ ...form, youtubeId: e.target.value })} /><Field label="Réponse" value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} /><Button>Ajouter piste</Button></form><div className="control-grid"><Button onClick={() => setBlindtestPlayback('playing', { startedAt: Date.now() })}>Play</Button><Button variant="secondary" onClick={() => setBlindtestPlayback('paused', { pausedAtSeconds: 0 })}>Pause</Button><Button variant="danger" onClick={() => setBlindtestPlayback('stopped', { startedAt: null })}>Stop</Button></div><p className="message">État actuel : {live.playbackState}</p><div className="list">{tracks.map((track, index) => <article className="list-item" key={track.id}><div><strong>{track.title}</strong><p>{track.artist || track.answer}</p></div><div className="row"><Button variant="secondary" onClick={() => patch('rooms/manche4/blindtest/live', { trackId: track.id, trackIndex: index, playbackState: 'stopped' })}>{live.trackId === track.id ? 'Sélectionnée' : 'Sélectionner'}</Button><Button variant="danger" onClick={() => removeQuestion('rooms/manche4/blindtest/tracks', track.id)}>Supprimer</Button></div></article>)}</div></Card>;
}

export function JsonRoundPanel({ round }: { round: 'manche5' | 'manche6' | 'finale' }) {
  const [state] = useFirebaseValue<Record<string, unknown>>(`rooms/${round}/state`, {});
  const [draft, setDraft] = useState('');
  return <Card><p className="eyebrow">{round}</p><h2>Console avancée</h2><p className="muted">Éditeur typé JSON pour les phases spécifiques, sans dupliquer de logique UI.</p><TextareaField label="Patch JSON" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder='{"status":"running"}' rows={6} /><Button onClick={() => patch(`rooms/${round}/state`, JSON.parse(draft || '{}'))}>Appliquer le patch</Button><pre className="json-preview">{JSON.stringify(state, null, 2)}</pre></Card>;
}
