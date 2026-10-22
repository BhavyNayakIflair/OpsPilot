import { useEffect, useMemo, useState } from 'react';
import { Activity, Bell, Loader2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useJobs } from '../../context/JobsContext';
import { useToast } from '../../context/toast';
import { useTranslation } from '../../i18n';
import type { BackgroundJob, JobStatus } from '../../lib/jobs';

const activeStatuses = new Set<JobStatus>(['queued', 'running', 'waiting_for_approval']);

function elapsedSince(job: BackgroundJob, now: number): string {
  const start = new Date(job.started_at || job.queued_at || job.created_at).getTime();
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function statusLabel(status: JobStatus, t: ReturnType<typeof useTranslation>['t']): string {
  const keys: Record<JobStatus, Parameters<typeof t>[0]> = {
    queued: 'jobStatusQueued',
    running: 'jobStatusRunning',
    completed: 'jobStatusCompleted',
    failed: 'jobStatusFailed',
    cancelled: 'jobStatusCancelled',
    waiting_for_approval: 'jobStatusWaitingApproval',
  };
  return t(keys[status]);
}

export function ActivityCenter() {
  const { jobs, loading, error, acknowledge, retry } = useJobs();
  const toast = useToast();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const rows = useMemo(
    () => [...jobs.values()]
      .filter((job) => !job.acknowledged_at)
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at)),
    [jobs],
  );
  const activeCount = rows.filter((job) => activeStatuses.has(job.status)).length;

  useEffect(() => {
    if (!activeCount) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [activeCount]);

  const viewJob = (job: BackgroundJob) => {
    setOpen(false);
    if (job.status === 'waiting_for_approval') {
      navigate('/approvals');
      return;
    }
    navigate(`/quotes?job=${encodeURIComponent(job.id)}`);
  };

  const retryJob = async (job: BackgroundJob) => {
    try {
      const next = await retry(job.id);
      toast.info(next.message);
    } catch (retryError) {
      toast.error(retryError instanceof Error ? retryError.message : 'Unable to retry job');
    }
  };

  const dismissJob = async (job: BackgroundJob) => {
    try {
      await acknowledge(job.id);
    } catch (ackError) {
      toast.error(ackError instanceof Error ? ackError.message : 'Unable to dismiss job');
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={t('activityCenter')}
        aria-expanded={open}
        aria-controls="activity-center-panel"
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-ui-xl text-semantic-text-muted transition hover:bg-semantic-surface-muted hover:text-semantic-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-border"
      >
        {activeCount ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Bell className="h-5 w-5" aria-hidden="true" />}
        {activeCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-semantic-accent px-1 text-center text-[10px] font-bold leading-5 text-white">
            {activeCount > 99 ? '99+' : activeCount}
          </span>
        )}
      </button>

      {open && (
        <section
          id="activity-center-panel"
          aria-label={t('activityCenter')}
          aria-live="polite"
          className="fixed right-2 top-16 z-50 max-h-[min(75vh,42rem)] w-[min(26rem,calc(100vw-1rem))] overflow-y-auto rounded-ui-2xl border border-semantic-border bg-semantic-surface shadow-ui-xl sm:right-4"
        >
          <header className="sticky top-0 z-10 flex items-center justify-between border-b border-semantic-border bg-semantic-surface px-4 py-3">
            <div className="flex items-center gap-2 font-semibold text-semantic-text">
              <Activity className="h-4 w-4 text-semantic-accent" aria-hidden="true" />
              {t('activityCenter')}
            </div>
            <button
              type="button"
              aria-label={t('closeNavigation')}
              onClick={() => setOpen(false)}
              className="rounded-ui-lg p-1.5 text-semantic-text-muted hover:bg-semantic-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-border"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>
          {error && <p role="status" className="px-4 py-3 text-xs text-semantic-danger">{error || t('jobStreamError')}</p>}
          {loading && rows.length === 0 && <p className="px-4 py-5 text-sm text-semantic-text-muted">{t('loadingBackgroundJobs')}</p>}
          {!loading && rows.length === 0 && !error && (
            <p className="px-4 py-5 text-sm text-semantic-text-muted">{t('noBackgroundJobs')}</p>
          )}
          <ul className="divide-y divide-semantic-border">
            {rows.map((job) => {
              const active = activeStatuses.has(job.status);
              const title = job.job_type === 'quote_agent' ? t('jobQuoteAgentTitle') : t('jobQuoteDraftTitle');
              const indeterminate = job.status === 'running' && [20, 60, 80].includes(job.progress);
              return (
                <li key={job.id} className="space-y-2.5 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-semantic-text">
                        {title}{job.subject_label ? ` — ${job.subject_label}` : ''}
                      </p>
                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        job.status === 'failed'
                          ? 'bg-semantic-danger-soft text-semantic-danger'
                          : job.status === 'completed'
                            ? 'bg-semantic-success-soft text-semantic-success'
                            : 'bg-semantic-accent-soft text-semantic-accent'
                      }`}>
                        {statusLabel(job.status, t)}
                      </span>
                    </div>
                    <span className="shrink-0 text-[11px] text-semantic-text-muted">
                      {t('jobElapsed', { time: elapsedSince(job, now) })}
                    </span>
                  </div>
                  <p className="text-xs text-semantic-text-muted">{job.error_message || job.message}</p>
                  {active && job.status !== 'waiting_for_approval' && (
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-semantic-surface-muted"
                      role="progressbar"
                      aria-label={t('jobProgress', { percent: job.progress })}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={indeterminate ? undefined : job.progress}
                    >
                      <div
                        className={`h-full rounded-full bg-semantic-accent transition-all ${indeterminate ? 'w-1/3 animate-pulse' : ''}`}
                        style={indeterminate ? undefined : { width: `${job.progress}%` }}
                      />
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {job.status === 'waiting_for_approval' ? (
                      <button type="button" onClick={() => viewJob(job)} className="text-xs font-semibold text-semantic-accent hover:underline">
                        {t('openApprovals')}
                      </button>
                    ) : (
                      <button type="button" onClick={() => viewJob(job)} className="text-xs font-semibold text-semantic-accent hover:underline">
                        {t('jobView')}
                      </button>
                    )}
                    {job.status === 'failed' && (
                      <button type="button" onClick={() => void retryJob(job)} className="text-xs font-semibold text-semantic-accent hover:underline">
                        {t('jobRetry')}
                      </button>
                    )}
                    {!active && (
                      <button type="button" onClick={() => void dismissJob(job)} className="text-xs font-semibold text-semantic-text-muted hover:underline">
                        {t('jobDismiss')}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
