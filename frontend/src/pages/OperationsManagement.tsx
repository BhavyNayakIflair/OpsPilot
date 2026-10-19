import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CalendarDays, Check, Clock3, FileText, Inbox, Plus, Search, Trash2, UsersRound } from 'lucide-react';
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

const inputClass = 'w-full rounded-ui-xl border border-semantic-border bg-semantic-surface px-3.5 py-2 text-sm text-semantic-text placeholder:text-semantic-text-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-border';
const orgKey = () => localStorage.getItem('opspilot_org_id') || 'current';
const queryKey = (name: string, ...parts: string[]) => ['operations', orgKey(), name, ...parts];

function useInvalidateOperations() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['operations', orgKey()] });
}

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

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
  return (
    <span
      aria-label={name}
      title={name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 font-bold text-white ${size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-9 w-9 text-xs'}`}
    >
      {initials}
    </span>
  );
}

function roleTone(role: string): 'success' | 'warning' | 'muted' {
  return role === 'owner' ? 'success' : role === 'reviewer' ? 'warning' : 'muted';
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

export function TasksPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [projectId, setProjectId] = useState('all');
  const [assigneeId, setAssigneeId] = useState('all');
  const [myTasks, setMyTasks] = useState(false);
  const [reassignmentOnly, setReassignmentOnly] = useState(false);
  const tasksQuery = useQuery({ queryKey: queryKey('tasks'), queryFn: () => apiRequest<Task[]>('/operations/tasks') });
  const peopleQuery = useQuery({ queryKey: queryKey('people-directory'), queryFn: () => apiRequest<Employee[]>('/operations/people/directory') });
  const projectsQuery = useQuery({ queryKey: queryKey('projects'), queryFn: () => apiRequest<Project[]>('/operations/projects') });

  const employeeId = peopleQuery.data?.find((person) => person.user_id === user?.id)?.id;
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

  const combinedError = tasksQuery.error || peopleQuery.error || projectsQuery.error;
  return (
    <main className="page-shell space-y-6">
      <PageHeader
        eyebrow="Delivery"
        title="Tasks"
        description="Review assignments, workload, and leave-related handoffs across your projects."
        statChips={[{ label: 'Open tasks', value: (tasksQuery.data || []).filter((task) => task.status !== 'done').length }, { label: 'Needs reassignment', value: (tasksQuery.data || []).filter((task) => task.needs_reassignment).length, tone: 'warning' }]}
      />
      <QueryError error={combinedError instanceof Error ? combinedError : null} retry={() => { void tasksQuery.refetch(); void peopleQuery.refetch(); void projectsQuery.refetch(); }} />
      <Card>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label className="relative sm:col-span-2 xl:col-span-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-semantic-text-muted" />
            <input aria-label="Search tasks" className={`${inputClass} pl-9`} placeholder="Search tasks..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <select aria-label="Filter tasks by status" className={inputClass} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option><option value="todo">To do</option><option value="in_progress">In progress</option><option value="in_review">In review</option><option value="done">Done</option>
          </select>
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
        </CardContent>
      </Card>
      {tasksQuery.isLoading || peopleQuery.isLoading || projectsQuery.isLoading ? <LoadingCards /> : filtered.length === 0 ? (
        <EmptyState icon={Inbox} title={(tasksQuery.data || []).length ? 'No matching tasks' : 'No tasks yet'} description="Change the search or filters to find tasks." />
      ) : (
        <div className="space-y-3">
          {filtered.map((task) => (
            <TaskCard key={task.id} task={task} people={peopleQuery.data || []} projectName={projectsQuery.data?.find((project) => project.id === task.project_id)?.name || 'Project'} />
          ))}
        </div>
      )}
    </main>
  );
}

function TaskCard({ task, people, projectName }: { task: Task; people: Employee[]; projectName: string }) {
  const [editing, setEditing] = useState(false);
  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-semantic-text-muted">{projectName}</p>
            <h2 className="mt-1 break-words font-semibold text-semantic-text">{task.title}</h2>
            {task.due_date && <p className="mt-1 flex items-center gap-1 text-xs text-semantic-text-muted"><Clock3 size={13} /> Due {task.due_date}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={task.status === 'done' ? 'success' : 'muted'}>{task.status.replace('_', ' ')}</Badge>
            {task.needs_reassignment && <Badge variant="danger"><AlertTriangle size={12} className="mr-1" />Needs reassignment</Badge>}
            <Badge variant="muted">{task.priority}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-semantic-border pt-3">
          <div className="flex flex-wrap items-center gap-2">
            {task.assignees.length ? task.assignees.map((assignee) => (
              <span key={assignee.person_id} className="inline-flex items-center gap-2 rounded-full border border-semantic-border bg-semantic-surface-muted/40 py-1 pl-1 pr-2.5">
                <Avatar name={assignee.person_name || people.find((person) => person.id === assignee.person_id)?.full_name || '?'} size="sm" />
                <span className="text-xs font-medium text-semantic-text">{assignee.person_name || people.find((person) => person.id === assignee.person_id)?.full_name || 'Teammate'}</span>
                <Badge variant={roleTone(assignee.role)} size="sm">{assignee.role}</Badge>
              </span>
            )) : <Badge variant="muted">Unassigned</Badge>}
            {task.estimate_minutes > 0 && <Badge variant="muted">{(task.estimate_minutes / 60).toFixed(1)}h estimated</Badge>}
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
        window.alert(error instanceof Error ? error.message : 'Unable to update task assignments.');
      }
    }
  };
  const members = (membersQuery.data || []).filter((member) => people.some((person) => person.id === member.person_id && person.is_active));
  return (
    <div className="space-y-3 rounded-xl border border-semantic-border bg-semantic-surface-muted/30 p-4">
      {membersQuery.error && <QueryError error={membersQuery.error instanceof Error ? membersQuery.error : null} retry={() => void membersQuery.refetch()} />}
      {membersQuery.isLoading ? <Skeleton variant="text" /> : members.length === 0 ? (
        <p className="text-sm text-semantic-text-muted">Add active teammates to this project before assigning its tasks.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {members.map((member) => {
            const person = people.find((entry) => entry.id === member.person_id);
            const role = selected[member.person_id];
            return (
              <div key={member.person_id} className="flex min-w-0 items-center gap-2 rounded-lg border border-semantic-border bg-semantic-surface p-2">
                <input
                  type="checkbox"
                  aria-label={`Assign ${person?.full_name || member.person_name || 'teammate'}`}
                  checked={Boolean(role)}
                  onChange={(event) => setSelected((current) => {
                    const next = { ...current };
                    if (event.target.checked) next[member.person_id] = 'contributor';
                    else delete next[member.person_id];
                    return next;
                  })}
                />
                <Avatar name={person?.full_name || member.person_name || '?'} size="sm" />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{person?.full_name || member.person_name}</span>
                {role && (
                  <select aria-label={`Role for ${person?.full_name || member.person_name}`} className="rounded border border-semantic-border bg-semantic-surface px-2 py-1 text-xs" value={role} onChange={(event) => setSelected((current) => ({ ...current, [member.person_id]: event.target.value as TaskRole }))}>
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
          <h3 id={`assignment-warning-${task.id}`} className="font-semibold text-semantic-text">
            {warning.kind === 'leave' ? 'Leave conflict' : 'Workload warning'}
          </h3>
          <p className="text-sm text-semantic-text">{warning.message}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void submit(warning.personId)}>Assign anyway</Button>
            <Button size="sm" variant="secondary" onClick={() => setWarning(null)}>Choose someone else</Button>
          </div>
        </div>
      )}
      {suggestionsQuery.error && <p className="text-xs text-semantic-text-muted">Capacity warnings are unavailable. Assignment validation will still be enforced by the server.</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={save.isPending} disabled={members.length === 0 || suggestionsQuery.isLoading} onClick={() => void submit()}>
          Save assignments
        </Button>
      </div>
      {save.error && !warning && <p role="alert" className="text-sm text-semantic-danger">{save.error.message}</p>}
    </div>
  );
}

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
  return (
    <main className="page-shell space-y-6">
      <Link to="/people" className="inline-flex items-center gap-2 text-sm font-medium text-semantic-accent hover:underline"><ArrowLeft size={16} /> Back to people</Link>
      {personQuery.isLoading || projectsQuery.isLoading ? <LoadingCards count={2} /> : personQuery.error || projectsQuery.error ? <QueryError error={(personQuery.error || projectsQuery.error) instanceof Error ? (personQuery.error || projectsQuery.error) as Error : null} retry={() => { void personQuery.refetch(); void projectsQuery.refetch(); }} /> : person && (
        <>
          <PageHeader eyebrow="Team" title={person.full_name} description={person.title || person.email || 'Teammate profile'} statChips={[{ label: 'Current workload', value: `${person.current_load_percent}%`, tone: person.current_load_percent > 100 ? 'danger' : 'accent' }]} />
          <Card>
            <CardContent className="flex flex-wrap items-center gap-4">
              <Avatar name={person.full_name} />
              <div><p className="font-semibold">{person.email || 'No email address'}</p><p className="text-sm text-semantic-text-muted">{person.weekly_capacity_hours}h weekly capacity</p></div>
              <label className="relative ml-auto min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-semantic-text-muted" />
                <input className={`${inputClass} pl-9`} aria-label="Search person details" placeholder="Filter tasks, projects, leave..." value={search} onChange={(event) => setSearch(event.target.value)} />
              </label>
              <select aria-label="Filter assigned tasks" className={`${inputClass} max-w-[190px]`} value={taskStatus} onChange={(event) => setTaskStatus(event.target.value)}><option value="open">Open tasks</option><option value="all">All tasks</option><option value="todo">To do</option><option value="in_progress">In progress</option><option value="in_review">In review</option><option value="done">Done</option></select>
              <select aria-label="Filter upcoming leave" className={`${inputClass} max-w-[190px]`} value={leaveStatus} onChange={(event) => setLeaveStatus(event.target.value)}><option value="all">All leave statuses</option><option value="pending">Pending</option><option value="approved">Approved</option></select>
            </CardContent>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader><h2 className="font-semibold">Assigned tasks</h2><Badge variant="muted">{tasks.length}</Badge></CardHeader><CardContent>{tasks.length ? <ul className="space-y-2">{tasks.map((task) => <li key={task.id} className="flex items-center justify-between gap-2 rounded-lg border border-semantic-border p-3"><span>{task.title}</span><Badge variant={task.needs_reassignment ? 'danger' : 'muted'}>{task.needs_reassignment ? 'Needs reassignment' : task.status}</Badge></li>)}</ul> : <EmptyState icon={Inbox} title="No matching tasks" />}</CardContent></Card>
            <Card><CardHeader><h2 className="font-semibold">Project allocations</h2><Badge variant="muted">{projects.length}</Badge></CardHeader><CardContent>{projects.length ? <ul className="space-y-2">{projects.map((allocation) => <li key={allocation.id} className="flex items-center justify-between gap-2 rounded-lg border border-semantic-border p-3"><span>{projectsQuery.data?.find((project) => project.id === allocation.project_id)?.name || allocation.role}</span><Badge variant="muted">{allocation.role} · {allocation.allocation_percent}% · {allocation.hours_per_week}h/wk</Badge></li>)}</ul> : <EmptyState icon={Inbox} title="No project allocations" />}</CardContent></Card>
            <Card><CardHeader><h2 className="font-semibold">Leave balances</h2><Badge variant="muted">{person.leave_balances.length}</Badge></CardHeader><CardContent>{person.leave_balances.length ? <ul className="space-y-2">{person.leave_balances.map((balance) => <li key={balance.id} className="flex items-center justify-between gap-2 rounded-lg border border-semantic-border p-3"><span>{balance.leave_type_name || balance.leave_type_code}</span><span className="text-sm">{balance.remaining_days} / {balance.allocated_days} days remaining</span></li>)}</ul> : <EmptyState icon={CalendarDays} title="No leave balances" />}</CardContent></Card>
            <Card><CardHeader><h2 className="font-semibold">Upcoming leave</h2><Badge variant="muted">{leave.length}</Badge></CardHeader><CardContent>{leave.length ? <ul className="space-y-2">{leave.map((request) => <li key={request.id} className="flex items-center justify-between gap-2 rounded-lg border border-semantic-border p-3"><span>{request.start_date} – {request.end_date}</span><Badge variant={request.status === 'approved' ? 'success' : 'warning'}>{request.status}</Badge></li>)}</ul> : <EmptyState icon={CalendarDays} title="No upcoming leave" />}</CardContent></Card>
          </div>
        </>
      )}
    </main>
  );
}

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
  const filtered = (teamsQuery.data || []).filter((team) =>
    team.name.toLowerCase().includes(search.trim().toLowerCase()) &&
    (sizeFilter === 'all' || (sizeFilter === 'empty' ? team.member_count === 0 : sizeFilter === 'small' ? team.member_count > 0 && team.member_count <= 5 : team.member_count > 5))
  );
  const submit = (event: FormEvent) => { event.preventDefault(); if (name.trim()) createTeam.mutate(); };
  return (
    <main className="page-shell space-y-6">
      <PageHeader eyebrow="Team" title="Teams" description="Organize people and review availability across your delivery teams." statChips={[{ label: 'Teams', value: teamsQuery.data?.length || 0 }]} />
      <QueryError error={teamsQuery.error instanceof Error ? teamsQuery.error : null} retry={() => void teamsQuery.refetch()} />
      <Card><CardHeader><h2 className="font-semibold">Create team</h2></CardHeader><CardContent>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
          <input className={inputClass} aria-label="Team name" required placeholder="Team name" value={name} onChange={(event) => setName(event.target.value)} />
          <input className={inputClass} aria-label="Team description" placeholder="Description (optional)" value={description} onChange={(event) => setDescription(event.target.value)} />
          <Button type="submit" loading={createTeam.isPending}><Plus size={15} /> Create team</Button>
        </form>
        {createTeam.error && <p role="alert" className="mt-3 text-sm text-semantic-danger">{createTeam.error.message}</p>}
      </CardContent></Card>
      <Card><CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
          <label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-semantic-text-muted" /><input className={`${inputClass} pl-9`} aria-label="Search teams" placeholder="Search teams..." value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <select aria-label="Filter teams by size" className={inputClass} value={sizeFilter} onChange={(event) => setSizeFilter(event.target.value)}><option value="all">All team sizes</option><option value="empty">No members</option><option value="small">1–5 members</option><option value="large">6+ members</option></select>
        </div>
        {teamsQuery.isLoading ? <LoadingCards /> : filtered.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{filtered.map((team) => <Link key={team.id} to={`/teams/${team.id}`} className="rounded-xl border border-semantic-border bg-semantic-surface p-4 transition hover:border-semantic-accent/50 hover:shadow-ui-md"><div className="flex items-start justify-between gap-2"><div><h3 className="font-semibold">{team.name}</h3><p className="mt-1 text-sm text-semantic-text-muted">{team.description || 'No description'}</p></div><UsersRound className="text-semantic-accent" size={19} /></div><div className="mt-4 flex justify-between text-xs text-semantic-text-muted"><span>{team.member_count} members</span><span>Lead: {team.lead_name || 'Unassigned'}</span></div></Link>)}</div> : <EmptyState icon={UsersRound} title={teamsQuery.data?.length ? 'No matching teams' : 'No teams yet'} description="Create a team or adjust your search." />}
      </CardContent></Card>
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
  return (
    <main className="page-shell space-y-6">
      <Link to="/teams" className="inline-flex items-center gap-2 text-sm font-medium text-semantic-accent hover:underline"><ArrowLeft size={16} /> Back to teams</Link>
      {teamQuery.isLoading ? <LoadingCards count={2} /> : teamQuery.error ? <QueryError error={teamQuery.error instanceof Error ? teamQuery.error : null} retry={() => void teamQuery.refetch()} /> : teamQuery.data && (
        <>
          <PageHeader eyebrow="Team" title={teamQuery.data.name} description={teamQuery.data.description || `${members.length} team members`} statChips={[{ label: 'Available today', value: members.filter((member) => !member.is_on_leave_today).length, tone: 'success' }, { label: 'Available this week', value: members.filter((member) => !member.is_on_leave_this_week).length, tone: 'accent' }]} />
          <Card><CardHeader><h2 className="font-semibold">Add teammate</h2></CardHeader><CardContent>
            <form onSubmit={(event) => { event.preventDefault(); if (personId) addMember.mutate(); }} className="grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
              <select className={inputClass} aria-label="Select teammate" value={personId} onChange={(event) => setPersonId(event.target.value)}><option value="">Choose teammate</option>{availablePeople.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select>
              <select className={inputClass} aria-label="New team role" value={role} onChange={(event) => setRole(event.target.value)}><option value="member">Member</option><option value="lead">Lead</option></select>
              <Button type="submit" disabled={!personId} loading={addMember.isPending}><Plus size={15} /> Add member</Button>
            </form>
            {addMember.error && <p role="alert" className="mt-3 text-sm text-semantic-danger">{addMember.error.message}</p>}
          </CardContent></Card>
          <Card><CardHeader><h2 className="font-semibold">Members & availability</h2><Badge variant="muted">{members.length}</Badge></CardHeader><CardContent>
            {peopleQuery.error && <QueryError error={peopleQuery.error instanceof Error ? peopleQuery.error : null} retry={() => void peopleQuery.refetch()} />}
            {members.length > 0 && <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
              <label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-semantic-text-muted" /><input aria-label="Search team members" className={`${inputClass} pl-9`} placeholder="Search members..." value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} /></label>
              <select aria-label="Filter members by availability" className={inputClass} value={availability} onChange={(event) => setAvailability(event.target.value)}><option value="all">All availability</option><option value="today">Available today</option><option value="week">Available this week</option><option value="away-today">Away today</option><option value="away-week">Away this week</option></select>
            </div>}
            {members.length === 0 ? <EmptyState icon={UsersRound} title="No team members" description="Add a teammate to see team availability." /> : filteredMembers.length === 0 ? <EmptyState icon={Search} title="No matching team members" description="Change your search or availability filter." /> : <div className="space-y-2">{filteredMembers.map((member) => <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-semantic-border p-3"><div className="flex min-w-0 items-center gap-3"><Avatar name={member.person_name || '?'} /><div className="min-w-0"><p className="truncate font-medium">{member.person_name}</p><p className="truncate text-xs text-semantic-text-muted">{member.person_title || member.person_email}</p></div></div><div className="flex flex-wrap items-center gap-2"><Badge variant={member.is_on_leave_today ? 'warning' : 'success'}>{member.is_on_leave_today ? 'Away today' : 'Available today'}</Badge><Badge variant={member.is_on_leave_this_week ? 'warning' : 'success'}>{member.is_on_leave_this_week ? 'Away this week' : 'Available this week'}</Badge><select aria-label={`Role for ${member.person_name}`} className="rounded-lg border border-semantic-border bg-semantic-surface px-2 py-1.5 text-xs" value={member.role} onChange={(event) => updateRole.mutate({ person: member, nextRole: event.target.value })}><option value="member">Member</option><option value="lead">Lead</option></select><Button variant="ghost" size="sm" className="text-semantic-danger" onClick={() => removeMember.mutate(member)}><Trash2 size={14} /> Remove</Button></div></div>)}</div>}
            {(removeMember.error || updateRole.error) && <p role="alert" className="mt-3 text-sm text-semantic-danger">{(removeMember.error || updateRole.error)?.message}</p>}
          </CardContent></Card>
        </>
      )}
    </main>
  );
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
  const tabs: Array<{ id: typeof tab; label: string }> = [{ id: 'mine', label: 'My leave' }];
  if (canApprove) tabs.push({ id: 'approvals', label: 'Approvals' });
  tabs.push({ id: 'calendar', label: 'Team calendar' });

  return (
    <main className="page-shell space-y-6">
      <PageHeader eyebrow="Team" title="Leave management" description="Submit leave, review requests, and see approved absences." statChips={[{ label: 'Working days', value: days, tone: 'accent' }, { label: 'Requests pending', value: (mineQuery.data || []).filter((request) => request.status === 'pending').length, tone: 'warning' }]} />
      {pageError instanceof Error && <QueryError error={pageError} retry={() => { void profileQuery.refetch(); void peopleQuery.refetch(); void leaveTypesQuery.refetch(); void mineQuery.refetch(); }} />}
      <div role="tablist" aria-label="Leave views" className="flex flex-wrap gap-2">{tabs.map((item) => <Button key={item.id} role="tab" aria-selected={tab === item.id} variant={tab === item.id ? 'primary' : 'secondary'} size="sm" onClick={() => setTab(item.id)}>{item.label}</Button>)}</div>
      {tab === 'mine' && (
        <>
          <Card><CardHeader><div><h2 className="font-semibold">Request time off</h2><p className="mt-1 text-xs text-semantic-text-muted">Weekends are excluded from the live day count.</p></div></CardHeader><CardContent>
            <form onSubmit={(event) => { event.preventDefault(); createRequest.mutate(); }} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {canRequestForOthers && <label className="text-xs font-semibold text-semantic-text-muted">Teammate<select className={`${inputClass} mt-1.5`} required value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">Choose teammate</option>{(peopleQuery.data || []).filter((person) => person.is_active).map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></label>}
              <label className="text-xs font-semibold text-semantic-text-muted">Leave type<select className={`${inputClass} mt-1.5`} required value={leaveTypeId} onChange={(event) => setLeaveTypeId(event.target.value)}>{(leaveTypesQuery.data || []).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
              <label className="text-xs font-semibold text-semantic-text-muted">First day<input className={`${inputClass} mt-1.5`} type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
              <label className="text-xs font-semibold text-semantic-text-muted">Last day<input className={`${inputClass} mt-1.5`} type="date" min={startDate || undefined} required value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={halfDay} onChange={(event) => setHalfDay(event.target.checked)} /> Half-day request</label>
              {halfDay && <label className="text-xs font-semibold text-semantic-text-muted">Part of day<select className={`${inputClass} mt-1.5`} value={halfDayPeriod} onChange={(event) => setHalfDayPeriod(event.target.value)}><option value="morning">Morning</option><option value="afternoon">Afternoon</option></select></label>}
              <label className="text-xs font-semibold text-semantic-text-muted sm:col-span-2">Reason (optional)<input className={`${inputClass} mt-1.5`} placeholder="Add context for the approver" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
              <div className="flex items-end justify-between gap-3 sm:col-span-2 xl:col-span-4">
                <div className="text-sm text-semantic-text-muted">{days} working {days === 1 ? 'day' : 'days'} requested{selectedBalance ? ` · ${selectedBalance.remaining_days} ${selectedBalance.leave_type_name || 'leave'} days remaining` : selectedLeaveType ? ` · ${selectedLeaveType.default_days_per_year} default days per year` : ''}</div>
                <Button type="submit" disabled={!requestEmployeeId || !leaveTypeId || days <= 0} loading={createRequest.isPending}>Submit request</Button>
              </div>
            </form>
          </CardContent></Card>
          <Card><CardHeader><h2 className="font-semibold">My leave requests</h2><Badge variant="muted">{filteredMine.length}</Badge></CardHeader><CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
              <label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-semantic-text-muted" /><input aria-label="Search my leave" className={`${inputClass} pl-9`} placeholder="Search requests..." value={search} onChange={(event) => setSearch(event.target.value)} /></label>
              <select aria-label="Filter my leave by status" className={inputClass} value={requestStatus} onChange={(event) => setRequestStatus(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option></select>
            </div>
            {pageLoading ? <LoadingCards count={2} /> : filteredMine.length ? <div className="space-y-2">{filteredMine.map((request) => <LeaveRequestRow key={request.id} request={request} personName={peopleQuery.data?.find((person) => person.id === request.employee_id)?.full_name || 'You'} actions={request.status === 'pending' ? <Button size="sm" variant="ghost" className="text-semantic-danger" onClick={() => deleteRequest.mutate(request)}><Trash2 size={14} /> Cancel request</Button> : undefined} />)}</div> : <EmptyState icon={CalendarDays} title="No leave requests" description="Your requests will appear here after submission." />}
          </CardContent></Card>
        </>
      )}
      {tab === 'approvals' && canApprove && <Card><CardHeader><div><h2 className="font-semibold">Leave approvals</h2><p className="mt-1 text-xs text-semantic-text-muted">Review pending requests from your organization.</p></div><Badge variant="warning">{filteredApprovals.length} pending</Badge></CardHeader><CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
          <label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-semantic-text-muted" /><input aria-label="Search leave approvals" className={`${inputClass} pl-9`} placeholder="Search by teammate or reason..." value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <select aria-label="Filter approvals by leave type" className={inputClass} value={approvalType} onChange={(event) => setApprovalType(event.target.value)}><option value="all">All leave types</option>{(leaveTypesQuery.data || []).map((type) => <option key={type.id} value={type.code}>{type.name}</option>)}</select>
        </div>
        {pageLoading ? <LoadingCards count={2} /> : filteredApprovals.length ? <div className="space-y-2">{filteredApprovals.map((request) => <LeaveRequestRow key={request.id} request={request} personName={peopleQuery.data?.find((person) => person.id === request.employee_id)?.full_name || 'Teammate'} actions={<><Button size="sm" onClick={() => decision.mutate({ request, value: 'approved' })}><Check size={14} /> Approve</Button><Button size="sm" variant="destructive" onClick={() => decision.mutate({ request, value: 'rejected' })}>Reject</Button></>} />)}</div> : <EmptyState icon={Check} title="No pending approvals" description="There are no leave requests waiting for review." />}
      </CardContent></Card>}
      {tab === 'calendar' && <Card><CardHeader><div><h2 className="font-semibold">Approved leave calendar</h2><p className="mt-1 text-xs text-semantic-text-muted">Approved absences during the selected 31-day window.</p></div><input aria-label="Calendar start date" className={inputClass} type="date" value={calendarStart} onChange={(event) => setCalendarStart(event.target.value)} /></CardHeader><CardContent className="space-y-4">
        <label className="relative block max-w-lg"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-semantic-text-muted" /><input aria-label="Search leave calendar" className={`${inputClass} pl-9`} placeholder="Search people or leave type..." value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        {calendarQuery.isLoading ? <LoadingCards count={2} /> : filteredCalendar.length ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{filteredCalendar.map((event) => <div key={event.id} className="rounded-xl border border-semantic-border p-3"><div className="flex items-center gap-2"><Avatar name={event.employee_name} size="sm" /><span className="font-medium">{event.employee_name}</span></div><p className="mt-2 text-sm">{event.start_date} – {event.end_date}</p><p className="text-xs text-semantic-text-muted">{event.leave_type} · {event.days} days</p></div>)}</div> : <EmptyState icon={CalendarDays} title={(calendarQuery.data || []).length ? 'No matching leave' : 'No approved leave in this range'} description={(calendarQuery.data || []).length ? 'Try a different search.' : 'Choose another start date to view future or recent leave.'} />}
      </CardContent></Card>}
    </main>
  );
}

function LeaveRequestRow({ request, personName, actions }: { request: LeaveRequest; personName: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-semantic-border p-3">
      <div className="flex min-w-0 items-center gap-3"><Avatar name={personName} size="sm" /><div className="min-w-0"><p className="font-medium">{personName} · {request.start_date} – {request.end_date}</p><p className="text-xs text-semantic-text-muted">{request.leave_type} · {request.days_computed || request.working_days} working days{request.reason ? ` · ${request.reason}` : ''}</p>{request.decision_note && <p className="text-xs text-semantic-text-muted">{request.decision_note}</p>}</div></div>
      <div className="flex items-center gap-2"><Badge variant={request.status === 'approved' ? 'success' : request.status === 'rejected' ? 'danger' : 'warning'}>{request.status}</Badge>{actions}</div>
    </div>
  );
}

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
      <Link to="/invoicing" className="inline-flex items-center gap-2 text-sm font-medium text-semantic-accent hover:underline"><ArrowLeft size={16} /> Back to invoices</Link>
      {invoiceQuery.isLoading ? <LoadingCards count={2} /> : invoiceQuery.error ? <QueryError error={invoiceQuery.error instanceof Error ? invoiceQuery.error : null} retry={() => void invoiceQuery.refetch()} /> : invoice && (
        <>
          <PageHeader eyebrow="Finance" title={invoice.invoice_number} description={invoice.client_name} statChips={[{ label: 'Balance due', value: money(invoice.balance_due_cents, invoice.currency), tone: invoice.is_overdue ? 'danger' : 'accent' }]} primaryAction={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void downloadPdf()}><FileText size={15} /> Download PDF</Button>{canManage && invoice.status === 'draft' && <Button onClick={() => updateStatus.mutate('sent')}>Mark sent</Button>}{canManage && invoice.status !== 'paid' && invoice.status !== 'void' && <Button variant="destructive" onClick={() => updateStatus.mutate('void')}>Void invoice</Button>}</div>} />
          {invoice.is_overdue && <Alert variant="warning" title="Invoice overdue">Payment is past due. Balance remaining: {money(invoice.balance_due_cents, invoice.currency)}.</Alert>}
          <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
            <Card><CardHeader><h2 className="font-semibold">Invoice details</h2><Badge variant={invoice.status === 'paid' ? 'success' : invoice.status === 'void' ? 'danger' : 'warning'}>{invoice.status}</Badge></CardHeader><CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2"><p><span className="text-xs text-semantic-text-muted">Issue date</span><br />{invoice.issue_date}</p><p><span className="text-xs text-semantic-text-muted">Due date</span><br />{invoice.due_date}</p></div>
              <div className="divide-y divide-semantic-border rounded-xl border border-semantic-border">{invoice.line_items.map((line) => <div key={line.id} className="flex justify-between gap-4 p-3"><div><p className="font-medium">{line.description}</p><p className="text-xs text-semantic-text-muted">{line.quantity} × {money(line.unit_price_cents, invoice.currency)}</p></div><span>{money(line.amount_cents, invoice.currency)}</span></div>)}</div>
              <div className="space-y-2 text-sm"><MoneyRow label="Subtotal" value={money(invoice.subtotal_cents, invoice.currency)} /><MoneyRow label="Discount" value={`−${money(invoice.discount_cents, invoice.currency)}`} /><MoneyRow label="Tax" value={money(invoice.tax_cents, invoice.currency)} /><MoneyRow label="Total" value={money(invoice.total_cents, invoice.currency)} bold /><MoneyRow label="Paid" value={money(invoice.paid_cents, invoice.currency)} /><MoneyRow label="Balance due" value={money(invoice.balance_due_cents, invoice.currency)} bold /></div>
            </CardContent></Card>
            <div className="space-y-4">
              <Card><CardHeader><h2 className="font-semibold">Payments</h2><Badge variant="muted">{paymentsQuery.data?.length || 0}</Badge></CardHeader><CardContent className="space-y-3">
                {canManage && invoice.balance_due_cents > 0 && invoice.status !== 'void' && <form onSubmit={(event) => { event.preventDefault(); if (amountCents > 0) pay.mutate(); }} className="space-y-3 rounded-xl border border-semantic-border bg-semantic-surface-muted/30 p-3">
                  <label className="block text-xs font-semibold text-semantic-text-muted">Amount<input className={`${inputClass} mt-1.5`} type="number" step="0.01" min="0.01" max={(invoice.balance_due_cents / 100).toFixed(2)} required value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
                  <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-semantic-text-muted">Paid date<input className={`${inputClass} mt-1.5`} type="date" required value={paidDate} onChange={(event) => setPaidDate(event.target.value)} /></label><label className="text-xs font-semibold text-semantic-text-muted">Method<select className={`${inputClass} mt-1.5`} value={method} onChange={(event) => setMethod(event.target.value)}><option value="other">Other</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="cash">Cash</option><option value="check">Check</option></select></label></div>
                  <label className="block text-xs font-semibold text-semantic-text-muted">Reference (optional)<input className={`${inputClass} mt-1.5`} value={reference} onChange={(event) => setReference(event.target.value)} /></label>
                  <Button type="submit" loading={pay.isPending} disabled={amountCents <= 0 || amountCents > invoice.balance_due_cents}>Record payment</Button>
                </form>}
                {paymentsQuery.error && <QueryError error={paymentsQuery.error instanceof Error ? paymentsQuery.error : null} retry={() => void paymentsQuery.refetch()} />}
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px]">
                  <label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-semantic-text-muted" /><input aria-label="Search invoice payments" className={`${inputClass} pl-9`} placeholder="Search payments..." value={paymentSearch} onChange={(event) => setPaymentSearch(event.target.value)} /></label>
                  <select aria-label="Filter payments by method" className={inputClass} value={paymentMethodFilter} onChange={(event) => setPaymentMethodFilter(event.target.value)}><option value="all">All methods</option>{Array.from(new Set((paymentsQuery.data || []).map((payment) => payment.method))).map((paymentMethod) => <option key={paymentMethod} value={paymentMethod}>{paymentMethod.replace('_', ' ')}</option>)}</select>
                </div>
                {paymentsQuery.isLoading ? <Skeleton variant="text" /> : filteredPayments.length ? <ul className="space-y-2">{filteredPayments.map((payment) => <li key={payment.id} className="flex justify-between gap-2 rounded-lg border border-semantic-border p-3"><div><p className="font-medium">{money(payment.amount_cents, invoice.currency)}</p><p className="text-xs text-semantic-text-muted">{payment.paid_date} · {payment.method}{payment.reference ? ` · ${payment.reference}` : ''}</p></div></li>)}</ul> : <EmptyState icon={Inbox} title={(paymentsQuery.data || []).length ? 'No matching payments' : 'No payments recorded'} description={(paymentsQuery.data || []).length ? 'Try another search or method.' : 'Payments will appear here once recorded.'} />}
              </CardContent></Card>
              <Card><CardHeader><h2 className="font-semibold">PDF preview</h2></CardHeader><CardContent>{pdfQuery.error ? <QueryError error={pdfQuery.error instanceof Error ? pdfQuery.error : null} retry={() => void pdfQuery.refetch()} /> : pdfQuery.isLoading ? <Skeleton variant="card" /> : pdfUrl ? <iframe title="Invoice PDF preview" src={pdfUrl} className="h-[560px] w-full rounded-lg border border-semantic-border" /> : null}</CardContent></Card>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function MoneyRow({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return <div className={`flex justify-between gap-3 ${bold ? 'font-bold text-semantic-text' : 'text-semantic-text-muted'}`}><span>{label}</span><span>{value}</span></div>;
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}
