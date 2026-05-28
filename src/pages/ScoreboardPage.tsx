import { useMemo } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { useFirebaseValue } from '../hooks/useFirebaseValue';
import type { Participant } from '../types/domain';
import { toArray } from '../utils/format';

export function ScoreboardPage() {
  const [participantsMap] = useFirebaseValue<Record<string, Omit<Participant, 'id'>>>('rooms/manche1/participants', {});
  const [viewersMap] = useFirebaseValue<Record<string, Omit<Participant, 'id'>>>('rooms/viewers/scores', {});
  const participants = useMemo(() => toArray<Participant>(participantsMap).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)), [participantsMap]);
  const viewers = useMemo(() => toArray<Participant>(viewersMap).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)), [viewersMap]);
  return <AppShell active="classement"><section className="scoreboard-page"><header className="hero-card"><p className="eyebrow">Ranking Center</p><h1>Classement en direct</h1></header><div className="scoreboard-grid"><ScoreList title="Participants" items={participants} /><ScoreList title="Viewers Twitch" items={viewers} /></div></section></AppShell>;
}
function ScoreList({ title, items }: { title: string; items: Participant[] }) { return <Card><h2>{title}</h2><ul className="leaderboard leaderboard-large">{items.map((item, index) => <li key={item.id}><span><b>#{index + 1}</b> {item.nickname || item.displayName || item.id}</span><strong>{item.score ?? 0}</strong></li>)}</ul></Card>; }
