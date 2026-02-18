import { type HTMLAttributes, forwardRef, type CSSProperties } from 'react';
import styles from './Card.module.css';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'elevated' | 'outline' | 'glass';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  interactive?: boolean;
  color?: string;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'elevated', padding = 'md', interactive = false, color, className = '', children, style, ...props }, ref) => {
    const cardStyle: CSSProperties = { 
      '--card-accent': color || 'var(--coral-400)',
      ...style 
    } as CSSProperties;
    return (
      <div
        ref={ref}
        className={`${styles.card} ${styles[variant]} ${styles[`pad-${padding}`]} ${interactive ? styles.interactive : ''} ${className}`}
        style={cardStyle}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
