import type { InputHTMLAttributes } from 'react';
export function Toggle({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="toggle"><input type="checkbox" {...props} /><span />{label}</label>;
}
