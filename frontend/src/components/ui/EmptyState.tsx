import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Inbox, type LucideIcon } from 'lucide-react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}) => {
  return (
    <div
      className={cn(
        'w-full flex flex-col items-center justify-center text-center py-14 px-6 rounded-ui-2xl border border-dashed border-semantic-border bg-semantic-surface-muted/40',
        className
      )}
    >
      <div className="w-14 h-14 rounded-ui-2xl flex items-center justify-center mb-4 text-semantic-text-muted bg-semantic-surface border border-semantic-border/60">
        <Icon className="w-7 h-7" />
      </div>
      <h3 className="font-semibold text-semantic-text text-lg">{title}</h3>
      {description && (
        <p className="mt-1.5 text-sm text-semantic-text-muted max-w-md">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
};
