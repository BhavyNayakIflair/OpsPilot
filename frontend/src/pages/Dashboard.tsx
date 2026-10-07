import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Timer,
  Users,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Card, CardHeader, CardContent, PageHeader, Badge, Skeleton, Alert, EmptyState } from '../components/ui/';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Lead = { id: string; title: string; value_cents: number; currency: string; status: string; source: string; created_at: string };
type Project = { id: string; name: string; budget_minutes: number; status: string };
type Entry = { id: string; project_id: string; minutes: number; approval_status: string; is_billable: boolean };
type Approval = { id: string; entity_type: string; label: string; amount_cents?: number; currency?: string; created_at: string };

/* ------------------------------------------------------------------ */
/* Motion helpers                                                      */
/* ------------------------------------------------------------------ */

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Counts from 0 up to `target` with an ease-out curve. Skips animation if the user prefers reduced motion. */
function useCountUp(target: number, duration = 1100) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion() || target === 0) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

/** Becomes true right after first paint so CSS width/offset transitions can run from their empty state. */
function useAfterPaint() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);
  return ready;
}

const AnimatedNumber = ({ value, decimals = 0 }: { value: number; decimals?: number }) => {
  const current = useCountUp(value);
  return <>{current.toFixed(decimals)}</>;
};

const dashStyles = `
@keyframes dash-rise {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: none; }
}
.dash-rise { animation: dash-rise 560ms cubic-bezier(0.22, 1, 0.36, 1) both; }
@media (prefers-reduced-motion: reduce) {
  .dash-rise { animation: none; }
}
`;

/* ------------------------------------------------------------------ */
/* KPI card                                                            */
/* ------------------------------------------------------------------ */

type Tone = 'sky' | 'indigo' | 'amber' | 'rose';

