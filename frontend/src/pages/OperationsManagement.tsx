import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Briefcase,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Flag,
  Inbox,
  LayoutGrid,
  List,
  Mail,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  UsersRound,
  Wallet,
  X,
} from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/toast';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { Skeleton } from '../components/ui/Skeleton';

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */

type TaskRole = 'owner' | 'contributor' | 'reviewer';
type TaskAssignee = {
  id: string;
  org_id: string;
  task_id: string;
  person_id: string;
  role: string;
  person_name?: string;
  person_email?: string;
  assigned_by?: string | null;
  assigned_at: string;
  created_at: string;
  updated_at: string;
};
type Task = {
  id: string;
  org_id: string;
  project_id: string;
  task_number: number;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  estimate_minutes: number;
  start_date?: string | null;
  due_date?: string | null;
  assignee_id?: string | null;
  needs_reassignment: boolean;
  assignees: TaskAssignee[];
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
};
export type AssignmentTask = {
  id: string;
  project_id: string;
  title: string;
  assignees: Array<{ person_id: string; person_name?: string; role: string }>;
};
export type AssignmentPerson = Pick<Employee, 'id' | 'full_name' | 'is_active'>;
type Employee = {
  id: string;
  org_id: string;
  full_name: string;
  title?: string | null;
  role?: string | null;
  email?: string | null;
  user_id?: string | null;
  employment_status: string;
  billing_rate_cents: number;
  cost_rate_cents: number;
  weekly_capacity_minutes: number;
  annual_leave_days: number;
  is_active: boolean;
  weekly_capacity_hours: number;
  created_at: string;
  updated_at: string;
};
type Project = {
  id: string;
  org_id: string;
  name: string;
  lead_id?: string | null;
  description?: string | null;
  status: string;
  budget_minutes: number;
  budget_amount_cents: number;
  currency: string;
  start_date?: string | null;
  end_date?: string | null;
  members_count: number;
  created_at: string;
  updated_at: string;
};
type ProjectMember = {
  id: string;
  org_id: string;
  project_id: string;
  person_id: string;
  person_name?: string;
  person_email?: string;
  person_title?: string;
  role: string;
  allocation_percent: number;
  hours_per_week: number;
  start_date?: string | null;
  end_date?: string | null;
  created_at: string;
  updated_at: string;
};
type AssigneeSuggestion = {
  person_id: string;
  person_name: string;
  person_email?: string | null;
  person_title?: string | null;
  is_project_member: boolean;
  is_same_team: boolean;
  load_percent: number;
  open_tasks_count: number;
  open_estimated_hours: number;
  has_leave_conflict: boolean;
  conflict_code?: 'LEAVE_CONFLICT' | 'LEAVE_PENDING_WARNING' | null;
  conflict_message?: string | null;
  is_recommended: boolean;
};
type TeamMember = {
  id: string;
  org_id: string;
  team_id: string;
  person_id: string;
  role: string;
  person_name?: string;
  person_email?: string;
  person_title?: string;
  is_on_leave_today: boolean;
  is_on_leave_this_week: boolean;
  created_at: string;
  updated_at: string;
};
type Team = {
  id: string;
  org_id: string;
  name: string;
  description?: string | null;
  lead_id?: string | null;
  lead_name?: string | null;
  is_active: boolean;
  member_count: number;
  members?: TeamMember[];
  active_projects_count?: number;
  created_at: string;
  updated_at: string;
};
type LeaveType = {
  id: string;
  org_id: string;
  name: string;
  code: string;
  default_days_per_year: number;
  is_paid: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
type LeaveBalance = {
  id: string;
  org_id: string;
  person_id: string;
  leave_type_id: string;
  leave_type_name?: string | null;
  leave_type_code?: string | null;
  year: number;
  allocated_days: number;
  used_days: number;
  remaining_days: number;
  created_at: string;
  updated_at: string;
};
type LeaveRequest = {
  id: string;
  org_id: string;
  employee_id: string;
  leave_type_id?: string | null;
  leave_type: string;
  start_date: string;
  end_date: string;
  is_half_day: boolean;
  half_day_period?: string | null;
  working_days: number;
  days_computed: number;
  status: string;
  reason?: string | null;
  decision_note?: string | null;
  reviewed_by_user_id?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
};
type LeaveCalendarEvent = {
  id: string;
  employee_id: string;
  employee_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  is_half_day: boolean;
  status: string;
};
type InvoiceLine = {
  id: string;
  org_id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
  created_at: string;
  updated_at: string;
};
type InvoiceDetail = {
  id: string;
  org_id: string;
  invoice_number: string;
  client_name: string;
  project_id?: string | null;
  status: string;
  currency: string;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  paid_cents: number;
  balance_due_cents: number;
  is_overdue: boolean;
  issue_date: string;
  due_date: string;
  notes?: string | null;
  line_items: InvoiceLine[];
  created_at: string;
  updated_at: string;
};
type Payment = {
  id: string;
  org_id: string;
  invoice_id: string;
  amount_cents: number;
  paid_date: string;
  method: string;
  reference?: string | null;
  created_at: string;
  updated_at: string;
};
type PersonDetail = Employee & {
  teams: Team[];
  project_allocations: ProjectMember[];
  assigned_tasks: Task[];
  leave_balances: LeaveBalance[];
  upcoming_leave: LeaveRequest[];
  current_load_percent: number;
};

/* -------------------------------------------------------------------------- */
/*                               Shared constants                             */
/* -------------------------------------------------------------------------- */

const inputClass =
  'w-full rounded-ui-xl border border-semantic-border bg-semantic-surface px-3.5 py-2 text-sm text-semantic-text shadow-sm transition placeholder:text-semantic-text-muted hover:border-semantic-accent/40 focus-visible:border-semantic-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-accent/15';
const labelClass = 'block text-[11px] font-semibold uppercase tracking-wider text-semantic-text-muted';
const panelClass = 'overflow-hidden border border-semantic-border/80 shadow-sm transition-shadow hover:shadow-md';
const orgKey = () => localStorage.getItem('opspilot_org_id') || 'current';
const queryKey = (name: string, ...parts: string[]) => ['operations', orgKey(), name, ...parts];

const AVATAR_TONES = [
  'from-sky-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-fuchsia-500 to-purple-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-cyan-500 to-blue-600',
  'from-lime-500 to-green-600',
  'from-violet-500 to-indigo-600',
];

const STATUS_META: Record<string, { label: string; dot: string; pill: string }> = {
  todo: { label: 'To do', dot: 'bg-slate-400', pill: 'bg-slate-500/10 text-slate-600 ring-slate-500/20 dark:text-slate-300' },
  in_progress: { label: 'In progress', dot: 'bg-sky-500', pill: 'bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-300' },
  in_review: { label: 'In review', dot: 'bg-violet-500', pill: 'bg-violet-500/10 text-violet-700 ring-violet-500/20 dark:text-violet-300' },
  done: { label: 'Done', dot: 'bg-emerald-500', pill: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300' },
};

const PRIORITY_META: Record<string, { label: string; tone: string }> = {
  low: { label: 'Low', tone: 'text-slate-500' },
  medium: { label: 'Medium', tone: 'text-amber-500' },
  high: { label: 'High', tone: 'text-orange-500' },
  urgent: { label: 'Urgent', tone: 'text-rose-500' },
  critical: { label: 'Critical', tone: 'text-rose-600' },
};

const BOARD_COLUMNS = ['todo', 'in_progress', 'in_review', 'done'] as const;

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

function useInvalidateOperations() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['operations', orgKey()] });
}

function toneFor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

function roleTone(role: string): 'success' | 'warning' | 'muted' {
  return role === 'owner' ? 'success' : role === 'reviewer' ? 'warning' : 'muted';
}

function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShort(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatRange(start: string, end: string): string {
  return start === end ? formatShort(start) : `${formatShort(start)} – ${formatShort(end)}`;
}

function isOverdue(task: Task): boolean {
  return Boolean(task.due_date && task.status !== 'done' && task.due_date.slice(0, 10) < today());
}

function loadTone(percent: number): { bar: string; text: string; label: string } {
  if (percent > 100) return { bar: 'bg-rose-500', text: 'text-rose-600', label: 'Overloaded' };
  if (percent >= 80) return { bar: 'bg-amber-500', text: 'text-amber-600', label: 'Near capacity' };
  if (percent >= 40) return { bar: 'bg-sky-500', text: 'text-sky-600', label: 'Balanced' };
  return { bar: 'bg-emerald-500', text: 'text-emerald-600', label: 'Available' };
}

function assignmentConflict(error: unknown): { code: string; message: string } | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const body = error.data;
  if (typeof body !== 'object' || body === null || !('detail' in body)) return null;
  const detail = body.detail;
  if (typeof detail !== 'object' || detail === null || !('code' in detail) || !('message' in detail)) return null;
  if (typeof detail.code !== 'string' || typeof detail.message !== 'string') return null;
  return { code: detail.code, message: detail.message };
}

