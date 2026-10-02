import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { HTMLAttributes } from 'react';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

type BadgeVariant = 'default' | 'ai' | 'new' | 'count' | 'success' | 'warning' | 'danger' | 'muted';
type BadgeSize = 'sm' | 'md';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-semantic-surface-muted text-semantic-text-muted border border-semantic-border text-[10px] px-2 py-0.5',
  ai: 'bg-indigo-500/15 text-indigo-500 dark:text-indigo-300 border border-indigo-500/30 text-[10px] px-2 py-0.5',
  new: 'bg-sky-500 text-white border border-sky-500/30 text-[10px] px-2 py-0.5',
  count: 'bg-semantic-danger text-white text-[10px] px-2 py-0.5',
  success: 'bg-semantic-success-soft text-semantic-success border border-semantic-success/20 text-[11px] px-2.5 py-1 uppercase tracking-wide',
  warning: 'bg-semantic-warning-soft text-semantic-warning border border-semantic-warning/20 text-[11px] px-2.5 py-1 uppercase tracking-wide',
  danger: 'bg-semantic-danger-soft text-semantic-danger border border-semantic-danger/20 text-[11px] px-2.5 py-1 uppercase tracking-wide',
  muted: 'bg-semantic-surface-muted text-semantic-text-muted border border-semantic-border/70 text-[11px] px-2.5 py-1 uppercase tracking-wide',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'text-[10px] px-2 py-0.5',
  md: 'text-[11px] px-2.5 py-1',
};

const defaultVariantSize: Record<BadgeVariant, BadgeSize> = {
  default: 'sm',
  ai: 'sm',
  new: 'sm',
  count: 'sm',
  success: 'md',
  warning: 'md',
  danger: 'md',
  muted: 'md',
};

export function Badge({ variant = 'default', size, className, ...props }: BadgeProps) {
  const resolvedSize = size ?? defaultVariantSize[variant];
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center font-semibold whitespace-nowrap rounded-full',
        variantClasses[variant],
        sizeClasses[resolvedSize],
        className
      )}
      {...props}
    />
  );
}
