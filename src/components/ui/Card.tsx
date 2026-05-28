import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../utils/format';

export function Card({ className, children, ...props }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return <article className={cx('card', className)} {...props}>{children}</article>;
}