function countWorkingDays(start: string, end: string, halfDay: boolean): number {
  if (!start || !end || end < start) return 0;
  let count = 0;
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return halfDay ? Math.min(0.5, count) : count;
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

/* -------------------------------------------------------------------------- */
/*                              Shared UI building blocks                     */
/* -------------------------------------------------------------------------- */

function QueryError({ error, retry }: { error: Error | null; retry?: () => void }) {
  if (!error) return null;
  return (
    <Alert variant="danger" title="Unable to load data">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>{error.message}</span>
        {retry && <Button variant="secondary" size="sm" onClick={retry}>Try again</Button>}
      </div>
    </Alert>
  );
}

function LoadingCards({ count = 3 }: { count?: number }) {
  return <div className="space-y-3">{Array.from({ length: count }, (_, index) => <Skeleton key={index} variant="card" />)}</div>;
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
  const sizes = { sm: 'h-7 w-7 text-[10px]', md: 'h-9 w-9 text-xs', lg: 'h-11 w-11 text-sm', xl: 'h-16 w-16 text-xl' };
  return (
    <span
      aria-label={name}
      title={name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white shadow-sm ring-2 ring-semantic-surface ${toneFor(name)} ${sizes[size]}`}
    >
      {initials}
    </span>
  );
}
function AvatarGroup({ names, max = 3 }: { names: string[]; max?: number }) {

function AvatarGroup({ names, max = 3 }: { names: string[]; max?: number }) {
  const visible = names.slice(0, max);
  const extra = names.length - visible.length;
  return (
    <div className="flex items-center -space-x-2">
      {visible.map((name, index) => <Avatar key={`${name}-${index}`} name={name} size="sm" />)}
      {extra > 0 && (
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-semantic-surface-muted text-[10px] font-semibold text-semantic-text-muted ring-2 ring-semantic-surface">
          +{extra}
        </span>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const meta = STATUS_META[status] || { label: titleCase(status), dot: 'bg-slate-400', pill: 'bg-slate-500/10 text-slate-600 ring-slate-500/20' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${meta.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function PriorityTag({ priority }: { priority: string }) {
  const meta = PRIORITY_META[priority.toLowerCase()] || { label: titleCase(priority), tone: 'text-slate-500' };
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${meta.tone}`}>
      <Flag size={12} className="fill-current" /> {meta.label}
    </span>
  );
}

function ProgressBar({ value, className = '', barClass = 'bg-semantic-accent' }: { value: number; className?: string; barClass?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-semantic-surface-muted ${className}`} role="progressbar" aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full transition-all duration-500 ${barClass}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

function LoadMeter({ percent, showLabel = true }: { percent: number; showLabel?: boolean }) {
  const tone = loadTone(percent);
  return (
    <div className="min-w-[110px]">
      {showLabel && (
        <div className="mb-1 flex items-center justify-between text-[11px] font-semibold">
          <span className={tone.text}>{tone.label}</span>
          <span className="text-semantic-text-muted">{Math.round(percent)}%</span>
        </div>
      )}
      <ProgressBar value={percent} barClass={tone.bar} />
    </div>
  );
}

type StatTone = 'accent' | 'success' | 'warning' | 'danger' | 'muted';
const STAT_TONES: Record<StatTone, string> = {
  accent: 'from-sky-500/15 to-indigo-500/5 text-sky-600',
  success: 'from-emerald-500/15 to-teal-500/5 text-emerald-600',
  warning: 'from-amber-500/15 to-orange-500/5 text-amber-600',
  danger: 'from-rose-500/15 to-pink-500/5 text-rose-600',
  muted: 'from-slate-500/15 to-slate-500/5 text-slate-600',
};

function StatTile({ icon: Icon, label, value, hint, tone = 'accent' }: { icon: typeof Inbox; label: string; value: ReactNode; hint?: string; tone?: StatTone }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-semantic-border/80 bg-semantic-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={`absolute inset-0 bg-gradient-to-br opacity-70 ${STAT_TONES[tone].split(' ').slice(0, 2).join(' ')}`} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-semantic-text-muted">{label}</p>
          <p className="mt-1.5 truncate text-2xl font-bold tracking-tight text-semantic-text">{value}</p>
          {hint && <p className="mt-0.5 truncate text-xs text-semantic-text-muted">{hint}</p>}
        </div>
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-semantic-surface shadow-sm ${STAT_TONES[tone].split(' ').slice(2).join(' ')}`}>
          <Icon size={18} />
        </span>
      </div>
    </div>
  );
}

