import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  primaryAction?: React.ReactNode;
  statChips?: Array<{
    label: string;
    value: React.ReactNode;
    tone?: 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'muted';
  }>;
  className?: string;
}

const toneValueClasses: Record<string, string> = {
  accent: 'text-semantic-accent',
  success: 'text-semantic-success',
  warning: 'text-semantic-warning',
  danger: 'text-semantic-danger',
  muted: 'text-semantic-text-muted',
  default: 'text-semantic-text',
};

export const PageHeader: React.FC<PageHeaderProps> = ({
  eyebrow,
  title,
  description,
  primaryAction,
  statChips,
  className,
}) => {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4 page-enter', className)}>
      <div className="flex-1 min-w-0">
        {eyebrow && (
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[.16em] text-semantic-accent">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-2xl sm:text-[28px] font-extrabold tracking-tight text-semantic-text">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-semantic-text-muted">
            {description}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-end gap-2 flex flex-wrap">
        {statChips &&
          statChips.map((chip, idx) => (
            <div
              key={idx}
              className="inline-flex flex-col items-start gap-0.5 rounded-ui-xl border border-semantic-border bg-semantic-surface-muted px-3.5 py-2 min-w-[92px]"
            >
              <span className="text-[10px] uppercase tracking-wide text-semantic-text-muted font-semibold">
                {chip.label}
              </span>
              <span className={cn('text-sm font-bold', toneValueClasses[chip.tone || 'default'])}>
                {chip.value}
              </span>
            </div>
          ))}
        {primaryAction}
      </div>
    </div>
  );
};