const toneStyles: Record<Tone, { tile: string; bar: string; glow: string }> = {
  sky: { tile: 'bg-sky-500/10 text-sky-600 dark:text-sky-400', bar: 'bg-sky-500', glow: 'from-sky-500' },
  indigo: { tile: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400', bar: 'bg-indigo-500', glow: 'from-indigo-500' },
  amber: { tile: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', bar: 'bg-amber-500', glow: 'from-amber-500' },
  rose: { tile: 'bg-rose-500/10 text-rose-600 dark:text-rose-400', bar: 'bg-rose-500', glow: 'from-rose-500' },
};

type KpiCardProps = {
  name: string;
  value: number;
  description: string;
  icon: ComponentType<{ className?: string }>;
  tone: Tone;
  to: string;
  progress?: number;
  index: number;
};

const KpiCard = ({ name, value, description, icon: Icon, tone, to, progress, index }: KpiCardProps) => {
  const ready = useAfterPaint();
  const styles = toneStyles[tone];
  return (
    <Link
      to={to}
      className="dash-rise group block rounded-ui-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-accent-ring"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <Card className="relative h-full overflow-hidden transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-ui-lg">
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100',
            styles.glow
          )}
        />
        <CardContent>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-semantic-text-muted">{name}</div>
              <div className="mt-2 font-display text-3xl font-extrabold tabular-nums text-semantic-text sm:text-4xl">
                <AnimatedNumber value={value} />
              </div>
            </div>
            <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-ui-xl', styles.tile)}>
              <Icon className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-xs text-semantic-text-muted">{description}</p>
          {progress !== undefined && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-semantic-surface-muted">
              <div
                className={cn('h-full rounded-full transition-[width] duration-1000 ease-out', styles.bar)}
                style={{ width: `${ready ? progress : 0}%` }}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
};

/* ------------------------------------------------------------------ */
/* Insight widgets                                                     */
/* ------------------------------------------------------------------ */

const statusColors = ['bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-indigo-500', 'bg-slate-400'];

const prettyLabel = (value: string) => {
  const text = value.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const LeadBreakdown = ({ leads }: { leads: Lead[] }) => {
  const ready = useAfterPaint();
  const groups = Object.entries(
    leads.reduce<Record<string, number>>((acc, lead) => {
      acc[lead.status] = (acc[lead.status] || 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);
  const total = leads.length;

  if (!total) {
    return <EmptyState icon={Users} title="No leads to chart" description="Lead status mix appears once leads exist." className="py-6" />;
  }

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-semantic-surface-muted">
        {groups.map(([status, count], i) => (
          <div
            key={status}
            title={`${prettyLabel(status)}: ${count}`}
            className={cn('h-full transition-[width] duration-1000 ease-out first:rounded-l-full last:rounded-r-full', statusColors[i % statusColors.length])}
            style={{ width: ready ? `${(count / total) * 100}%` : '0%' }}
          />
        ))}
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {groups.map(([status, count], i) => (
          <li key={status} className="flex items-center justify-between gap-3 rounded-ui-xl bg-semantic-surface-muted/60 px-3 py-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', statusColors[i % statusColors.length])} />
              <span className="truncate font-medium text-semantic-text">{prettyLabel(status)}</span>
            </span>
            <span className="shrink-0 text-xs tabular-nums text-semantic-text-muted">
              <span className="font-bold text-semantic-text">{count}</span> · {Math.round((count / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const BillableRing = ({ billableHours, totalHours }: { billableHours: number; totalHours: number }) => {
  const ready = useAfterPaint();
  const pct = totalHours > 0 ? Math.min(100, (billableHours / totalHours) * 100) : 0;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - (ready ? pct : 0) / 100);

  if (totalHours <= 0) {
    return <EmptyState icon={Clock3} title="No time logged yet" description="Billable share shows once timesheets exist." className="py-6" />;
  }

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center sm:gap-8">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" role="img" aria-label={`${pct.toFixed(0)} percent of logged time is billable`}>
          <circle cx="64" cy="64" r={radius} fill="none" strokeWidth="12" className="stroke-current text-semantic-surface-muted" />
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="stroke-current text-semantic-accent transition-[stroke-dashoffset] duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-3xl font-extrabold tabular-nums text-semantic-text">
            <AnimatedNumber value={pct} />%
          </span>
          <span className="text-[11px] font-medium text-semantic-text-muted">billable</span>
        </div>
      </div>
      <dl className="grid w-full max-w-[220px] gap-3 text-sm">
        <div className="flex items-center justify-between gap-3 rounded-ui-xl bg-semantic-surface-muted/60 px-3 py-2">
          <dt className="flex items-center gap-2 text-semantic-text-muted">
            <span className="h-2.5 w-2.5 rounded-full bg-semantic-accent" />
            Billable
          </dt>
          <dd className="font-bold tabular-nums text-semantic-text">{billableHours.toFixed(1)}h</dd>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-ui-xl bg-semantic-surface-muted/60 px-3 py-2">
          <dt className="flex items-center gap-2 text-semantic-text-muted">
            <span className="h-2.5 w-2.5 rounded-full bg-semantic-surface-muted ring-1 ring-semantic-border" />
            Total logged
          </dt>
          <dd className="font-bold tabular-nums text-semantic-text">{totalHours.toFixed(1)}h</dd>
        </div>
      </dl>
    </div>
  );
};

const ProjectRow = ({ project, used }: { project: Project; used: number }) => {
  const ready = useAfterPaint();
  const budget = project.budget_minutes / 60;
  const pct = budget ? Math.min(100, (used / budget) * 100) : 0;
  return (
    <div className="border-b border-semantic-border/60 py-2.5 last:border-0">
      <div className="flex items-center justify-between gap-2 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold text-semantic-text">{project.name}</span>
          <Badge variant="muted">{project.status.charAt(0).toUpperCase() + project.status.slice(1)}</Badge>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-semantic-text-muted">
          {used.toFixed(1)} / {budget.toFixed(1)}h
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-semantic-surface-muted">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-1000 ease-out',
            pct >= 80 ? 'bg-semantic-warning' : 'bg-semantic-accent'
          )}
          style={{ width: `${ready ? pct : 0}%` }}
        />
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export const Dashboard = () => {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [leadRows, projectRows, entryRows, approvalRows] = await Promise.all([
        apiRequest<Lead[]>('/crm/leads'),
        apiRequest<Project[]>('/operations/projects'),
        apiRequest<Entry[]>('/operations/timesheets'),
        apiRequest<Approval[]>('/workflows/approvals').catch(() => []),
      ]);
      setLeads(leadRows);
      setProjects(projectRows);
      setEntries(entryRows);
      setApprovals(approvalRows);
      setError('');
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dashboard data is unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeLeads = leads.filter((lead) => lead.status === 'open');
  const activeProjects = projects.filter((project) => project.status === 'active');
  const pendingEntries = entries.filter((entry) => entry.approval_status === 'pending');
  const billableHours = entries.filter((entry) => entry.is_billable && entry.approval_status === 'approved').reduce((sum, entry) => sum + entry.minutes, 0) / 60;

  // Derived insight data (all computed from the same API responses)
  const totalLoggedHours = entries.reduce((sum, entry) => sum + entry.minutes, 0) / 60;
  const billableLoggedHours = entries.filter((entry) => entry.is_billable).reduce((sum, entry) => sum + entry.minutes, 0) / 60;
  const pipelineByCurrency = Object.entries(
    activeLeads.reduce<Record<string, number>>((acc, lead) => {
      acc[lead.currency] = (acc[lead.currency] || 0) + lead.value_cents;
      return acc;
    }, {})
  );
  const pipelineLabel = pipelineByCurrency.length
    ? pipelineByCurrency
        .map(([currency, cents]) => `${currency} ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
        .join(' · ')
    : null;

  const statChips = [
    { label: 'Open leads', value: activeLeads.length, tone: 'accent' as const },
    { label: 'Active projects', value: activeProjects.length, tone: 'accent' as const },
    { label: 'Pending time entries', value: pendingEntries.length, tone: 'warning' as const },
    { label: 'Approvals needed', value: approvals.length, tone: 'danger' as const },
  ];

  const cards: Omit<KpiCardProps, 'index'>[] = [
    {
      name: 'Open leads',
      value: activeLeads.length,
      description: `${leads.length} total leads`,
      icon: Users,
      tone: 'sky',
      to: '/crm',
      progress: leads.length ? (activeLeads.length / leads.length) * 100 : 0,
    },
    {
      name: 'Active projects',
      value: activeProjects.length,
      description: `${projects.length} total projects`,
      icon: BriefcaseBusiness,
      tone: 'indigo',
      to: '/projects',
      progress: projects.length ? (activeProjects.length / projects.length) * 100 : 0,
    },
    {
      name: 'Pending time entries',
      value: pendingEntries.length,
      description: `${billableHours.toFixed(1)} approved billable hours`,
      icon: Clock3,
      tone: 'amber',
      to: '/timesheets',
      progress: entries.length ? (pendingEntries.length / entries.length) * 100 : 0,
    },
    {
      name: 'Approvals needed',
      value: approvals.length,
      description: 'Time, expenses and quote drafts',
      icon: CheckCircle2,
      tone: 'rose',
      to: '/approvals',
    },
  ];

  const projectHours = (project: Project) => entries.filter((entry) => entry.project_id === project.id).reduce((sum, entry) => sum + entry.minutes, 0) / 60;

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const firstName = user?.full_name?.split(' ')[0] || 'there';

  return (
    <div className="page-shell space-y-6">
      <style>{dashStyles}</style>

      <PageHeader
        eyebrow="Workspace overview"
        title={`Good to see you, ${firstName}`}
        description={
          <>
            Live activity for <span className="font-semibold text-semantic-accent">{user?.org_name || 'your workspace'}</span>. Here&rsquo;s what needs attention today.
          </>
        }
        primaryAction={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/crm"
              className={cn(
                'transition-all duration-180ms focus-visible:outline-none focus-visible:ring-4 inline-flex items-center justify-center gap-2 font-semibold',
                'bg-semantic-accent text-white hover:bg-semantic-accent-hover focus-visible:ring-semantic-accent-ring rounded-ui-xl shadow-ui-sm',
                'min-h-[40px] px-4 py-2 text-sm'
              )}
            >
              <Users className="h-4 w-4" />
              Open CRM
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              to="/approvals"
              className={cn(
                'transition-all duration-180ms focus-visible:outline-none focus-visible:ring-4 inline-flex items-center justify-center gap-2 font-semibold',
                'border border-semantic-border bg-semantic-surface text-semantic-text hover:bg-semantic-surface-muted focus-visible:ring-semantic-border rounded-ui-xl',
                'min-h-[40px] px-4 py-2 text-sm'
              )}
            >
              Review approvals
            </Link>
          </div>
        }
        statChips={statChips}
      />

      {/* Live status + refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-semantic-text-muted">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="font-medium">Live data</span>
          {lastUpdated && (
            <span className="text-semantic-text-subtle">
              · updated {lastUpdated.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-ui-xl border border-semantic-border bg-semantic-surface px-3 py-1.5 text-xs font-semibold text-semantic-text-muted transition hover:bg-semantic-surface-muted hover:text-semantic-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-border disabled:opacity-60"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {error && (
        <Alert variant="danger">
          {error}
        </Alert>
      )}

      {loading ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} variant="stat-tile" />
            ))}
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Skeleton variant="card" />
            <Skeleton variant="card" />
          </div>
        </>
      ) : (
        <>
          {/* KPI row: numbers count up, bars fill in, whole card links to its page */}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card, index) => (
              <KpiCard key={card.name} index={index} {...card} />
            ))}
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="dash-rise" style={{ animationDelay: '280ms' }}>
              <Card className="h-full">
                <CardHeader>
                  <div>
                    <h2 className="font-bold text-semantic-text">Recent leads</h2>
                    <p className="mt-1 text-xs text-semantic-text-muted">
                      {pipelineLabel ? `${pipelineLabel} in open pipeline` : 'Opportunities in progress'}
                    </p>
                  </div>
                  <Link to="/crm" className="text-xs font-semibold text-semantic-accent">
                    View pipeline &rarr;
                  </Link>
                </CardHeader>
                <CardContent className={cn(activeLeads.length === 0 && 'py-0')}>
                  {activeLeads.length === 0 ? (
                    <div className="py-5">
                      <EmptyState
                        icon={Users}
                        title="No open leads yet"
                        description="Add the first opportunity in CRM."
                        action={
                          <Link
                            to="/crm"
                            className={cn(
                              'transition-all duration-180ms focus-visible:outline-none focus-visible:ring-4 inline-flex items-center justify-center gap-2 font-semibold',
                              'bg-semantic-accent text-white hover:bg-semantic-accent-hover focus-visible:ring-semantic-accent-ring rounded-ui-xl shadow-ui-sm',
                              'min-h-[40px] px-4 py-2 text-sm'
                            )}
                          >
                            Add lead
                          </Link>
                        }
                      />
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {activeLeads.slice(0, 6).map((lead) => (
                        <div
                          key={lead.id}
                          className="-mx-2 flex items-center justify-between gap-3 rounded-ui-xl border-b border-semantic-border/60 px-2 py-3 transition-colors last:border-0 hover:bg-semantic-surface-muted/60"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-semantic-text">{lead.title}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <p className="text-xs text-semantic-text-muted">{lead.source}</p>
                              <Badge variant="muted">{formatDate(lead.created_at)}</Badge>
                            </div>
                          </div>
                          <span className="shrink-0 text-xs font-bold tabular-nums text-semantic-text">
                            {lead.currency} {(lead.value_cents / 100).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="dash-rise" style={{ animationDelay: '350ms' }}>
              <Card className="h-full">
                <CardHeader>
                  <div>
                    <h2 className="font-bold text-semantic-text">Project time</h2>
                    <p className="mt-1 text-xs text-semantic-text-muted">Logged hours against budget</p>
                  </div>
                  <Link to="/projects" className="text-xs font-semibold text-semantic-accent">
                    Manage projects &rarr;
                  </Link>
                </CardHeader>
                <CardContent className={cn(activeProjects.length === 0 && 'py-0')}>
                  {activeProjects.length === 0 ? (
                    <div className="py-5">
                      <EmptyState
                        icon={BriefcaseBusiness}
                        title="No active projects yet"
                        description="Projects will appear here once started."
                      />
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {activeProjects.slice(0, 6).map((project) => (
                        <ProjectRow key={project.id} project={project} used={projectHours(project)} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Insight widgets built from the same data */}
            <div className="dash-rise" style={{ animationDelay: '420ms' }}>
              <Card className="h-full">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-semantic-accent" />
                    <div>
                      <h2 className="font-bold text-semantic-text">Lead status mix</h2>
                      <p className="mt-1 text-xs text-semantic-text-muted">{leads.length} leads by stage</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <LeadBreakdown leads={leads} />
                </CardContent>
              </Card>
            </div>

            <div className="dash-rise" style={{ animationDelay: '490ms' }}>
              <Card className="h-full">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Timer className="h-4 w-4 text-semantic-accent" />
                    <div>
                      <h2 className="font-bold text-semantic-text">Billable share</h2>
                      <p className="mt-1 text-xs text-semantic-text-muted">Billable vs total logged time</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <BillableRing billableHours={billableLoggedHours} totalHours={totalLoggedHours} />
                </CardContent>
              </Card>
            </div>

            <div className="dash-rise lg:col-span-2" style={{ animationDelay: '560ms' }}>
              <Card>
                <CardHeader>
                  <div>
                    <h2 className="font-bold text-semantic-text">Recent approvals</h2>
                    <p className="mt-1 text-xs text-semantic-text-muted">
                      Time, expenses, and drafts awaiting review
                    </p>
                  </div>
                  <Link to="/approvals" className="text-xs font-semibold text-semantic-accent">
                    View all &rarr;
                  </Link>
                </CardHeader>
                <CardContent className={cn(approvals.length === 0 && 'py-0')}>
                  {approvals.length === 0 ? (
                    <EmptyState
                      icon={CheckCircle2}
                      title="All caught up"
                      description="No approvals waiting."
                      className="py-8"
                    />
                  ) : (
                    <div className="space-y-1">
                      {approvals.slice(0, 3).map((approval) => (
                        <div
                          key={approval.id}
                          className="-mx-2 flex flex-wrap items-center justify-between gap-3 rounded-ui-xl border-b border-semantic-border/60 px-2 py-3 transition-colors last:border-0 hover:bg-semantic-surface-muted/60"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <Badge variant={approval.entity_type === 'quote_draft' ? 'warning' : 'muted'}>
                              {approval.entity_type.replace(/_/g, ' ')}
                            </Badge>
                            <span className="truncate text-sm font-semibold text-semantic-text">
                              {approval.label}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            {approval.amount_cents !== undefined && approval.currency && (
                              <span className="text-xs font-bold tabular-nums text-semantic-text">
                                {approval.currency} {(approval.amount_cents / 100).toFixed(2)}
                              </span>
                            )}
                            <span className="text-[11px] text-semantic-text-muted">
                              {formatDate(approval.created_at)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
};