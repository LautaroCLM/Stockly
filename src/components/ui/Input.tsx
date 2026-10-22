import React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, id, disabled, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-medium text-text-secondary"
          >
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          disabled={disabled}
          className={cn(
            'w-full px-3 py-2 text-xs rounded-lg bg-surface-2 border transition-colors',
            'text-text-primary placeholder:text-text-muted',
            'focus:outline-none focus:ring-1',
            error
              ? 'border-danger/60 focus:border-danger focus:ring-danger/30'
              : 'border-border/80 hover:border-border focus:border-primary focus:ring-primary/30',
            disabled && 'opacity-50 cursor-not-allowed',
            className
          )}
          {...props}
        />
        {error && (
          <p className="text-[11px] text-danger font-medium">{error}</p>
        )}
        {helperText && !error && (
          <p className="text-[11px] text-text-muted">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
