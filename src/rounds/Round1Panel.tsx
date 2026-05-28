import { useMemo, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Field, TextareaField } from '../components/ui/Field';
import { useFirebaseValue } from '../hooks/useFirebaseValue';
import { useToast } from '../hooks/useToast';
import { patch } from '../services/firebase';
import { addScore, removeQuestion, saveQuestion, setRound1Question, unlockBuzzer } from '../services/rounds';
import type { Participant, Question, Round1State } from '../types/domain';
import { toArray } from '../utils/format';

export function Round1Panel() {
  const [state] = useFirebaseValue<Round1State>('rooms/manche1/state', { currentType: 'participants', currentQuestionId: null, showAnswer: false, buzzerLocked: false, lockedBySessionId: null, lockedByNickname: '', lockedAt: 0, updatedAt: 0 });
  const [questionsMap] = useFirebaseValue<Record<string, Omit<Question, 'id'>>>('rooms/manche1/questions/participants', {});
  const [participantsMap] = useFirebaseValue<Record<string, Omit<Participant, 'id'>>>('rooms/manche1/participants', {});
  const [form, setForm] = useState({ question: '', answer: '' });
  const { pushToast } = useToast();
  const questions = useMemo(() => toArray<Question>(questionsMap), [questionsMap]);
  const participants = useMemo(() => toArray<Participant>(participantsMap).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)), [participantsMap]);
  const activeQuestion = questions.find((question) => question.id === state.currentQuestionId);

  async function submitQuestion(event: React.FormEvent) {
    event.preventDefault();
    if (!form.question.trim()) return;
    await saveQuestion('rooms/manche1/questions/participants', form);
    setForm({ question: '', answer: '' });
    pushToast('Question ajoutée', 'success');
  }

  return <section className="workspace-grid">
    <Card className="span-7"><p className="eyebrow">Manche 1</p><h2>Questions & buzzer</h2><form className="stack" onSubmit={submitQuestion}><TextareaField label="Question" value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} /><Field label="Réponse" value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} /><Button>Ajouter</Button></form><div className="list">{questions.map((question) => <article className="list-item" key={question.id}><div><strong>{question.question}</strong><p>{question.answer || 'Réponse non renseignée'}</p></div><div className="row"><Button variant="secondary" onClick={() => setRound1Question(question.id)}>Live</Button><Button variant="danger" onClick={() => removeQuestion('rooms/manche1/questions/participants', question.id)}>Supprimer</Button></div></article>)}</div></Card>
    <Card className="span-5"><p className="eyebrow">Live</p><h2>{activeQuestion?.question ?? 'Aucune question active'}</h2><p className="highlight">{state.showAnswer ? activeQuestion?.answer : 'Réponse masquée'}</p><div className="control-grid"><Button variant="secondary" onClick={() => patch('rooms/manche1/state', { showAnswer: !state.showAnswer })}>Afficher / masquer</Button><Button variant="danger" onClick={unlockBuzzer}>Déverrouiller buzzer</Button></div><div className="buzz-card"><span>Premier buzz</span><strong>{state.lockedByNickname || '—'}</strong></div><h3>Scores</h3><ul className="leaderboard">{participants.map((participant) => <li key={participant.id}><span>{participant.nickname || participant.displayName}</span><strong>{participant.score ?? 0}</strong><Button variant="ghost" onClick={() => addScore(participant.id, 1)}>+1</Button><Button variant="ghost" onClick={() => addScore(participant.id, -1)}>-1</Button></li>)}</ul></Card>
  </section>;
}
