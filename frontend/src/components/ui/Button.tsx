import * as React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Loader2 } from 'lucide-react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  asChild?: boolean;
}

const baseStyles =
  'transition-all duration-180ms focus-visible:outline-none focus-visible:ring-4 disabled:opacity-50 disabled:pointer-events-none inline-flex items-center justify-center gap-2 font-semibold';

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-semantic-accent text-white hover:bg-semantic-accent-hover focus-visible:ring-semantic-accent-ring rounded-ui-xl shadow-ui-sm',
  secondary:
    'border border-semantic-border bg-semantic-surface text-semantic-text hover:bg-semantic-surface-muted focus-visible:ring-semantic-border rounded-ui-xl',
  destructive:
    'bg-semantic-danger text-white hover:bg-red-700 dark:hover:bg-red-600 focus-visible:ring-semantic-danger-ring rounded-ui-xl',
  ghost:
    'text-semantic-text-muted hover:bg-semantic-surface-muted focus-visible:ring-semantic-border rounded-ui-lg',
  outline:
    'border border-semantic-border bg-semantic-surface text-semantic-text hover:bg-semantic-surface-muted focus-visible:ring-semantic-border rounded-ui-xl',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'min-h-[36px] px-3 text-xs py-1.5 rounded-ui-lg',
  md: 'min-h-[40px] px-4 py-2 text-sm rounded-ui-xl',
  lg: 'min-h-[48px] px-5 py-2.5 text-base rounded-ui-xl',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      className,
      children,
      disabled,
      onClick,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
      if (loading) {
        event.preventDefault();
        return;
      }
      onClick?.(event);
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        onClick={handleClick}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
