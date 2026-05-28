import type { ReactNode } from 'react';
import { Button } from './Button';

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><section className="modal card"><header className="modal-header"><h2>{title}</h2><Button variant="ghost" onClick={onClose}>Fermer</Button></header>{children}</section></div>;
}
