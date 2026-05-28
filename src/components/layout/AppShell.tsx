import type { ReactNode } from 'react';
import logo from '../../assets/logo.png';
import { Button } from '../ui/Button';

export function AppShell({ children, active = 'dashboard' }: { children: ReactNode; active?: string }) {
  const links = [
    ['/', 'Admin'], ['/guest.html', 'Guest'], ['/classement.html', 'Classement'], ['/overlay-round1.html', 'OBS M1'], ['/overlay-round4.html', 'OBS M4'],
  ];
  return <main className="app-shell"><header className="topbar"><a className="brand" href="/"><img src={logo} alt="ZogQuiz" /><span>Control Room</span></a><nav>{links.map(([href, label]) => <a className={active === label.toLowerCase() ? 'active' : ''} href={href} key={href}>{label}</a>)}</nav><Button variant="secondary" onClick={() => window.open('/overlay-round1.html', '_blank')}>Ouvrir overlay</Button></header>{children}</main>;
}
