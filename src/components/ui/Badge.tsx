import React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'neutral';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = 'neutral',
  size = 'sm',
  children,
  ...props
}) => {
  const variantStyles = {
    primary: 'bg-primary/15 text-primary-light border-primary/25',
    accent: 'bg-accent/15 text-accent border-accent/25',
    success: 'bg-success/15 text-success border-success/25',
    warning: 'bg-warning/15 text-warning border-warning/25',
    danger: 'bg-danger/15 text-danger border-danger/25',
    neutral: 'bg-surface-2 text-text-secondary border-border',
  };

  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5 tracking-tight',
    md: 'text-xs px-2.5 py-1',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-md border transition-colors',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
};
