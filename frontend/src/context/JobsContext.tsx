import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useToast } from './toast';
import {
  acknowledgeJob as acknowledgeJobRequest,
  getJob,
  listJobs,
  retryJob as retryJobRequest,
  streamJobs,
  type BackgroundJob,
  type JobSubmission,
} from '../lib/jobs';
import { useTranslation } from '../i18n';

interface JobsContextValue {
  jobs: Map<string, BackgroundJob>;
  loading: boolean;
  error: string;
  upsertJob: (job: BackgroundJob) => void;
  refreshJob: (jobId: string, originPath?: string) => Promise<BackgroundJob>;
  acknowledge: (jobId: string) => Promise<void>;
  retry: (jobId: string) => Promise<JobSubmission>;
}

const inertJobsContext: JobsContextValue = {
  jobs: new Map(),
  loading: false,
  error: '',
  upsertJob: () => undefined,
  refreshJob: async () => {
    throw new Error('JobsProvider is not mounted');
  },
  acknowledge: async () => undefined,
  retry: async () => {
    throw new Error('JobsProvider is not mounted');
  },
};

const JobsContext = createContext<JobsContextValue>(inertJobsContext);
const activeStatuses = new Set(['queued', 'running', 'waiting_for_approval']);
const terminalStatuses = new Set(['completed', 'failed', 'cancelled']);

type Action =
  | { type: 'reset'; jobs: BackgroundJob[] }
  | { type: 'upsert'; job: BackgroundJob }
  | { type: 'remove'; jobId: string };

function jobsReducer(state: Map<string, BackgroundJob>, action: Action): Map<string, BackgroundJob> {
  if (action.type === 'reset') return new Map(action.jobs.map((job) => [job.id, job]));
  const next = new Map(state);
  if (action.type === 'remove') next.delete(action.jobId);
  else next.set(action.job.id, { ...next.get(action.job.id), ...action.job });
  return next;
}

function originPath(job: BackgroundJob): string {
  if (job.originPath) return job.originPath;
  return job.job_type === 'quote_draft' ? '/quotes' : '/workflows';
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal.addEventListener('abort', () => {
      window.clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export function JobsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const toast = useToast();
  const { t } = useTranslation();
  const [jobs, dispatch] = useReducer(jobsReducer, new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const jobsRef = useRef(jobs);
  const pathnameRef = useRef(pathname);
  jobsRef.current = jobs;
  pathnameRef.current = pathname;

  const upsertJob = useCallback((job: BackgroundJob) => {
    const previous = jobsRef.current.get(job.id);
    const nextJob = { ...previous, ...job };
    if (
      previous
      && activeStatuses.has(previous.status)
      && terminalStatuses.has(nextJob.status)
      && !pathnameRef.current.startsWith(originPath(nextJob))
    ) {
      toast.info(nextJob.status === 'failed' ? t('jobFailedToast') : t('jobCompletedToast'));
    }
    dispatch({ type: 'upsert', job: nextJob });
  }, [toast, t]);

  const refreshJob = useCallback(async (jobId: string, sourcePath?: string) => {
    const job = await getJob(jobId);
    const normalized = sourcePath ? { ...job, originPath: sourcePath } : job;
    upsertJob(normalized);
    return normalized;
  }, [upsertJob]);

  const acknowledge = useCallback(async (jobId: string) => {
    const job = await acknowledgeJobRequest(jobId);
    dispatch({ type: 'upsert', job });
  }, []);

  const retry = useCallback(async (jobId: string) => {
    const submission = await retryJobRequest(jobId);
    await refreshJob(submission.job_id);
    return submission;
  }, [refreshJob]);

  useEffect(() => {
    if (!user) {
      dispatch({ type: 'reset', jobs: [] });
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const { signal } = controller;
    let streamFailures = 0;

    const hydrate = async () => {
      try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const [active, recent] = await Promise.all([
          listJobs('active=true&limit=100'),
          listJobs(`since=${encodeURIComponent(since)}&limit=100`),
        ]);
        if (!signal.aborted) {
          dispatch({ type: 'reset', jobs: [...new Map([...active, ...recent].map((job) => [job.id, job])).values()] });
          setError('');
        }
      } catch (loadError) {
        if (!signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load background jobs');
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    };

    const pollWhileActive = async () => {
      let delay = 2000;
      while (!signal.aborted) {
        try {
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const [active, recent] = await Promise.all([
            listJobs('active=true&limit=100'),
            listJobs(`since=${encodeURIComponent(since)}&limit=100`),
          ]);
          for (const job of [...active, ...recent]) upsertJob(job);
          if (active.length === 0) return;
          setError('');
        } catch (pollError) {
          setError(pollError instanceof Error ? pollError.message : 'Unable to refresh background jobs');
        }
        await wait(delay, signal);
        delay = Math.min(delay * 2, 10000);
      }
    };

    const monitor = async () => {
      await hydrate();
      while (!signal.aborted) {
        try {
          await streamJobs(signal, {
            onSnapshot: (snapshot) => {
              for (const job of snapshot) upsertJob(job);
            },
            onJob: upsertJob,
            onReconnect: () => undefined,
          });
          streamFailures = 0;
        } catch (streamError) {
          if (signal.aborted) return;
          streamFailures += 1;
          setError(streamError instanceof Error ? streamError.message : 'Job stream disconnected');
          if (streamFailures >= 2) {
            await pollWhileActive();
            streamFailures = 0;
          }
        }
        if (!signal.aborted) await wait(Math.min(1000 * 2 ** streamFailures, 10000), signal);
      }
    };

    void monitor();
    return () => controller.abort();
  }, [user?.id, user?.org_id, upsertJob]);

  const value = useMemo(
    () => ({ jobs, loading, error, upsertJob, refreshJob, acknowledge, retry }),
    [jobs, loading, error, upsertJob, refreshJob, acknowledge, retry],
  );
  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>;
}

export function useJobs(): JobsContextValue {
  return useContext(JobsContext);
}

export function useJobForSubject(jobType: string, subjectId: string): BackgroundJob | undefined {
  const { jobs } = useJobs();
  return useMemo(() => [...jobs.values()]
    .filter((job) => job.job_type === jobType && job.subject_id === subjectId && !job.acknowledged_at)
    .sort((left, right) => right.created_at.localeCompare(left.created_at))[0], [jobs, jobType, subjectId]);
}
