import React from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from './hooks/useToast';
import { AdminPage } from './pages/AdminPage';
import { GuestPage } from './pages/GuestPage';
import { ScoreboardPage } from './pages/ScoreboardPage';
import { OverlayRouter } from './overlays/OverlayRouter';
import './styles/global.css';

function App() {
  const path = window.location.pathname;
  if (path.includes('guest') || path.includes('buzzer')) return <GuestPage />;
  if (path.includes('classement')) return <ScoreboardPage />;
  if (path.includes('overlay')) return <OverlayRouter name={path} />;
  return <AdminPage />;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><ToastProvider><App /></ToastProvider></React.StrictMode>);
