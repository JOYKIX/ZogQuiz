import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../../utils/format';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; children: ReactNode };
export function Button({ variant = 'primary', className, children, ...props }: Props) {
  return <button className={cx('btn', `btn-${variant}`, className)} {...props}>{children}</button>;
}
