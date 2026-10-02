import React, { useEffect, useState } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Circle,
  RotateCcw,
} from 'lucide-react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface AIProgressProps {
  steps: string[];
  status: 'running' | 'success' | 'error';
  currentStep?: number;
  autoAdvanceMs?: number;
  errorMessage?: string;
  onRetry?: () => void;
  resultPreview?: React.ReactNode;
  title?: string;
}

const AIProgress: React.FC<AIProgressProps> = ({
  steps,
  status,
  currentStep: currentStepProp,
  autoAdvanceMs = 7000,
  errorMessage,
  onRetry,
  resultPreview,
  title,
}) => {
  const [autoStep, setAutoStep] = useState(0);

  useEffect(() => {
    if (status !== 'running' || currentStepProp !== undefined) return;
    const id = setInterval(() => {
      setAutoStep((prev) => (prev + 1) % steps.length);
    }, autoAdvanceMs);
    return () => clearInterval(id);
  }, [status, currentStepProp, steps.length, autoAdvanceMs]);

  useEffect(() => {
    if (status === 'running') setAutoStep(0);
  }, [status]);

  const activeStep =
    currentStepProp !== undefined ? currentStepProp : autoStep;

  const defaultTitle =
    status === 'running'
      ? 'AI working…'
      : status === 'success'
        ? 'AI complete'
        : status === 'error'
          ? 'Something went wrong'
          : '';

  const wrapperClasses = cn(
    'rounded-ui-2xl border p-5 sm:p-6 shadow-ui-md',
    status === 'running' &&
      'border-semantic-accent/40 bg-gradient-to-br from-semantic-accent-soft via-semantic-surface to-white dark:to-semantic-surface',
    status === 'success' &&
      'border-semantic-success/40 bg-gradient-to-br from-semantic-success-soft via-semantic-surface to-white dark:to-semantic-surface',
    status === 'error' &&
      'border-semantic-danger/40 bg-gradient-to-br from-semantic-danger-soft via-semantic-surface to-white dark:to-semantic-surface'
  );

  const titleIconClasses = cn(
    status === 'running' && 'text-semantic-accent',
    status === 'success' && 'text-semantic-success',
    status === 'error' && 'text-semantic-danger'
  );

  return (
    <div className={wrapperClasses}>
      <div className="flex items-center gap-3 mb-5">
        <div
          className={cn(
            'w-9 h-9 rounded-ui-xl flex items-center justify-center',
            status === 'running' && 'bg-semantic-accent-soft',
            status === 'success' && 'bg-semantic-success-soft',
            status === 'error' && 'bg-semantic-danger-soft'
          )}
        >
          {status === 'running' && (
            <Loader2 className={cn('w-5 h-5 animate-spin', titleIconClasses)} />
          )}
          {status === 'success' && (
            <Sparkles className={cn('w-5 h-5', titleIconClasses)} />
          )}
          {status === 'error' && (
            <AlertCircle className={cn('w-5 h-5', titleIconClasses)} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-semantic-text text-sm sm:text-base">
            {title ?? defaultTitle}
          </div>
          {status === 'running' && steps[activeStep] && (
            <div className="text-xs sm:text-sm text-semantic-text-muted mt-0.5">
              {steps[activeStep]}
            </div>
          )}
        </div>
        {status === 'running' && (
          <Sparkles className="w-4 h-4 text-semantic-accent/70 animate-pulse" />
        )}
        {status === 'success' && (
          <CheckCircle2 className="w-5 h-5 text-semantic-success" />
        )}
      </div>

      {status !== 'success' && (
        <ul className="space-y-2.5">
          {steps.map((step, idx) => {
            const isCurrent = idx === activeStep;
            // This list only renders while status is 'running' or 'error';
            // steps before the active one have already been presented as done.
            const isPast = idx < activeStep;
            const isFuture = idx > activeStep;

            return (
              <li key={idx} className="flex items-start gap-3">
                <div className="mt-0.5 flex-shrink-0">
                  {isCurrent && status === 'running' && (
                    <Loader2 className="w-4 h-4 animate-spin text-semantic-accent" />
                  )}
                  {isPast && (
                    <CheckCircle2 className="w-4 h-4 text-semantic-success" />
                  )}
                  {isFuture && (
                    <Circle className="w-4 h-4 text-semantic-text-muted/60" />
                  )}
                  {isCurrent && status === 'error' && (
                    <AlertCircle className="w-4 h-4 text-semantic-danger" />
                  )}
                </div>
                <span
                  className={cn(
                    'text-sm',
                    isCurrent && status === 'running' && [
                      'font-bold text-semantic-accent',
                    ],
                    isPast && 'text-semantic-text-muted line-through',
                    isFuture && 'text-semantic-text-muted',
                    isCurrent && status === 'error' && [
                      'font-semibold text-semantic-danger',
                    ]
                  )}
                >
                  {step}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {status === 'success' && (
        <div className="flex items-center gap-2 rounded-ui-xl border border-semantic-success/30 bg-semantic-success-soft/60 px-4 py-3 mb-4">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-semantic-success" />
            <Sparkles className="w-3.5 h-3.5 text-semantic-accent" />
          </div>
          <span className="text-sm font-medium text-semantic-text">
            All steps completed successfully
          </span>
        </div>
      )}

      {resultPreview !== undefined && status === 'success' && (
        <div className="mt-1">{resultPreview}</div>
      )}

      {status === 'error' && errorMessage && (
        <div className="mt-4 flex items-start gap-3 rounded-ui-xl border border-semantic-danger/30 bg-semantic-danger-soft/60 px-4 py-3">
          <AlertCircle className="w-4 h-4 text-semantic-danger mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-semantic-danger">
              {errorMessage}
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 inline-flex items-center gap-1.5 rounded-ui-lg bg-semantic-danger px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      {status === 'error' && !errorMessage && onRetry && (
        <div className="mt-4">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-ui-lg bg-semantic-danger px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            <RotateCcw className="w-4 h-4" />
            Retry
          </button>
        </div>
      )}
    </div>
  );
};

export default AIProgress;
