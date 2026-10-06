import React, { useEffect, useState } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  Sparkles,
  Loader2,
  AlertTriangle,
  Clock,
  RotateCcw,
  ShieldCheck,
  Server,
  XCircle,
} from 'lucide-react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type AIGatewayStatus = 'idle' | 'generating' | 'degraded' | 'busy' | 'error' | 'success';

export interface AIGatewayBannerProps {
  status: AIGatewayStatus;
  attempt?: { current: number; total: number };
  providerName?: string;
  modelName?: string;
  retrySeconds?: number;
  errorMessage?: string;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}

export const AIGatewayBanner: React.FC<AIGatewayBannerProps> = ({
  status,
  attempt = { current: 1, total: 3 },
  providerName,
  modelName,
  retrySeconds = 30,
  errorMessage,
  onRetry,
  className,
  compact = false,
}) => {
  const [countdown, setCountdown] = useState(retrySeconds);

  useEffect(() => {
    if (status === 'busy') {
      setCountdown(retrySeconds);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [status, retrySeconds]);

  if (status === 'idle') {
    return null;
  }

  // 1. Generating State: "Generating… (attempt 1/3)"
  if (status === 'generating') {
    return (
      <div
        className={cn(
          'flex items-center justify-between gap-3 rounded-ui-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-700 dark:text-indigo-300 shadow-sm transition-all animate-pulse',
          compact && 'py-2 px-3 text-xs',
          className
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
          <span className="font-medium truncate">
            Generating… (attempt {attempt.current}/{attempt.total})
          </span>
          {providerName && (
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-2 py-0.5 text-[11px] font-mono text-indigo-800 dark:text-indigo-200 border border-indigo-500/20">
              <Server className="w-3 h-3" />
              {providerName}
              {modelName && ` : ${modelName}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 flex-shrink-0">
          <Sparkles className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Routing free tier</span>
        </div>
      </div>
    );
  }

  // 2. Degraded State: "Degraded: using local model"
  if (status === 'degraded') {
    return (
      <div
        className={cn(
          'flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-ui-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 shadow-sm',
          compact && 'py-2 px-3 text-xs',
          className
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <div className="min-w-0">
            <span className="font-semibold text-amber-900 dark:text-amber-100">
              Degraded: using local model
            </span>
            <span className="hidden md:inline text-amber-700 dark:text-amber-300 ml-2">
              (Cloud rate limits reached; served via private local fallback)
            </span>
          </div>
          {providerName && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-mono text-amber-900 dark:text-amber-100 border border-amber-500/30">
              <ShieldCheck className="w-3 h-3 text-amber-600" />
              {providerName}
            </span>
          )}
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-ui-lg border border-amber-500/40 bg-white/60 dark:bg-amber-950/40 px-3 py-1 text-xs font-semibold text-amber-800 dark:text-amber-200 hover:bg-amber-500/20 transition self-start sm:self-auto"
          >
            <RotateCcw className="w-3 h-3" />
            Retry Cloud
          </button>
        )}
      </div>
    );
  }

  // 3. Busy State: "All providers busy, retry in 30s"
  if (status === 'busy') {
    return (
      <div
        className={cn(
          'flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-ui-xl border border-orange-500/40 bg-orange-500/10 px-4 py-3 text-sm text-orange-800 dark:text-orange-200 shadow-sm',
          compact && 'py-2 px-3 text-xs',
          className
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Clock className="w-4 h-4 text-orange-600 dark:text-orange-400 flex-shrink-0" />
          <div className="min-w-0">
            <span className="font-semibold text-orange-900 dark:text-orange-100">
              All providers busy, retry in {countdown}s
            </span>
            <span className="hidden md:inline text-orange-700 dark:text-orange-300 ml-2">
              (Free quota windows regenerating)
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {onRetry && (
            <button
              type="button"
              disabled={countdown > 0}
              onClick={onRetry}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-ui-lg border px-3 py-1 text-xs font-semibold transition',
                countdown > 0
                  ? 'border-orange-500/20 bg-orange-500/5 text-orange-400 cursor-not-allowed opacity-60'
                  : 'border-orange-500/40 bg-orange-600 text-white hover:bg-orange-700 shadow-sm'
              )}
            >
              <RotateCcw className="w-3 h-3" />
              {countdown > 0 ? `Wait ${countdown}s` : 'Retry Now'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // 4. Error / Capacity Exhausted State: Fallback banner with retry button
  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-ui-xl border border-semantic-danger/40 bg-semantic-danger-soft px-4 py-3 text-sm text-semantic-danger shadow-sm',
        compact && 'py-2 px-3 text-xs',
        className
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <XCircle className="w-4 h-4 text-semantic-danger flex-shrink-0" />
        <div className="min-w-0">
          <span className="font-semibold">AI request failed</span>
          <span className="ml-2 text-xs opacity-90 truncate inline-block max-w-md align-bottom">
            {errorMessage || 'Free provider capacity temporarily exhausted across all fallback routes.'}
          </span>
        </div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-ui-lg bg-semantic-danger px-3 py-1 text-xs font-semibold text-white hover:opacity-90 transition shadow-sm self-start sm:self-auto"
        >
          <RotateCcw className="w-3 h-3" />
          Retry
        </button>
      )}
    </div>
  );
};

export default AIGatewayBanner;