function SectionCard({ icon: Icon, title, subtitle, count, action, children }: { icon?: typeof Inbox; title: string; subtitle?: string; count?: number; action?: ReactNode; children: ReactNode }) {
  return (
    <Card className={panelClass}>
      <CardHeader>
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-semantic-accent/10 text-semantic-accent">
              <Icon size={17} />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-semantic-text">{title}</h2>
            {subtitle && <p className="truncate text-xs text-semantic-text-muted">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {typeof count === 'number' && <Badge variant="muted">{count}</Badge>}
          {action}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function SearchInput({ label, placeholder, value, onChange, className = '' }: { label: string; placeholder: string; value: string; onChange: (value: string) => void; className?: string }) {
  return (
    <label className={`relative block ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-semantic-text-muted" />
      <input aria-label={label} className={`${inputClass} pl-9 ${value ? 'pr-9' : ''}`} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-semantic-text-muted transition hover:bg-semantic-surface-muted hover:text-semantic-text">
          <X size={13} />
        </button>
      )}
    </label>
  );
}

function SegmentedTabs<T extends string>({ items, value, onChange, label }: { items: Array<{ id: T; label: string; count?: number; icon?: typeof Inbox }>; value: T; onChange: (value: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-2xl border border-semantic-border bg-semantic-surface-muted/50 p-1">
      {items.map((item) => {
        const active = item.id === value;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-sm font-medium transition ${active ? 'bg-semantic-surface text-semantic-text shadow-sm ring-1 ring-semantic-border' : 'text-semantic-text-muted hover:text-semantic-text'}`}
          >
            {Icon && <Icon size={14} />}
            {item.label}
            {typeof item.count === 'number' && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? 'bg-semantic-accent/10 text-semantic-accent' : 'bg-semantic-surface text-semantic-text-muted'}`}>{item.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="group inline-flex items-center gap-2 rounded-full border border-semantic-border bg-semantic-surface px-3.5 py-1.5 text-sm font-medium text-semantic-text-muted shadow-sm transition hover:border-semantic-accent/40 hover:text-semantic-accent">
      <ArrowLeft size={15} className="transition group-hover:-translate-x-0.5" /> {children}
    </Link>
  );
}

function ListRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <li className={`flex items-center justify-between gap-3 rounded-xl border border-semantic-border/80 bg-semantic-surface p-3 transition hover:border-semantic-accent/30 hover:bg-semantic-surface-muted/30 ${className}`}>{children}</li>;
}

/* -------------------------------------------------------------------------- */
/*                                   Tasks                                    */
/* -------------------------------------------------------------------------- */

export function TasksPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [projectId, setProjectId] = useState('all');
  const [assigneeId, setAssigneeId] = useState('all');
  const [myTasks, setMyTasks] = useState(false);
  const [reassignmentOnly, setReassignmentOnly] = useState(false);
  const [view, setView] = useState<'list' | 'board'>('list');
  const tasksQuery = useQuery({ queryKey: queryKey('tasks'), queryFn: () => apiRequest<Task[]>('/operations/tasks') });
  const peopleQuery = useQuery({ queryKey: queryKey('people-directory'), queryFn: () => apiRequest<Employee[]>('/operations/people/directory') });
  const projectsQuery = useQuery({ queryKey: queryKey('projects'), queryFn: () => apiRequest<Project[]>('/operations/projects') });

  const employeeId = peopleQuery.data?.find((person) => person.user_id === user?.id)?.id;
  const allTasks = tasksQuery.data || [];
  const filtered = useMemo(() => {
    const searchValue = search.trim().toLowerCase();
    return (tasksQuery.data || []).filter((task) => {
      const includesQuery = !searchValue || task.title.toLowerCase().includes(searchValue) ||
        (task.description || '').toLowerCase().includes(searchValue);
      return includesQuery &&
        (status === 'all' || task.status === status) &&
        (projectId === 'all' || task.project_id === projectId) &&
        (assigneeId === 'all' || (assigneeId === 'unassigned' ? task.assignees.length === 0 : task.assignees.some((assignee) => assignee.person_id === assigneeId))) &&
        (!myTasks || Boolean(employeeId && task.assignees.some((assignee) => assignee.person_id === employeeId))) &&
        (!reassignmentOnly || task.needs_reassignment);
    });
  }, [tasksQuery.data, search, status, projectId, assigneeId, myTasks, employeeId, reassignmentOnly]);

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = { todo: 0, in_progress: 0, in_review: 0, done: 0 };
    allTasks.forEach((task) => { byStatus[task.status] = (byStatus[task.status] || 0) + 1; });
    return byStatus;
  }, [allTasks]);
  const openCount = allTasks.filter((task) => task.status !== 'done').length;
  const overdueCount = allTasks.filter(isOverdue).length;
  const reassignCount = allTasks.filter((task) => task.needs_reassignment).length;
  const completion = allTasks.length ? Math.round((counts.done / allTasks.length) * 100) : 0;
  const projectName = (id: string) => projectsQuery.data?.find((project) => project.id === id)?.name || 'Project';
  const filtersActive = Boolean(search || status !== 'all' || projectId !== 'all' || assigneeId !== 'all' || myTasks || reassignmentOnly);
  const clearFilters = () => { setSearch(''); setStatus('all'); setProjectId('all'); setAssigneeId('all'); setMyTasks(false); setReassignmentOnly(false); };

  const combinedError = tasksQuery.error || peopleQuery.error || projectsQuery.error;
  const loading = tasksQuery.isLoading || peopleQuery.isLoading || projectsQuery.isLoading;
  return (
    <main className="page-shell space-y-6">
      <PageHeader
        eyebrow="Delivery"
        title="Tasks"
        description="Review assignments, workload, and leave-related handoffs across your projects."
        statChips={[{ label: 'Open tasks', value: openCount }, { label: 'Needs reassignment', value: reassignCount, tone: 'warning' }]}
      />
      <QueryError error={combinedError instanceof Error ? combinedError : null} retry={() => { void tasksQuery.refetch(); void peopleQuery.refetch(); void projectsQuery.refetch(); }} />

      <section aria-label="Task summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Briefcase} label="Open work" value={openCount} hint={`${allTasks.length} tasks in total`} tone="accent" />
        <StatTile icon={Clock3} label="In progress" value={counts.in_progress} hint={`${counts.in_review} waiting for review`} tone="muted" />
        <StatTile icon={AlertTriangle} label="Attention needed" value={overdueCount + reassignCount} hint={`${overdueCount} overdue · ${reassignCount} to reassign`} tone={overdueCount + reassignCount ? 'danger' : 'success'} />
        <StatTile icon={CheckCircle2} label="Completion" value={`${completion}%`} hint={`${counts.done} tasks done`} tone="success" />
      </section>

      <Card className={panelClass}>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedTabs
              label="Filter by status"
              value={status}
              onChange={setStatus}
              items={[
                { id: 'all', label: 'All', count: allTasks.length },
                { id: 'todo', label: 'To do', count: counts.todo },
                { id: 'in_progress', label: 'In progress', count: counts.in_progress },
                { id: 'in_review', label: 'In review', count: counts.in_review },
                { id: 'done', label: 'Done', count: counts.done },
              ]}
            />
            <div className="inline-flex rounded-xl border border-semantic-border bg-semantic-surface-muted/50 p-1" role="group" aria-label="Task layout">
              <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${view === 'list' ? 'bg-semantic-surface text-semantic-text shadow-sm' : 'text-semantic-text-muted'}`}><List size={14} /> List</button>
              <button type="button" aria-pressed={view === 'board'} onClick={() => setView('board')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${view === 'board' ? 'bg-semantic-surface text-semantic-text shadow-sm' : 'text-semantic-text-muted'}`}><LayoutGrid size={14} /> Board</button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_1fr_1fr_auto]">
            <SearchInput label="Search tasks" placeholder="Search tasks..." value={search} onChange={setSearch} className="sm:col-span-2 xl:col-span-1" />
            <select aria-label="Filter tasks by project" className={inputClass} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="all">All projects</option>{(projectsQuery.data || []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <select aria-label="Filter tasks by assignee" className={inputClass} value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
              <option value="all">All assignees</option><option value="unassigned">Unassigned</option>{(peopleQuery.data || []).map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
            </select>
            <div className="flex flex-wrap gap-2">
              <Button variant={myTasks ? 'primary' : 'secondary'} size="sm" onClick={() => setMyTasks((value) => !value)}>My tasks</Button>
              <Button variant={reassignmentOnly ? 'primary' : 'secondary'} size="sm" onClick={() => setReassignmentOnly((value) => !value)}>Needs reassignment</Button>
            </div>
          </div>
          {filtersActive && (
            <div className="flex items-center justify-between rounded-xl bg-semantic-surface-muted/50 px-3.5 py-2 text-xs text-semantic-text-muted">
              <span>Showing <strong className="text-semantic-text">{filtered.length}</strong> of {allTasks.length} tasks</span>
              <button type="button" onClick={clearFilters} className="font-semibold text-semantic-accent hover:underline">Clear filters</button>
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? <LoadingCards /> : filtered.length === 0 ? (
        <EmptyState icon={Inbox} title={allTasks.length ? 'No matching tasks' : 'No tasks yet'} description="Change the search or filters to find tasks." />
      ) : view === 'list' ? (
        <div className="space-y-3">
          {filtered.map((task) => (
            <TaskCard key={task.id} task={task} people={peopleQuery.data || []} projectName={projectName(task.project_id)} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {BOARD_COLUMNS.map((column) => {
            const items = filtered.filter((task) => task.status === column);
            const meta = STATUS_META[column];
            return (
              <section key={column} aria-label={meta.label} className="flex min-h-[220px] flex-col rounded-2xl border border-semantic-border/80 bg-semantic-surface-muted/30 p-3">
                <header className="mb-3 flex items-center justify-between px-1">
                  <span className="flex items-center gap-2 text-sm font-semibold text-semantic-text"><span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />{meta.label}</span>
                  <span className="rounded-full bg-semantic-surface px-2 py-0.5 text-xs font-bold text-semantic-text-muted shadow-sm">{items.length}</span>
                </header>
                <div className="space-y-3">
                  {items.length ? items.map((task) => (
                    <TaskCard key={task.id} compact task={task} people={peopleQuery.data || []} projectName={projectName(task.project_id)} />
                  )) : <p className="rounded-xl border border-dashed border-semantic-border py-8 text-center text-xs text-semantic-text-muted">Nothing here</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

function TaskCard({ task, people, projectName, compact = false }: { task: Task; people: Employee[]; projectName: string; compact?: boolean }) {
  const [editing, setEditing] = useState(false);
  const overdue = isOverdue(task);
  const accent = task.needs_reassignment ? 'bg-rose-500' : overdue ? 'bg-amber-500' : (STATUS_META[task.status]?.dot || 'bg-slate-400');
  const assigneeName = (assignee: TaskAssignee) => assignee.person_name || people.find((person) => person.id === assignee.person_id)?.full_name || 'Teammate';
  return (
    <Card className={`${panelClass} relative`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${accent}`} aria-hidden />
      <CardContent className="space-y-4 pl-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-semantic-text-muted">
              <span className="rounded-md bg-semantic-accent/10 px-1.5 py-0.5 text-semantic-accent">#{task.task_number}</span>
              <span className="truncate">{projectName}</span>
            </p>
            <h2 className="mt-1.5 break-words font-semibold leading-snug text-semantic-text">{task.title}</h2>
            {!compact && task.description && <p className="mt-1 line-clamp-2 text-sm text-semantic-text-muted">{task.description}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={task.status} />
            {task.needs_reassignment && <Badge variant="danger"><AlertTriangle size={12} className="mr-1" />Needs reassignment</Badge>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-semantic-text-muted">
          <PriorityTag priority={task.priority} />
          {task.due_date && (
            <span className={`inline-flex items-center gap-1 font-medium ${overdue ? 'text-rose-600' : ''}`}><Clock3 size={13} /> {overdue ? 'Overdue · ' : 'Due '}{formatDate(task.due_date)}</span>
          )}
          {task.estimate_minutes > 0 && <span className="inline-flex items-center gap-1"><Sparkles size={13} /> {(task.estimate_minutes / 60).toFixed(1)}h estimated</span>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-semantic-border/70 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            {task.assignees.length ? task.assignees.map((assignee) => (
              <span key={assignee.person_id} className="inline-flex items-center gap-2 rounded-full border border-semantic-border bg-semantic-surface-muted/40 py-1 pl-1 pr-2.5 transition hover:border-semantic-accent/40">
                <Avatar name={assigneeName(assignee)} size="sm" />
                {!compact && <span className="text-xs font-medium text-semantic-text">{assigneeName(assignee)}</span>}
                <Badge variant={roleTone(assignee.role)} size="sm">{assignee.role}</Badge>
              </span>
            )) : <Badge variant="muted">Unassigned</Badge>}
          </div>
          <Button variant="secondary" size="sm" onClick={() => setEditing((value) => !value)}>{editing ? 'Close assignments' : 'Manage assignees'}</Button>
        </div>
        {editing && <TaskAssignmentEditor task={task} people={people} onClose={() => setEditing(false)} />}
      </CardContent>
    </Card>
  );
}

export function TaskAssignmentEditor({ task, people, onClose, onSaved }: { task: AssignmentTask; people: AssignmentPerson[]; onClose: () => void; onSaved?: () => Promise<void> }) {
  const invalidate = useInvalidateOperations();
  const toast = useToast();
  const [selected, setSelected] = useState<Record<string, TaskRole>>(
    () => Object.fromEntries(task.assignees.map((assignee) => [
      assignee.person_id,
      ['owner', 'contributor', 'reviewer'].includes(assignee.role) ? assignee.role as TaskRole : 'contributor',
    ]))
  );
  const [warning, setWarning] = useState<{ kind: 'leave' | 'overload'; personId: string; message: string } | null>(null);
  const membersQuery = useQuery({
    queryKey: queryKey('project-members', task.project_id),
    queryFn: () => apiRequest<ProjectMember[]>(`/operations/projects/${task.project_id}/members`),
  });
  const suggestionsQuery = useQuery({
    queryKey: queryKey('task-suggestions', task.id),
    queryFn: () => apiRequest<AssigneeSuggestion[]>(`/assignments/tasks/${task.id}/suggestions`),
  });
  const save = useMutation({
    mutationFn: async ({ overridePersonId }: { overridePersonId?: string } = {}) => {
      const current = new Map(task.assignees.map((item) => [item.person_id, item]));
      const adds = Object.entries(selected).filter(([personId]) => !current.has(personId));
      const overload = adds.find(([personId]) => {
        const suggestion = suggestionsQuery.data?.find((item) => item.person_id === personId);
        return suggestion?.load_percent !== undefined && suggestion.load_percent > 100 && personId !== overridePersonId;
      });
      if (overload) {
        const suggestion = suggestionsQuery.data?.find((item) => item.person_id === overload[0]);
        throw { kind: 'overload' as const, personId: overload[0], message: `${suggestion?.person_name || 'This teammate'} is at ${suggestion?.load_percent.toFixed(0)}% of weekly capacity.` };
      }
      for (const [personId, role] of adds) {
        try {
          await apiRequest(`/assignments/tasks/${task.id}/assignees`, {
            method: 'POST',
            body: JSON.stringify({ person_id: personId, role, override_leave_conflict: personId === overridePersonId }),
          });
        } catch (error) {
          const conflict = assignmentConflict(error);
          if (conflict?.code === 'LEAVE_CONFLICT' && personId !== overridePersonId) {
            throw { kind: 'leave' as const, personId, message: conflict.message };
          }
          throw error;
        }
      }
      for (const [personId, previous] of current) {
        const nextRole = selected[personId];
        if (!nextRole) {
          await apiRequest(`/assignments/tasks/${task.id}/assignees/${personId}`, { method: 'DELETE' });
        } else if (nextRole !== previous.role) {
          await apiRequest(`/assignments/tasks/${task.id}/assignees/${personId}`, {
            method: 'PATCH',
            body: JSON.stringify({ role: nextRole }),
          });
        }
      }
    },
    onSuccess: async () => {
      await invalidate();
      await onSaved?.();
      onClose();
    },
  });

  const submit = async (overridePersonId?: string) => {
    try {
      await save.mutateAsync({ overridePersonId });
      setWarning(null);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'kind' in error && 'personId' in error && 'message' in error) {
        const issue = error as { kind: 'leave' | 'overload'; personId: string; message: string };
        setWarning(issue);
      } else {
        setWarning(null);
        toast.error(error instanceof Error ? error.message : 'Unable to update task assignments.');
      }
    }
  };
  const members = (membersQuery.data || []).filter((member) => people.some((person) => person.id === member.person_id && person.is_active));
  const selectedCount = Object.keys(selected).length;
  return (
    <div className="space-y-4 rounded-2xl border border-semantic-border bg-gradient-to-b from-semantic-surface-muted/50 to-semantic-surface-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-semantic-text">Assign teammates</h3>
          <p className="text-xs text-semantic-text-muted">Pick project members and choose their role. Workload is checked before saving.</p>
        </div>
        <Badge variant="muted">{selectedCount} selected</Badge>
      </div>
      {membersQuery.error && <QueryError error={membersQuery.error instanceof Error ? membersQuery.error : null} retry={() => void membersQuery.refetch()} />}
      {membersQuery.isLoading ? <Skeleton variant="text" /> : members.length === 0 ? (
        <p className="text-sm text-semantic-text-muted">Add active teammates to this project before assigning its tasks.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {members.map((member) => {
            const person = people.find((entry) => entry.id === member.person_id);
            const role = selected[member.person_id];
            const suggestion = suggestionsQuery.data?.find((item) => item.person_id === member.person_id);
            const name = person?.full_name || member.person_name || 'teammate';
            return (
              <div key={member.person_id} className={`flex min-w-0 flex-col gap-2 rounded-xl border p-3 transition ${role ? 'border-semantic-accent/50 bg-semantic-accent/5 shadow-sm' : 'border-semantic-border bg-semantic-surface hover:border-semantic-accent/30'}`}>
                <div className="flex min-w-0 items-center gap-2.5">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-semantic-border accent-sky-600"
                    aria-label={`Assign ${name}`}
                    checked={Boolean(role)}
                    onChange={(event) => setSelected((current) => {
                      const next = { ...current };
                      if (event.target.checked) next[member.person_id] = 'contributor';
                      else delete next[member.person_id];
                      return next;
                    })}
                  />
                  <Avatar name={name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-semantic-text">{name}</p>
                    {(member.person_title || suggestion) && <p className="truncate text-[11px] text-semantic-text-muted">{member.person_title || `${suggestion?.open_tasks_count ?? 0} open tasks`}</p>}
                  </div>
                  {suggestion?.is_recommended && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600"><Sparkles size={10} /> Best fit</span>}
                </div>
                {suggestion && <LoadMeter percent={suggestion.load_percent} />}
                {suggestion?.has_leave_conflict && <p className="flex items-center gap-1 text-[11px] font-medium text-amber-600"><AlertTriangle size={12} /> {suggestion.conflict_message || 'Leave conflict during this task'}</p>}
                {role && (
                  <select aria-label={`Role for ${name}`} className="rounded-lg border border-semantic-border bg-semantic-surface px-2 py-1.5 text-xs font-medium" value={role} onChange={(event) => setSelected((current) => ({ ...current, [member.person_id]: event.target.value as TaskRole }))}>
                    <option value="owner">Owner</option><option value="contributor">Contributor</option><option value="reviewer">Reviewer</option>
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}
      {warning && (
        <div role="dialog" aria-modal="true" aria-labelledby={`assignment-warning-${task.id}`} className="space-y-3 rounded-xl border border-semantic-warning/40 bg-semantic-warning-soft p-4">
          <h3 id={`assignment-warning-${task.id}`} className="flex items-center gap-2 font-semibold text-semantic-text">
            <AlertTriangle size={16} /> {warning.kind === 'leave' ? 'Leave conflict' : 'Workload warning'}
          </h3>
          <p className="text-sm text-semantic-text">{warning.message}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void submit(warning.personId)}>Assign anyway</Button>
            <Button size="sm" variant="secondary" onClick={() => setWarning(null)}>Choose someone else</Button>
          </div>
        </div>
      )}
      {suggestionsQuery.error && <p className="text-xs text-semantic-text-muted">Capacity warnings are unavailable. Assignment validation will still be enforced by the server.</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-semantic-border/70 pt-3">
        <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={save.isPending} disabled={members.length === 0 || suggestionsQuery.isLoading} onClick={() => void submit()}>
          Save assignments
        </Button>
      </div>
      {save.error && !warning && <p role="alert" className="text-sm text-semantic-danger">{save.error.message}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Person detail                               */
/* -------------------------------------------------------------------------- */

export function PersonDetailPage() {
  const { personId = '' } = useParams();
  const [search, setSearch] = useState('');
  const [taskStatus, setTaskStatus] = useState('open');
  const [leaveStatus, setLeaveStatus] = useState('all');
  const personQuery = useQuery({
    queryKey: queryKey('person-detail', personId),
    queryFn: () => apiRequest<PersonDetail>(`/operations/people/${personId}/detail`),
    enabled: Boolean(personId),
  });
  const projectsQuery = useQuery({ queryKey: queryKey('projects'), queryFn: () => apiRequest<Project[]>('/operations/projects') });
  const person = personQuery.data;
  const filterText = search.trim().toLowerCase();
  const tasks = (person?.assigned_tasks || []).filter((task) =>
    task.title.toLowerCase().includes(filterText) && (taskStatus === 'all' || (taskStatus === 'open' ? task.status !== 'done' : task.status === taskStatus))
  );
  const projects = (person?.project_allocations || []).filter((allocation) =>
    (projectsQuery.data?.find((project) => project.id === allocation.project_id)?.name || '').toLowerCase().includes(filterText) ||
    allocation.role.toLowerCase().includes(filterText)
  );
  const leave = (person?.upcoming_leave || []).filter((request) =>
    (request.status.toLowerCase().includes(filterText) || (request.reason || '').toLowerCase().includes(filterText)) &&
    (leaveStatus === 'all' || request.status === leaveStatus)
  );
  const openTasks = (person?.assigned_tasks || []).filter((task) => task.status !== 'done').length;
  const totalAllocation = (person?.project_allocations || []).reduce((sum, allocation) => sum + allocation.allocation_percent, 0);
  const projectName = (id: string, fallback: string) => projectsQuery.data?.find((project) => project.id === id)?.name || fallback;
  return (
    <main className="page-shell space-y-6">
      <BackLink to="/people">Back to people</BackLink>
      {personQuery.isLoading || projectsQuery.isLoading ? <LoadingCards count={2} /> : personQuery.error || projectsQuery.error ? <QueryError error={(personQuery.error || projectsQuery.error) instanceof Error ? (personQuery.error || projectsQuery.error) as Error : null} retry={() => { void personQuery.refetch(); void projectsQuery.refetch(); }} /> : person && (
        <>
          <PageHeader eyebrow="Team" title={person.full_name} description={person.title || person.email || 'Teammate profile'} statChips={[{ label: 'Current workload', value: `${person.current_load_percent}%`, tone: person.current_load_percent > 100 ? 'danger' : 'accent' }]} />

          <Card className={`${panelClass} relative`}>
            <div className="h-20 bg-gradient-to-r from-sky-500/25 via-indigo-500/20 to-fuchsia-500/20" aria-hidden />
            <CardContent className="-mt-10 space-y-5">
              <div className="flex flex-wrap items-end gap-4">
                <Avatar name={person.full_name} size="xl" />
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold tracking-tight text-semantic-text">{person.full_name}</h2>
                    <Badge variant={person.is_active ? 'success' : 'muted'}>{person.is_active ? 'Active' : 'Inactive'}</Badge>
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-semantic-text-muted">
                    {person.title && <span className="inline-flex items-center gap-1.5"><Briefcase size={14} /> {person.title}</span>}
                    <span className="inline-flex items-center gap-1.5"><Mail size={14} /> {person.email || 'No email address'}</span>
                  </p>
                </div>
                <div className="w-full max-w-xs"><LoadMeter percent={person.current_load_percent} /></div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatTile icon={Clock3} label="Weekly capacity" value={`${person.weekly_capacity_hours}h`} hint="Available hours" tone="accent" />
                <StatTile icon={Inbox} label="Open tasks" value={openTasks} hint={`${person.assigned_tasks.length} assigned overall`} tone="muted" />
                <StatTile icon={Briefcase} label="Allocation" value={`${totalAllocation}%`} hint={`${person.project_allocations.length} projects`} tone={totalAllocation > 100 ? 'danger' : 'success'} />
                <StatTile icon={CalendarDays} label="Upcoming leave" value={person.upcoming_leave.length} hint="Requests on file" tone="warning" />
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-semantic-border/70 pt-4">
                <SearchInput label="Search person details" placeholder="Filter tasks, projects, leave..." value={search} onChange={setSearch} className="min-w-[220px] flex-1" />
                <select aria-label="Filter assigned tasks" className={`${inputClass} max-w-[190px]`} value={taskStatus} onChange={(event) => setTaskStatus(event.target.value)}><option value="open">Open tasks</option><option value="all">All tasks</option><option value="todo">To do</option><option value="in_progress">In progress</option><option value="in_review">In review</option><option value="done">Done</option></select>
                <select aria-label="Filter upcoming leave" className={`${inputClass} max-w-[190px]`} value={leaveStatus} onChange={(event) => setLeaveStatus(event.target.value)}><option value="all">All leave statuses</option><option value="pending">Pending</option><option value="approved">Approved</option></select>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard icon={Inbox} title="Assigned tasks" subtitle="Work currently on this person's plate" count={tasks.length}>
              {tasks.length ? <ul className="space-y-2">{tasks.map((task) => (
                <ListRow key={task.id}>
                  <div className="min-w-0"><p className="truncate font-medium text-semantic-text">{task.title}</p><div className="mt-1 flex items-center gap-3"><PriorityTag priority={task.priority} />{task.due_date && <span className="text-[11px] text-semantic-text-muted">Due {formatShort(task.due_date)}</span>}</div></div>
                  {task.needs_reassignment ? <Badge variant="danger">Needs reassignment</Badge> : <StatusPill status={task.status} />}
                </ListRow>
              ))}</ul> : <EmptyState icon={Inbox} title="No matching tasks" />}
            </SectionCard>

            <SectionCard icon={Briefcase} title="Project allocations" subtitle="Time committed to each project" count={projects.length}>
              {projects.length ? <ul className="space-y-2">{projects.map((allocation) => (
                <li key={allocation.id} className="space-y-2 rounded-xl border border-semantic-border/80 bg-semantic-surface p-3 transition hover:border-semantic-accent/30">
                  <div className="flex items-center justify-between gap-2"><span className="truncate font-medium">{projectName(allocation.project_id, allocation.role)}</span><Badge variant="muted">{titleCase(allocation.role)}</Badge></div>
                  <ProgressBar value={allocation.allocation_percent} barClass={allocation.allocation_percent > 80 ? 'bg-amber-500' : 'bg-semantic-accent'} />
                  <p className="text-[11px] text-semantic-text-muted">{allocation.allocation_percent}% allocation · {allocation.hours_per_week}h/wk</p>
                </li>
              ))}</ul> : <EmptyState icon={Inbox} title="No project allocations" />}
            </SectionCard>

            <SectionCard icon={Wallet} title="Leave balances" subtitle="Remaining days this year" count={person.leave_balances.length}>
              {person.leave_balances.length ? <ul className="space-y-2">{person.leave_balances.map((balance) => {
                const usedPercent = balance.allocated_days ? (balance.used_days / balance.allocated_days) * 100 : 0;
                return (
                  <li key={balance.id} className="space-y-2 rounded-xl border border-semantic-border/80 bg-semantic-surface p-3">
                    <div className="flex items-center justify-between gap-2"><span className="font-medium">{balance.leave_type_name || balance.leave_type_code}</span><span className="text-sm"><strong>{balance.remaining_days}</strong> <span className="text-semantic-text-muted">/ {balance.allocated_days} days</span></span></div>
                    <ProgressBar value={usedPercent} barClass={usedPercent > 85 ? 'bg-rose-500' : 'bg-emerald-500'} />
                  </li>
                );
              })}</ul> : <EmptyState icon={CalendarDays} title="No leave balances" />}
            </SectionCard>

            <SectionCard icon={CalendarDays} title="Upcoming leave" subtitle="Approved and pending absences" count={leave.length}>
              {leave.length ? <ul className="space-y-2">{leave.map((request) => (
                <ListRow key={request.id}>
                  <div><p className="font-medium">{formatRange(request.start_date, request.end_date)}</p><p className="text-[11px] text-semantic-text-muted">{titleCase(request.leave_type)} · {request.days_computed || request.working_days} days</p></div>
                  <Badge variant={request.status === 'approved' ? 'success' : 'warning'}>{request.status}</Badge>
                </ListRow>
              ))}</ul> : <EmptyState icon={CalendarDays} title="No upcoming leave" />}
            </SectionCard>
          </div>
        </>
      )}
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Teams                                   */
/* -------------------------------------------------------------------------- */

export function TeamsPage() {
  const [search, setSearch] = useState('');
  const [sizeFilter, setSizeFilter] = useState('all');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const invalidate = useInvalidateOperations();
  const teamsQuery = useQuery({ queryKey: queryKey('teams'), queryFn: () => apiRequest<Team[]>('/operations/teams') });
  const createTeam = useMutation({
    mutationFn: () => apiRequest<Team>('/operations/teams', { method: 'POST', body: JSON.stringify({ name: name.trim(), description: description.trim() || null, is_active: true }) }),
    onSuccess: async () => { setName(''); setDescription(''); await invalidate(); },
  });
  const teams = teamsQuery.data || [];
  const filtered = teams.filter((team) =>
    team.name.toLowerCase().includes(search.trim().toLowerCase()) &&
    (sizeFilter === 'all' || (sizeFilter === 'empty' ? team.member_count === 0 : sizeFilter === 'small' ? team.member_count > 0 && team.member_count <= 5 : team.member_count > 5))
  );
  const totalMembers = teams.reduce((sum, team) => sum + team.member_count, 0);
  const submit = (event: FormEvent) => { event.preventDefault(); if (name.trim()) createTeam.mutate(); };
  return (
    <main className="page-shell space-y-6">
      <PageHeader eyebrow="Team" title="Teams" description="Organize people and review availability across your delivery teams." statChips={[{ label: 'Teams', value: teams.length }]} />
      <QueryError error={teamsQuery.error instanceof Error ? teamsQuery.error : null} retry={() => void teamsQuery.refetch()} />

      <section aria-label="Team summary" className="grid gap-3 sm:grid-cols-3">
        <StatTile icon={UsersRound} label="Teams" value={teams.length} hint={`${teams.filter((team) => team.is_active).length} active`} tone="accent" />
        <StatTile icon={Briefcase} label="People in teams" value={totalMembers} hint="Across all teams" tone="success" />
        <StatTile icon={Inbox} label="Empty teams" value={teams.filter((team) => team.member_count === 0).length} hint="Waiting for members" tone="warning" />
      </section>

      <Card className={panelClass}>
        <CardHeader><div className="flex items-center gap-3"><span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-semantic-accent/10 text-semantic-accent"><Plus size={17} /></span><h2 className="font-semibold">Create team</h2></div></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
            <input className={inputClass} aria-label="Team name" required placeholder="Team name" value={name} onChange={(event) => setName(event.target.value)} />
            <input className={inputClass} aria-label="Team description" placeholder="Description (optional)" value={description} onChange={(event) => setDescription(event.target.value)} />
            <Button type="submit" loading={createTeam.isPending}><Plus size={15} /> Create team</Button>
          </form>
          {createTeam.error && <p role="alert" className="mt-3 text-sm text-semantic-danger">{createTeam.error.message}</p>}
        </CardContent>
      </Card>

      <Card className={panelClass}>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
            <SearchInput label="Search teams" placeholder="Search teams..." value={search} onChange={setSearch} />
            <select aria-label="Filter teams by size" className={inputClass} value={sizeFilter} onChange={(event) => setSizeFilter(event.target.value)}><option value="all">All team sizes</option><option value="empty">No members</option><option value="small">1–5 members</option><option value="large">6+ members</option></select>
          </div>
          {teamsQuery.isLoading ? <LoadingCards /> : filtered.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((team) => (
                <Link key={team.id} to={`/teams/${team.id}`} className="group relative overflow-hidden rounded-2xl border border-semantic-border bg-semantic-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-semantic-accent/50 hover:shadow-ui-md">
                  <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${toneFor(team.name)}`} aria-hidden />
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${toneFor(team.name)}`}><UsersRound size={19} /></span>
                      <div className="min-w-0"><h3 className="truncate font-semibold text-semantic-text">{team.name}</h3><Badge variant={team.is_active ? 'success' : 'muted'} size="sm">{team.is_active ? 'Active' : 'Inactive'}</Badge></div>
                    </div>
                    <ChevronRight size={18} className="mt-1 text-semantic-text-muted transition group-hover:translate-x-1 group-hover:text-semantic-accent" />
                  </div>
                  <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-sm text-semantic-text-muted">{team.description || 'No description'}</p>
                  <div className="mt-4 flex items-center justify-between border-t border-semantic-border/70 pt-3 text-xs text-semantic-text-muted">
                    <span className="inline-flex items-center gap-2">{team.lead_name ? <Avatar name={team.lead_name} size="sm" /> : null}<span>Lead: <strong className="font-semibold text-semantic-text">{team.lead_name || 'Unassigned'}</strong></span></span>
                    <span className="font-semibold text-semantic-text">{team.member_count} {team.member_count === 1 ? 'member' : 'members'}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : <EmptyState icon={UsersRound} title={teams.length ? 'No matching teams' : 'No teams yet'} description="Create a team or adjust your search." />}
        </CardContent>
      </Card>
    </main>
  );
}

export function TeamDetailPage() {
  const { teamId = '' } = useParams();
  const [personId, setPersonId] = useState('');
  const [role, setRole] = useState('member');
  const [memberSearch, setMemberSearch] = useState('');
  const [availability, setAvailability] = useState('all');
  const invalidate = useInvalidateOperations();
  const teamQuery = useQuery({ queryKey: queryKey('team-detail', teamId), queryFn: () => apiRequest<Team>(`/operations/teams/${teamId}`), enabled: Boolean(teamId) });
  const peopleQuery = useQuery({ queryKey: queryKey('people-directory'), queryFn: () => apiRequest<Employee[]>('/operations/people/directory') });
  const addMember = useMutation({
    mutationFn: () => apiRequest(`/operations/teams/${teamId}/members`, { method: 'POST', body: JSON.stringify({ person_id: personId, role }) }),
    onSuccess: async () => { setPersonId(''); await invalidate(); },
  });
  const updateRole = useMutation({
    mutationFn: ({ person, nextRole }: { person: TeamMember; nextRole: string }) => apiRequest(`/operations/teams/${teamId}/members`, { method: 'POST', body: JSON.stringify({ person_id: person.person_id, role: nextRole }) }),
    onSuccess: invalidate,
  });
  const removeMember = useMutation({
    mutationFn: (person: TeamMember) => apiRequest(`/operations/teams/${teamId}/members/${person.person_id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
  const members = teamQuery.data?.members || [];
  const availablePeople = (peopleQuery.data || []).filter((person) => person.is_active && !members.some((member) => member.person_id === person.id));
  const filteredMembers = members.filter((member) => {
    const matchesName = (member.person_name || '').toLowerCase().includes(memberSearch.trim().toLowerCase());
    const matchesAvailability = availability === 'all' ||
      (availability === 'today' ? !member.is_on_leave_today : availability === 'week' ? !member.is_on_leave_this_week :
        availability === 'away-today' ? member.is_on_leave_today : member.is_on_leave_this_week);
    return matchesName && matchesAvailability;
  });
  const availableToday = members.filter((member) => !member.is_on_leave_today).length;
  const availableWeek = members.filter((member) => !member.is_on_leave_this_week).length;
  return (
    <main className="page-shell space-y-6">
      <BackLink to="/teams">Back to teams</BackLink>
      {teamQuery.isLoading ? <LoadingCards count={2} /> : teamQuery.error ? <QueryError error={teamQuery.error instanceof Error ? teamQuery.error : null} retry={() => void teamQuery.refetch()} /> : teamQuery.data && (
        <>
          <PageHeader eyebrow="Team" title={teamQuery.data.name} description={teamQuery.data.description || `${members.length} team members`} statChips={[{ label: 'Available today', value: availableToday, tone: 'success' }, { label: 'Available this week', value: availableWeek, tone: 'accent' }]} />

          <section aria-label="Team availability" className="grid gap-3 sm:grid-cols-3">
            <StatTile icon={UsersRound} label="Members" value={members.length} hint={teamQuery.data.lead_name ? `Led by ${teamQuery.data.lead_name}` : 'No lead assigned'} tone="accent" />
            <StatTile icon={CheckCircle2} label="Available today" value={`${availableToday}/${members.length}`} hint={`${members.length - availableToday} away`} tone="success" />
            <StatTile icon={CalendarDays} label="Available this week" value={`${availableWeek}/${members.length}`} hint={`${members.length - availableWeek} with leave`} tone="warning" />
          </section>

          <Card className={panelClass}>
            <CardHeader><div className="flex items-center gap-3"><span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-semantic-accent/10 text-semantic-accent"><Plus size={17} /></span><h2 className="font-semibold">Add teammate</h2></div></CardHeader>
            <CardContent>
              <form onSubmit={(event) => { event.preventDefault(); if (personId) addMember.mutate(); }} className="grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
                <select className={inputClass} aria-label="Select teammate" value={personId} onChange={(event) => setPersonId(event.target.value)}><option value="">Choose teammate</option>{availablePeople.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select>
                <select className={inputClass} aria-label="New team role" value={role} onChange={(event) => setRole(event.target.value)}><option value="member">Member</option><option value="lead">Lead</option></select>
                <Button type="submit" disabled={!personId} loading={addMember.isPending}><Plus size={15} /> Add member</Button>
              </form>
              {addMember.error && <p role="alert" className="mt-3 text-sm text-semantic-danger">{addMember.error.message}</p>}
            </CardContent>
          </Card>

          <SectionCard icon={UsersRound} title="Members & availability" subtitle="Who is around today and this week" count={members.length}>
            {peopleQuery.error && <QueryError error={peopleQuery.error instanceof Error ? peopleQuery.error : null} retry={() => void peopleQuery.refetch()} />}
            {members.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                <SearchInput label="Search team members" placeholder="Search members..." value={memberSearch} onChange={setMemberSearch} />
                <select aria-label="Filter members by availability" className={inputClass} value={availability} onChange={(event) => setAvailability(event.target.value)}><option value="all">All availability</option><option value="today">Available today</option><option value="week">Available this week</option><option value="away-today">Away today</option><option value="away-week">Away this week</option></select>
              </div>
            )}
            {members.length === 0 ? <EmptyState icon={UsersRound} title="No team members" description="Add a teammate to see team availability." /> : filteredMembers.length === 0 ? <EmptyState icon={Search} title="No matching team members" description="Change your search or availability filter." /> : (
              <div className="grid gap-3 lg:grid-cols-2">
                {filteredMembers.map((member) => (
                  <div key={member.id} className="space-y-3 rounded-2xl border border-semantic-border bg-semantic-surface p-4 shadow-sm transition hover:border-semantic-accent/40 hover:shadow-md">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={member.person_name || '?'} size="lg" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-semantic-text">{member.person_name}</p>
                          <p className="truncate text-xs text-semantic-text-muted">{member.person_title || member.person_email}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="text-semantic-danger" aria-label={`Remove ${member.person_name}`} onClick={() => removeMember.mutate(member)}><Trash2 size={14} /> Remove</Button>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-semantic-border/70 pt-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={member.is_on_leave_today ? 'warning' : 'success'}>{member.is_on_leave_today ? 'Away today' : 'Available today'}</Badge>
                        <Badge variant={member.is_on_leave_this_week ? 'warning' : 'success'}>{member.is_on_leave_this_week ? 'Away this week' : 'Available this week'}</Badge>
                      </div>
                      <select aria-label={`Role for ${member.person_name}`} className="rounded-lg border border-semantic-border bg-semantic-surface px-2.5 py-1.5 text-xs font-medium" value={member.role} onChange={(event) => updateRole.mutate({ person: member, nextRole: event.target.value })}><option value="member">Member</option><option value="lead">Lead</option></select>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {(removeMember.error || updateRole.error) && <p role="alert" className="text-sm text-semantic-danger">{(removeMember.error || updateRole.error)?.message}</p>}
          </SectionCard>
        </>
      )}
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Leave                                   */
/* -------------------------------------------------------------------------- */

export function LeaveManagementPage() {
  const { user } = useAuth();
  const toast = useToast();
  const canApprove = ['owner', 'approver', 'project_manager'].includes(user?.role || '');
  const canRequestForOthers = ['owner', 'approver', 'project_manager', 'finance'].includes(user?.role || '');
  const [tab, setTab] = useState<'mine' | 'approvals' | 'calendar'>('mine');
  const [search, setSearch] = useState('');
  const [requestStatus, setRequestStatus] = useState('all');
  const [approvalType, setApprovalType] = useState('all');
  const [employeeId, setEmployeeId] = useState('');
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [halfDay, setHalfDay] = useState(false);
  const [halfDayPeriod, setHalfDayPeriod] = useState('morning');
  const [reason, setReason] = useState('');
  const [calendarStart, setCalendarStart] = useState(new Date().toISOString().slice(0, 10));
  const invalidate = useInvalidateOperations();
  const profileQuery = useQuery({
    queryKey: queryKey('my-employee'),
    queryFn: async () => {
      try { return await apiRequest<Employee>('/operations/me'); }
      catch (error) { if (error instanceof ApiError && error.status === 404) return null; throw error; }
  }});
  const peopleQuery = useQuery({ queryKey: queryKey('people-directory'), queryFn: () => apiRequest<Employee[]>('/operations/people/directory') });
  const leaveTypesQuery = useQuery({ queryKey: queryKey('leave-types'), queryFn: () => apiRequest<LeaveType[]>('/operations/leave-types') });
  const requestEmployeeId = canRequestForOthers ? employeeId : profileQuery.data?.id || '';
  const balancesQuery = useQuery({
    queryKey: queryKey('leave-balances', requestEmployeeId),
    queryFn: () => apiRequest<LeaveBalance[]>(`/operations/leave-balances?employee_id=${encodeURIComponent(requestEmployeeId)}`),
    enabled: Boolean(requestEmployeeId),
  });
  const mineQuery = useQuery({
    queryKey: queryKey('my-leave', requestEmployeeId),
    queryFn: () => apiRequest<LeaveRequest[]>(`/operations/leave-requests?employee_id=${encodeURIComponent(requestEmployeeId)}`),
    enabled: Boolean(requestEmployeeId),
  });
  const approvalsQuery = useQuery({
    queryKey: queryKey('leave-approvals'),
    queryFn: () => apiRequest<LeaveRequest[]>('/operations/leave-requests?status=pending'),
    enabled: canApprove && tab === 'approvals',
  });
  const calendarQuery = useQuery({
    queryKey: queryKey('leave-calendar', calendarStart),
    queryFn: () => {
      const start = new Date(`${calendarStart}T00:00:00`);
      const end = new Date(start);
      end.setDate(end.getDate() + 30);
      return apiRequest<LeaveCalendarEvent[]>(`/operations/leave-calendar?start_date=${calendarStart}&end_date=${end.toISOString().slice(0, 10)}`);
    },
    enabled: tab === 'calendar',
  });
  const days = countWorkingDays(startDate, endDate, halfDay);
  const selectedBalance = balancesQuery.data?.find((balance) => balance.leave_type_id === leaveTypeId);
  const selectedLeaveType = leaveTypesQuery.data?.find((type) => type.id === leaveTypeId);
  const createRequest = useMutation({
    mutationFn: () => apiRequest<LeaveRequest>('/operations/leave-requests', {
      method: 'POST',
      body: JSON.stringify({
        employee_id: requestEmployeeId,
        leave_type_id: leaveTypeId || null,
        leave_type: selectedLeaveType?.code || 'annual',
        start_date: startDate,
        end_date: endDate,
        is_half_day: halfDay,
        half_day_period: halfDay ? halfDayPeriod : null,
        working_days: days,
        reason: reason.trim() || null,
      }),
    }),
    onSuccess: async () => {
      setStartDate(''); setEndDate(''); setHalfDay(false); setReason('');
      await invalidate();
      toast.success('Leave request submitted.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to submit leave request'),
  });
  const decision = useMutation({
    mutationFn: ({ request, value }: { request: LeaveRequest; value: 'approved' | 'rejected' }) => apiRequest(`/operations/leave-requests/${request.id}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision: value, decision_note: `Reviewed by ${user?.full_name || 'workspace lead'}.` }),
    }),
    onSuccess: async (_, variables) => { await invalidate(); toast.success(`Leave request ${variables.value}.`); },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update leave request'),
  });
  const deleteRequest = useMutation({
    mutationFn: (request: LeaveRequest) => apiRequest(`/operations/leave-requests/${request.id}`, { method: 'DELETE' }),
    onSuccess: async () => { await invalidate(); toast.success('Leave request deleted.'); },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to delete leave request'),
  });

  useEffect(() => {
    if (!employeeId && canRequestForOthers && peopleQuery.data?.length) setEmployeeId(peopleQuery.data[0].id);
  }, [canRequestForOthers, employeeId, peopleQuery.data]);
  useEffect(() => {
    if (!leaveTypeId && leaveTypesQuery.data?.length) setLeaveTypeId(leaveTypesQuery.data[0].id);
  }, [leaveTypeId, leaveTypesQuery.data]);

  const filteredMine = (mineQuery.data || []).filter((request) => {
    const personName = peopleQuery.data?.find((person) => person.id === request.employee_id)?.full_name || '';
    const text = `${personName} ${request.reason || ''} ${request.status}`.toLowerCase();
    return text.includes(search.trim().toLowerCase()) && (requestStatus === 'all' || request.status === requestStatus);
  });
  const filteredApprovals = (approvalsQuery.data || []).filter((request) => {
    const personName = peopleQuery.data?.find((person) => person.id === request.employee_id)?.full_name || '';
    return `${personName} ${request.reason || ''}`.toLowerCase().includes(search.trim().toLowerCase()) &&
      (approvalType === 'all' || request.leave_type === approvalType);
  });
  const filteredCalendar = (calendarQuery.data || []).filter((event) =>
    `${event.employee_name} ${event.leave_type}`.toLowerCase().includes(search.trim().toLowerCase())
  );
  const pageError = profileQuery.error || peopleQuery.error || leaveTypesQuery.error ||
    (tab === 'mine' ? mineQuery.error : tab === 'approvals' ? approvalsQuery.error : calendarQuery.error);
  const pageLoading = profileQuery.isLoading || peopleQuery.isLoading || leaveTypesQuery.isLoading ||
    (tab === 'mine' ? mineQuery.isLoading : tab === 'approvals' ? approvalsQuery.isLoading : calendarQuery.isLoading);
  const pendingMine = (mineQuery.data || []).filter((request) => request.status === 'pending').length;
  const approvedMine = (mineQuery.data || []).filter((request) => request.status === 'approved').length;
  const tabs: Array<{ id: typeof tab; label: string; icon?: typeof Inbox; count?: number }> = [{ id: 'mine', label: 'My leave', icon: CalendarDays }];
  if (canApprove) tabs.push({ id: 'approvals', label: 'Approvals', icon: Check, count: approvalsQuery.data?.length });
  tabs.push({ id: 'calendar', label: 'Team calendar', icon: UsersRound });

  return (
    <main className="page-shell space-y-6">
      <PageHeader eyebrow="Team" title="Leave management" description="Submit leave, review requests, and see approved absences." statChips={[{ label: 'Working days', value: days, tone: 'accent' }, { label: 'Requests pending', value: pendingMine, tone: 'warning' }]} />
      {pageError instanceof Error && <QueryError error={pageError} retry={() => { void profileQuery.refetch(); void peopleQuery.refetch(); void leaveTypesQuery.refetch(); void mineQuery.refetch(); }} />}
      <SegmentedTabs label="Leave views" items={tabs} value={tab} onChange={setTab} />

      {tab === 'mine' && (
        <>
          {(balancesQuery.data || []).length > 0 && (
            <section aria-label="Leave balances" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {(balancesQuery.data || []).slice(0, 4).map((balance) => {
                const usedPercent = balance.allocated_days ? (balance.used_days / balance.allocated_days) * 100 : 0;
                return (
                  <div key={balance.id} className={`rounded-2xl border bg-semantic-surface p-4 shadow-sm transition hover:shadow-md ${balance.leave_type_id === leaveTypeId ? 'border-semantic-accent/60 ring-2 ring-semantic-accent/15' : 'border-semantic-border/80'}`}>
                    <div className="flex items-center justify-between"><p className="text-[11px] font-semibold uppercase tracking-wider text-semantic-text-muted">{balance.leave_type_name || balance.leave_type_code}</p><span className="text-[11px] text-semantic-text-muted">{balance.year}</span></div>
                    <p className="mt-1.5 text-2xl font-bold tracking-tight">{balance.remaining_days}<span className="ml-1 text-sm font-medium text-semantic-text-muted">/ {balance.allocated_days} days</span></p>
                    <ProgressBar className="mt-3" value={usedPercent} barClass={usedPercent > 85 ? 'bg-rose-500' : 'bg-emerald-500'} />
                    <p className="mt-1.5 text-[11px] text-semantic-text-muted">{balance.used_days} used</p>
                  </div>
                );
              })}
            </section>
          )}

          <Card className={panelClass}>
            <CardHeader>
              <div className="flex items-center gap-3"><span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-semantic-accent/10 text-semantic-accent"><CalendarDays size={17} /></span><div><h2 className="font-semibold">Request time off</h2><p className="text-xs text-semantic-text-muted">Weekends are excluded from the live day count.</p></div></div>
              <Badge variant={days > 0 ? 'success' : 'muted'}>{days} working {days === 1 ? 'day' : 'days'}</Badge>
            </CardHeader>
            <CardContent>
              <form onSubmit={(event) => { event.preventDefault(); createRequest.mutate(); }} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {canRequestForOthers && <label className={labelClass}>Teammate<select className={`${inputClass} mt-1.5 normal-case tracking-normal`} required value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">Choose teammate</option>{(peopleQuery.data || []).filter((person) => person.is_active).map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></label>}
                <label className={labelClass}>Leave type<select className={`${inputClass} mt-1.5 normal-case tracking-normal`} required value={leaveTypeId} onChange={(event) => setLeaveTypeId(event.target.value)}>{(leaveTypesQuery.data || []).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
                <label className={labelClass}>First day<input className={`${inputClass} mt-1.5`} type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
                <label className={labelClass}>Last day<input className={`${inputClass} mt-1.5`} type="date" min={startDate || undefined} required value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
                <label className="flex items-center gap-2.5 self-end rounded-xl border border-semantic-border bg-semantic-surface-muted/40 px-3.5 py-2.5 text-sm font-medium"><input type="checkbox" className="h-4 w-4 accent-sky-600" checked={halfDay} onChange={(event) => setHalfDay(event.target.checked)} /> Half-day request</label>
                {halfDay && <label className={labelClass}>Part of day<select className={`${inputClass} mt-1.5 normal-case tracking-normal`} value={halfDayPeriod} onChange={(event) => setHalfDayPeriod(event.target.value)}><option value="morning">Morning</option><option value="afternoon">Afternoon</option></select></label>}
                <label className={`${labelClass} sm:col-span-2`}>Reason (optional)<input className={`${inputClass} mt-1.5`} placeholder="Add context for the approver" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-semantic-surface-muted/50 px-4 py-3 sm:col-span-2 xl:col-span-4">
                  <div className="text-sm text-semantic-text-muted"><strong className="text-semantic-text">{days}</strong> working {days === 1 ? 'day' : 'days'} requested{selectedBalance ? ` · ${selectedBalance.remaining_days} ${selectedBalance.leave_type_name || 'leave'} days remaining` : selectedLeaveType ? ` · ${selectedLeaveType.default_days_per_year} default days per year` : ''}</div>
                  <Button type="submit" disabled={!requestEmployeeId || !leaveTypeId || days <= 0} loading={createRequest.isPending}><Send size={14} /> Submit request</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <SectionCard icon={Inbox} title="My leave requests" subtitle={`${pendingMine} pending · ${approvedMine} approved`} count={filteredMine.length}>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
              <SearchInput label="Search my leave" placeholder="Search requests..." value={search} onChange={setSearch} />
              <select aria-label="Filter my leave by status" className={inputClass} value={requestStatus} onChange={(event) => setRequestStatus(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option></select>
            </div>
            {pageLoading ? <LoadingCards count={2} /> : filteredMine.length ? <div className="space-y-2">{filteredMine.map((request) => <LeaveRequestRow key={request.id} request={request} personName={peopleQuery.data?.find((person) => person.id === request.employee_id)?.full_name || 'You'} actions={request.status === 'pending' ? <Button size="sm" variant="ghost" className="text-semantic-danger" onClick={() => deleteRequest.mutate(request)}><Trash2 size={14} /> Cancel request</Button> : undefined} />)}</div> : <EmptyState icon={CalendarDays} title="No leave requests" description="Your requests will appear here after submission." />}
          </SectionCard>
        </>
      )}

      {tab === 'approvals' && canApprove && (
        <SectionCard icon={Check} title="Leave approvals" subtitle="Review pending requests from your organization." count={filteredApprovals.length} action={<Badge variant="warning">{filteredApprovals.length} pending</Badge>}>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
            <SearchInput label="Search leave approvals" placeholder="Search by teammate or reason..." value={search} onChange={setSearch} />
            <select aria-label="Filter approvals by leave type" className={inputClass} value={approvalType} onChange={(event) => setApprovalType(event.target.value)}><option value="all">All leave types</option>{(leaveTypesQuery.data || []).map((type) => <option key={type.id} value={type.code}>{type.name}</option>)}</select>
          </div>
          {pageLoading ? <LoadingCards count={2} /> : filteredApprovals.length ? <div className="space-y-2">{filteredApprovals.map((request) => <LeaveRequestRow key={request.id} request={request} personName={peopleQuery.data?.find((person) => person.id === request.employee_id)?.full_name || 'Teammate'} actions={<><Button size="sm" onClick={() => decision.mutate({ request, value: 'approved' })}><Check size={14} /> Approve</Button><Button size="sm" variant="destructive" onClick={() => decision.mutate({ request, value: 'rejected' })}>Reject</Button></>} />)}</div> : <EmptyState icon={Check} title="No pending approvals" description="There are no leave requests waiting for review." />}
        </SectionCard>
      )}

      {tab === 'calendar' && (
        <SectionCard
          icon={CalendarDays}
          title="Approved leave calendar"
          subtitle="Approved absences during the selected 31-day window."
          count={filteredCalendar.length}
          action={<input aria-label="Calendar start date" className={`${inputClass} w-auto`} type="date" value={calendarStart} onChange={(event) => setCalendarStart(event.target.value)} />}
        >
          <SearchInput label="Search leave calendar" placeholder="Search people or leave type..." value={search} onChange={setSearch} className="max-w-lg" />
          {calendarQuery.isLoading ? <LoadingCards count={2} /> : filteredCalendar.length ? (
            <LeaveTimeline events={filteredCalendar} windowStart={calendarStart} />
          ) : <EmptyState icon={CalendarDays} title={(calendarQuery.data || []).length ? 'No matching leave' : 'No approved leave in this range'} description={(calendarQuery.data || []).length ? 'Try a different search.' : 'Choose another start date to view future or recent leave.'} />}
        </SectionCard>
      )}
    </main>
  );
}

function LeaveTimeline({ events, windowStart }: { events: LeaveCalendarEvent[]; windowStart: string }) {
  const windowDays = 31;
  const start = new Date(`${windowStart}T00:00:00`).getTime();
  const dayMs = 86_400_000;
  const ticks = [0, 7, 14, 21, 28];
  const offsetFor = (value: string) => Math.max(0, Math.min(windowDays, Math.round((new Date(`${value.slice(0, 10)}T00:00:00`).getTime() - start) / dayMs)));
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-semantic-border bg-semantic-surface">
        <div className="relative hidden h-8 border-b border-semantic-border bg-semantic-surface-muted/40 sm:block">
          {ticks.map((tick) => (
            <span key={tick} className="absolute top-1/2 -translate-y-1/2 text-[10px] font-semibold text-semantic-text-muted" style={{ left: `calc(${(tick / windowDays) * 100}% + 8px)` }}>
              {formatShort(new Date(start + tick * dayMs).toISOString().slice(0, 10))}
            </span>
          ))}
        </div>
        <ul className="divide-y divide-semantic-border/70">
          {events.map((event) => {
            const from = offsetFor(event.start_date);
            const to = Math.max(from + 1, offsetFor(event.end_date) + 1);
            return (
              <li key={event.id} className="grid items-center gap-2 px-4 py-3 sm:grid-cols-[200px_minmax(0,1fr)]">
                <div className="flex min-w-0 items-center gap-2.5"><Avatar name={event.employee_name} size="sm" /><div className="min-w-0"><p className="truncate text-sm font-semibold">{event.employee_name}</p><p className="truncate text-[11px] text-semantic-text-muted">{titleCase(event.leave_type)} · {event.days} {event.days === 1 ? 'day' : 'days'}{event.is_half_day ? ' (half)' : ''}</p></div></div>
                <div className="relative h-7 rounded-lg bg-semantic-surface-muted/50">
                  {ticks.map((tick) => <span key={tick} className="absolute inset-y-0 w-px bg-semantic-border/60" style={{ left: `${(tick / windowDays) * 100}%` }} aria-hidden />)}
                  <div title={formatRange(event.start_date, event.end_date)} className={`absolute inset-y-1 flex items-center overflow-hidden rounded-md bg-gradient-to-r px-2 text-[10px] font-bold text-white shadow-sm ${toneFor(event.employee_name)}`} style={{ left: `${(from / windowDays) * 100}%`, width: `${Math.min(((to - from) / windowDays) * 100, 100 - (from / windowDays) * 100)}%` }}>
                    <span className="truncate">{formatRange(event.start_date, event.end_date)}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function LeaveRequestRow({ request, personName, actions }: { request: LeaveRequest; personName: string; actions?: ReactNode }) {
  const tone = request.status === 'approved' ? 'bg-emerald-500' : request.status === 'rejected' ? 'bg-rose-500' : 'bg-amber-500';
  return (
    <div className="relative flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-xl border border-semantic-border/80 bg-semantic-surface p-3 pl-5 transition hover:border-semantic-accent/30 hover:shadow-sm">
      <span className={`absolute inset-y-0 left-0 w-1 ${tone}`} aria-hidden />
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={personName} size="md" />
        <div className="min-w-0">
          <p className="font-semibold text-semantic-text">{personName}</p>
          <p className="text-xs text-semantic-text-muted"><CalendarDays size={12} className="mr-1 inline" />{formatRange(request.start_date, request.end_date)} · {titleCase(request.leave_type)} · {request.days_computed || request.working_days} working days{request.reason ? ` · ${request.reason}` : ''}</p>
          {request.decision_note && <p className="mt-0.5 text-xs italic text-semantic-text-muted">“{request.decision_note}”</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2"><Badge variant={request.status === 'approved' ? 'success' : request.status === 'rejected' ? 'danger' : 'warning'}>{request.status}</Badge>{actions}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Invoices                                 */
/* -------------------------------------------------------------------------- */

export function InvoiceDetailPage() {
  const { invoiceId = '' } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('other');
  const [reference, setReference] = useState('');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('all');
  const [pdfUrl, setPdfUrl] = useState('');
  const invoiceQuery = useQuery({ queryKey: queryKey('invoice', invoiceId), queryFn: () => apiRequest<InvoiceDetail>(`/billing/invoices/${invoiceId}`), enabled: Boolean(invoiceId) });
  const paymentsQuery = useQuery({ queryKey: queryKey('invoice-payments', invoiceId), queryFn: () => apiRequest<Payment[]>(`/billing/invoices/${invoiceId}/payments`), enabled: Boolean(invoiceId) });
  const pdfQuery = useQuery({
    queryKey: queryKey('invoice-pdf', invoiceId),
    queryFn: async () => {
      const token = localStorage.getItem('opspilot_token');
      const orgId = localStorage.getItem('opspilot_org_id');
      const response = await fetch(`/api/v1/billing/invoices/${invoiceId}/pdf`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(orgId ? { 'X-Org-ID': orgId } : {}) },
      });
      if (!response.ok) throw new Error(`Invoice preview failed (${response.status}).`);
      return response.blob();
    },
    enabled: Boolean(invoiceId),
  });
  const invalidate = useInvalidateOperations();
  const canManage = ['owner', 'finance'].includes(user?.role || '');
  const pay = useMutation({
    mutationFn: () => apiRequest(`/billing/invoices/${invoiceId}/payments`, {
      method: 'POST',
      body: JSON.stringify({ amount_cents: Math.round(Number(amount) * 100), paid_date: paidDate, method, reference: reference.trim() || null }),
    }),
    onSuccess: async () => { setAmount(''); setReference(''); await invalidate(); toast.success('Payment recorded.'); },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to record payment'),
  });
  const updateStatus = useMutation({
    mutationFn: (status: 'sent' | 'void') => apiRequest(`/billing/invoices/${invoiceId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: async (_, status) => { await invalidate(); toast.success(status === 'sent' ? 'Invoice marked as sent.' : 'Invoice voided.'); },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update invoice status'),
  });
  useEffect(() => {
    if (!pdfQuery.data) return;
    const objectUrl = URL.createObjectURL(pdfQuery.data);
    setPdfUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [pdfQuery.data]);
  const invoice = invoiceQuery.data;
  const filteredPayments = (paymentsQuery.data || []).filter((payment) =>
    `${payment.paid_date} ${payment.method} ${payment.reference || ''}`.toLowerCase().includes(paymentSearch.trim().toLowerCase()) &&
    (paymentMethodFilter === 'all' || payment.method === paymentMethodFilter)
  );
  const amountCents = Math.round(Number(amount) * 100);
  const paidPercent = invoice && invoice.total_cents ? (invoice.paid_cents / invoice.total_cents) * 100 : 0;
  const downloadPdf = async () => {
    try {
      const token = localStorage.getItem('opspilot_token');
      const orgId = localStorage.getItem('opspilot_org_id');
      const response = await fetch(`/api/v1/billing/invoices/${invoiceId}/pdf?download=true`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(orgId ? { 'X-Org-ID': orgId } : {}) },
      });
      if (!response.ok) throw new Error(`Invoice download failed (${response.status}).`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${invoice?.invoice_number || 'invoice'}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to download invoice PDF');
    }
  };
  return (
    <main className="page-shell space-y-6">
      <BackLink to="/invoicing">Back to invoices</BackLink>
      {invoiceQuery.isLoading ? <LoadingCards count={2} /> : invoiceQuery.error ? <QueryError error={invoiceQuery.error instanceof Error ? invoiceQuery.error : null} retry={() => void invoiceQuery.refetch()} /> : invoice && (
        <>
          <PageHeader eyebrow="Finance" title={invoice.invoice_number} description={invoice.client_name} statChips={[{ label: 'Balance due', value: money(invoice.balance_due_cents, invoice.currency), tone: invoice.is_overdue ? 'danger' : 'accent' }]} primaryAction={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void downloadPdf()}><Download size={15} /> Download PDF</Button>{canManage && invoice.status === 'draft' && <Button onClick={() => updateStatus.mutate('sent')}><Send size={15} /> Mark sent</Button>}{canManage && invoice.status !== 'paid' && invoice.status !== 'void' && <Button variant="destructive" onClick={() => updateStatus.mutate('void')}><Ban size={15} /> Void invoice</Button>}</div>} />
          {invoice.is_overdue && <Alert variant="warning" title="Invoice overdue">Payment is past due. Balance remaining: {money(invoice.balance_due_cents, invoice.currency)}.</Alert>}

          <section aria-label="Invoice summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile icon={FileText} label="Total" value={money(invoice.total_cents, invoice.currency)} hint={`${invoice.line_items.length} line items`} tone="accent" />
            <StatTile icon={CheckCircle2} label="Paid" value={money(invoice.paid_cents, invoice.currency)} hint={`${Math.round(paidPercent)}% collected`} tone="success" />
            <StatTile icon={Wallet} label="Balance due" value={money(invoice.balance_due_cents, invoice.currency)} hint={invoice.is_overdue ? 'Past due' : 'Outstanding'} tone={invoice.is_overdue ? 'danger' : 'warning'} />
            <StatTile icon={CalendarDays} label="Due date" value={formatShort(invoice.due_date)} hint={`Issued ${formatDate(invoice.issue_date)}`} tone={invoice.is_overdue ? 'danger' : 'muted'} />
          </section>

          <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
            <Card className={panelClass}>
              <CardHeader>
                <div className="flex items-center gap-3"><span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-semantic-accent/10 text-semantic-accent"><FileText size={17} /></span><div><h2 className="font-semibold">Invoice details</h2><p className="text-xs text-semantic-text-muted">{invoice.client_name}</p></div></div>
                <Badge variant={invoice.status === 'paid' ? 'success' : invoice.status === 'void' ? 'danger' : 'warning'}>{invoice.status}</Badge>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs font-semibold"><span className="text-semantic-text-muted">Payment progress</span><span className="text-semantic-text">{Math.round(paidPercent)}%</span></div>
                  <ProgressBar value={paidPercent} barClass={paidPercent >= 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-sky-500 to-indigo-500'} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-semantic-surface-muted/50 p-3"><p className={labelClass}>Issue date</p><p className="mt-1 font-medium">{formatDate(invoice.issue_date)}</p></div>
                  <div className="rounded-xl bg-semantic-surface-muted/50 p-3"><p className={labelClass}>Due date</p><p className={`mt-1 font-medium ${invoice.is_overdue ? 'text-rose-600' : ''}`}>{formatDate(invoice.due_date)}</p></div>
                </div>
                <div className="overflow-hidden rounded-xl border border-semantic-border">
                  <div className="hidden grid-cols-[1fr_auto] bg-semantic-surface-muted/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-semantic-text-muted sm:grid"><span>Description</span><span>Amount</span></div>
                  <div className="divide-y divide-semantic-border">{invoice.line_items.map((line) => <div key={line.id} className="flex justify-between gap-4 p-4 transition hover:bg-semantic-surface-muted/30"><div><p className="font-medium">{line.description}</p><p className="text-xs text-semantic-text-muted">{line.quantity} × {money(line.unit_price_cents, invoice.currency)}</p></div><span className="font-semibold">{money(line.amount_cents, invoice.currency)}</span></div>)}</div>
                </div>
                <div className="ml-auto max-w-sm space-y-2 rounded-xl bg-semantic-surface-muted/40 p-4 text-sm"><MoneyRow label="Subtotal" value={money(invoice.subtotal_cents, invoice.currency)} /><MoneyRow label="Discount" value={`−${money(invoice.discount_cents, invoice.currency)}`} /><MoneyRow label="Tax" value={money(invoice.tax_cents, invoice.currency)} /><div className="border-t border-semantic-border pt-2"><MoneyRow label="Total" value={money(invoice.total_cents, invoice.currency)} bold /></div><MoneyRow label="Paid" value={money(invoice.paid_cents, invoice.currency)} /><div className="border-t border-semantic-border pt-2"><MoneyRow label="Balance due" value={money(invoice.balance_due_cents, invoice.currency)} bold /></div></div>
                {invoice.notes && <p className="rounded-xl border border-dashed border-semantic-border p-3 text-sm text-semantic-text-muted">{invoice.notes}</p>}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <SectionCard icon={Wallet} title="Payments" subtitle="Recorded against this invoice" count={paymentsQuery.data?.length || 0}>
                {canManage && invoice.balance_due_cents > 0 && invoice.status !== 'void' && (
                  <form onSubmit={(event) => { event.preventDefault(); if (amountCents > 0) pay.mutate(); }} className="space-y-3 rounded-2xl border border-semantic-border bg-semantic-surface-muted/30 p-4">
                    <label className={labelClass}>Amount<input className={`${inputClass} mt-1.5`} type="number" step="0.01" min="0.01" max={(invoice.balance_due_cents / 100).toFixed(2)} required value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setAmount((invoice.balance_due_cents / 100).toFixed(2))} className="rounded-full border border-semantic-border bg-semantic-surface px-3 py-1 text-[11px] font-semibold text-semantic-accent transition hover:border-semantic-accent/50">Pay full balance</button>
                      <button type="button" onClick={() => setAmount((invoice.balance_due_cents / 200).toFixed(2))} className="rounded-full border border-semantic-border bg-semantic-surface px-3 py-1 text-[11px] font-semibold text-semantic-text-muted transition hover:border-semantic-accent/50">50%</button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2"><label className={labelClass}>Paid date<input className={`${inputClass} mt-1.5`} type="date" required value={paidDate} onChange={(event) => setPaidDate(event.target.value)} /></label><label className={labelClass}>Method<select className={`${inputClass} mt-1.5 normal-case tracking-normal`} value={method} onChange={(event) => setMethod(event.target.value)}><option value="other">Other</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="cash">Cash</option><option value="check">Check</option></select></label></div>
                    <label className={labelClass}>Reference (optional)<input className={`${inputClass} mt-1.5`} value={reference} onChange={(event) => setReference(event.target.value)} /></label>
                    <Button type="submit" loading={pay.isPending} disabled={amountCents <= 0 || amountCents > invoice.balance_due_cents}>Record payment</Button>
                  </form>
                )}
                {paymentsQuery.error && <QueryError error={paymentsQuery.error instanceof Error ? paymentsQuery.error : null} retry={() => void paymentsQuery.refetch()} />}
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px]">
                  <SearchInput label="Search invoice payments" placeholder="Search payments..." value={paymentSearch} onChange={setPaymentSearch} />
                  <select aria-label="Filter payments by method" className={inputClass} value={paymentMethodFilter} onChange={(event) => setPaymentMethodFilter(event.target.value)}><option value="all">All methods</option>{Array.from(new Set((paymentsQuery.data || []).map((payment) => payment.method))).map((paymentMethod) => <option key={paymentMethod} value={paymentMethod}>{paymentMethod.replace('_', ' ')}</option>)}</select>
                </div>
                {paymentsQuery.isLoading ? <Skeleton variant="text" /> : filteredPayments.length ? (
                  <ol className="relative space-y-3 border-l-2 border-semantic-border/70 pl-5">
                    {filteredPayments.map((payment) => (
                      <li key={payment.id} className="relative rounded-xl border border-semantic-border/80 bg-semantic-surface p-3 transition hover:border-semantic-accent/30">
                        <span className="absolute -left-[27px] top-4 h-3 w-3 rounded-full border-2 border-semantic-surface bg-emerald-500 ring-2 ring-emerald-500/20" aria-hidden />
                        <div className="flex items-center justify-between gap-2"><p className="font-semibold text-semantic-text">{money(payment.amount_cents, invoice.currency)}</p><Badge variant="muted" size="sm">{titleCase(payment.method)}</Badge></div>
                        <p className="mt-0.5 text-xs text-semantic-text-muted">{formatDate(payment.paid_date)}{payment.reference ? ` · ${payment.reference}` : ''}</p>
                      </li>
                    ))}
                  </ol>
                ) : <EmptyState icon={Inbox} title={(paymentsQuery.data || []).length ? 'No matching payments' : 'No payments recorded'} description={(paymentsQuery.data || []).length ? 'Try another search or method.' : 'Payments will appear here once recorded.'} />}
              </SectionCard>

              <SectionCard icon={FileText} title="PDF preview" subtitle="Exactly what your client receives">
                {pdfQuery.error ? <QueryError error={pdfQuery.error instanceof Error ? pdfQuery.error : null} retry={() => void pdfQuery.refetch()} /> : pdfQuery.isLoading ? <Skeleton variant="card" /> : pdfUrl ? <iframe title="Invoice PDF preview" src={pdfUrl} className="h-[560px] w-full rounded-xl border border-semantic-border bg-white shadow-inner" /> : null}
              </SectionCard>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function MoneyRow({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return <div className={`flex justify-between gap-3 ${bold ? 'text-base font-bold text-semantic-text' : 'text-semantic-text-muted'}`}><span>{label}</span><span>{value}</span></div>;
}