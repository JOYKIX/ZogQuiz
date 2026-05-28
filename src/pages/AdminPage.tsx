import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Field } from '../components/ui/Field';
import { Loader } from '../components/ui/Loader';
import { useFirebaseValue } from '../hooks/useFirebaseValue';
import { useToast } from '../hooks/useToast';
import { createGuestAccount, getAdminSession, loginAdmin, removeGuestAccount, setAdminSession, signupAdmin, type AdminSession } from '../services/auth';
import { ensureSeed, patch, ROUNDS } from '../services/firebase';
import { setLiveRound } from '../services/rounds';
import type { GuestAccount, Participant, QuizState, RoundId } from '../types/domain';
import { toArray } from '../utils/format';
import { Round1Panel } from '../rounds/Round1Panel';
import { BlindtestPanel, JsonRoundPanel, Round2Panel, Round3Panel } from '../rounds/GenericRoundPanel';

export function AdminPage() {
  const [session, setSession] = useState<AdminSession | null>(() => getAdminSession());
  const [tab, setTab] = useState<RoundId | 'dashboard' | 'guests' | 'overlays'>('dashboard');
  const [quizState, loadingState] = useFirebaseValue<QuizState>('quiz/state', { activeRound: 'manche1', liveRound: 'manche1' });
  const { pushToast } = useToast();

  useEffect(() => { if (session) ensureSeed(session.uid).catch((error) => pushToast(error.message, 'danger')); }, [session, pushToast]);

  if (!session) return <AuthScreen onAuth={(next) => { setAdminSession(next); setSession(next); }} />;

  return <AppShell active="admin"><section className="dashboard"><aside className="sidebar"><p className="sidebar-label">Navigation</p><button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>Vue live</button>{ROUNDS.map((round) => <button className={tab === round ? 'active' : ''} onClick={() => setTab(round)} key={round}>{round}</button>)}<button className={tab === 'guests' ? 'active' : ''} onClick={() => setTab('guests')}>Guests</button><button className={tab === 'overlays' ? 'active' : ''} onClick={() => setTab('overlays')}>Overlays</button><Button variant="danger" onClick={() => { setAdminSession(null); setSession(null); }}>Déconnexion</Button></aside><section className="workspace"><header className="workspace-header"><div><p className="eyebrow">Firebase realtime</p><h1>{loadingState ? 'Synchronisation…' : `Live : ${quizState.liveRound}`}</h1></div><div className="round-switcher">{ROUNDS.map((round) => <Button variant={quizState.liveRound === round ? 'primary' : 'secondary'} onClick={() => setLiveRound(round, session.uid)} key={round}>{round}</Button>)}</div></header>{tab === 'dashboard' && <DashboardOverview />}{tab === 'manche1' && <Round1Panel />}{tab === 'manche2' && <Round2Panel />}{tab === 'manche3' && <Round3Panel />}{tab === 'manche4' && <BlindtestPanel />}{tab === 'manche5' && <JsonRoundPanel round="manche5" />}{tab === 'manche6' && <JsonRoundPanel round="manche6" />}{tab === 'finale' && <JsonRoundPanel round="finale" />}{tab === 'guests' && <GuestAccountsPanel />}{tab === 'overlays' && <OverlaySettingsPanel />}</section></section></AppShell>;
}

function AuthScreen({ onAuth }: { onAuth: (session: AdminSession) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const { pushToast } = useToast();
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try { onAuth(mode === 'login' ? await loginAdmin(loginId, password) : await signupAdmin(loginId, password)); }
    catch (error) { pushToast(error instanceof Error ? error.message : 'Erreur inconnue', 'danger'); }
    finally { setBusy(false); }
  }
  return <main className="auth-page"><Card className="auth-card"><p className="eyebrow">ZogQuiz Admin</p><h1>Cockpit moderne</h1><p className="muted">Application React + TypeScript, synchronisée avec Firebase Realtime Database.</p><div className="row"><Button variant={mode === 'login' ? 'primary' : 'ghost'} onClick={() => setMode('login')}>Connexion</Button><Button variant={mode === 'signup' ? 'primary' : 'ghost'} onClick={() => setMode('signup')}>Créer un compte</Button></div><form className="stack" onSubmit={submit}><Field label="ID admin" value={loginId} onChange={(e) => setLoginId(e.target.value)} required /><Field label="Mot de passe" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /><Button disabled={busy}>{busy ? 'Patientez…' : 'Entrer'}</Button></form></Card></main>;
}

function DashboardOverview() {
  const [participantsMap, loading] = useFirebaseValue<Record<string, Omit<Participant, 'id'>>>('rooms/manche1/participants', {});
  const [quizState] = useFirebaseValue<QuizState>('quiz/state', { activeRound: 'manche1', liveRound: 'manche1' });
  const participants = useMemo(() => toArray<Participant>(participantsMap).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)), [participantsMap]);
  if (loading) return <Loader />;
  return <section className="workspace-grid"><Card className="stat-card"><span>Manche active</span><strong>{quizState.liveRound}</strong></Card><Card className="stat-card"><span>Participants</span><strong>{participants.length}</strong></Card><Card className="span-12"><h2>Classement rapide</h2><ul className="leaderboard">{participants.map((participant) => <li key={participant.id}><span>{participant.nickname || participant.displayName}</span><strong>{participant.score ?? 0}</strong></li>)}</ul></Card></section>;
}

function GuestAccountsPanel() {
  const [accountsMap] = useFirebaseValue<Record<string, Omit<GuestAccount, 'id'>>>('guestAccounts', {});
  const [form, setForm] = useState({ loginId: '', displayName: '', password: '', buzzerSound: 'buzzer.mp3' });
  const accounts = useMemo(() => toArray<GuestAccount>(accountsMap), [accountsMap]);
  const { pushToast } = useToast();
  return <Card><p className="eyebrow">Invités</p><h2>Comptes et accès</h2><form className="form-grid" onSubmit={async (e) => { e.preventDefault(); await createGuestAccount(form.loginId, form.password, form.displayName || form.loginId, form.buzzerSound); setForm({ loginId: '', displayName: '', password: '', buzzerSound: 'buzzer.mp3' }); pushToast('Compte invité créé', 'success'); }}><Field label="Login" value={form.loginId} onChange={(e) => setForm({ ...form, loginId: e.target.value })} required /><Field label="Pseudo" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /><Field label="Mot de passe" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /><Field label="Son buzzer" value={form.buzzerSound} onChange={(e) => setForm({ ...form, buzzerSound: e.target.value })} /><Button>Créer</Button></form><div className="list">{accounts.map((account) => <article className="list-item" key={account.id}><div><strong>{account.displayName || account.loginId}</strong><p>{account.loginId}</p></div><Button variant="danger" onClick={() => removeGuestAccount(account)}>Supprimer</Button></article>)}</div></Card>;
}

function OverlaySettingsPanel() {
  const [configs] = useFirebaseValue<Record<string, Record<string, unknown>>>('overlayConfigs', {});
  return <section className="workspace-grid">{Object.entries(configs).map(([key, config]) => <Card className="span-6" key={key}><h2>{key}</h2><div className="form-grid">{Object.entries(config).map(([name, value]) => <Field key={name} label={name} value={String(value ?? '')} onChange={(e) => patch(`overlayConfigs/${key}`, { [name]: Number.isFinite(Number(e.target.value)) && e.target.value.trim() !== '' ? Number(e.target.value) : e.target.value })} />)}</div></Card>)}</section>;
}
