import { type HTMLAttributes, forwardRef } from 'react';
import styles from './Panel.module.css';

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  side?: 'left' | 'right';
  width?: string;
}

export const Panel = forwardRef<HTMLDivElement, PanelProps>(
  ({ side = 'left', width, className = '', children, style, ...props }, ref) => {
    return (
      <aside
        ref={ref}
        className={`${styles.panel} ${styles[side]} ${className}`}
        style={{ width: width || undefined, ...style }}
        {...props}
      >
        {children}
      </aside>
    );
  }
);

Panel.displayName = 'Panel';
