import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BriefcaseBusiness, CheckCircle2, Clock3, Users } from 'lucide-react';
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

export const Dashboard = () => {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

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

  const statChips = [
    { label: 'Open leads', value: activeLeads.length, tone: 'accent' as const },
    { label: 'Active projects', value: activeProjects.length, tone: 'accent' as const },
    { label: 'Pending time entries', value: pendingEntries.length, tone: 'warning' as const },
    { label: 'Approvals needed', value: approvals.length, tone: 'danger' as const },
  ];

  const cards = [
    { name: 'Open leads', value: activeLeads.length, description: `${leads.length} total leads`, icon: Users, color: 'text-sky-600' },
    { name: 'Active projects', value: activeProjects.length, description: `${projects.length} total projects`, icon: BriefcaseBusiness, color: 'text-indigo-600' },
    { name: 'Pending time entries', value: pendingEntries.length, description: `${billableHours.toFixed(1)} approved billable hours`, icon: Clock3, color: 'text-amber-600' },
    { name: 'Approvals needed', value: approvals.length, description: 'Time, expenses and quote drafts', icon: CheckCircle2, color: 'text-rose-600' },
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
      <PageHeader
        eyebrow="Workspace overview"
        title={`Good to see you, ${firstName}`}
        description={
          <>
            Live activity for <span className="font-semibold text-semantic-accent">{user?.org_name || 'your workspace'}</span>. Here&rsquo;s what needs attention today.
          </>
        }
        primaryAction={
          <div className="flex gap-2">
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
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <Card
                  key={card.name}
                  className="hover:-translate-y-0.5 hover:shadow-ui-lg transition-all duration-180ms"
                >
                  <CardContent>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-xs font-semibold text-semantic-text-muted">
                          {card.name}
                        </div>
                        <div className="mt-2 font-display text-3xl font-extrabold text-semantic-text">
                          {card.value}
                        </div>
                        <p className="mt-1 text-xs text-semantic-text-muted">
                          {card.description}
                        </p>
                      </div>
                      <div className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-ui-xl bg-accent-soft',
                        card.color
                      )}>
                        <Icon className="h-[18px] w-[18px]" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <h2 className="font-bold text-semantic-text">Recent leads</h2>
                  <p className="mt-1 text-xs text-semantic-text-muted">Opportunities in progress</p>
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
                        className="flex items-center justify-between gap-3 border-b border-semantic-border/60 py-3 last:border-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-semantic-text truncate">
                            {lead.title}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <p className="text-xs text-semantic-text-muted">{lead.source}</p>
                            <Badge variant="muted">{formatDate(lead.created_at)}</Badge>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-semantic-text shrink-0">
                          {lead.currency} {(lead.value_cents / 100).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
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
                  <div className="space-y-3">
                    {activeProjects.slice(0, 6).map((project) => {
                      const used = projectHours(project);
                      const budget = project.budget_minutes / 60;
                      const pct = budget ? Math.min(100, (used / budget) * 100) : 0;
                      return (
                        <div key={project.id} className="border-b border-semantic-border/60 py-2 last:border-0">
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-semibold text-semantic-text truncate">
                                {project.name}
                              </span>
                              <Badge variant="muted">
                                {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
                              </Badge>
                            </div>
                            <span className="text-xs text-semantic-text-muted shrink-0">
                              {used.toFixed(1)} / {budget.toFixed(1)}h
                            </span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-semantic-surface-muted">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all duration-300',
                                pct >= 80 ? 'bg-semantic-warning' : 'bg-semantic-accent'
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
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
                        className="flex items-center justify-between gap-3 border-b border-semantic-border/60 py-3 last:border-0"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <Badge
                            variant={approval.entity_type === 'quote_draft' ? 'warning' : 'muted'}
                          >
                            {approval.entity_type.replace(/_/g, ' ')}
                          </Badge>
                          <span className="text-sm font-semibold text-semantic-text truncate">
                            {approval.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {approval.amount_cents !== undefined && approval.currency && (
                            <span className="text-xs font-bold text-semantic-text">
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
        </>
      )}
    </div>
  );
};
