import React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, disabled, ...props }, ref) => {
    const variantStyles = {
      primary:
        'bg-primary text-white hover:bg-primary-hover shadow-sm active:translate-y-[1px]',
      secondary:
        'bg-surface-2 text-text-primary hover:bg-surface-3 border border-border/80 active:translate-y-[1px]',
      ghost:
        'bg-transparent text-text-secondary hover:text-text-primary hover:bg-surface-2',
      outline:
        'bg-transparent border border-border text-text-primary hover:bg-surface-2 active:translate-y-[1px]',
      danger:
        'bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25 active:translate-y-[1px]',
    };

    const sizeStyles = {
      sm: 'h-8 px-2.5 text-xs rounded-md gap-1.5',
      md: 'h-9 px-3.5 text-xs font-medium rounded-lg gap-2',
      lg: 'h-10 px-5 text-sm font-medium rounded-lg gap-2.5',
      icon: 'h-8 w-8 rounded-md p-0 flex items-center justify-center',
    };

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-all select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50 disabled:pointer-events-none',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
