import { useCallback, useEffect, useMemo, useState } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Sparkles, CheckCircle2, Inbox, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { Alert } from '../components/ui/Alert';
import { EmptyState } from '../components/ui/EmptyState';
import { DataTable } from '../components/ui/DataTable';
import type { DataTableColumn, DataTableFilterDef } from '../components/ui/DataTable';
import AIProgress from '../components/ui/AIProgress';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Project = { id: string; name: string; status: string; budget_minutes: number; budget_amount_cents: number; currency: string; start_date?: string; end_date?: string; description?: string; lead_id?: string };
type Task = { id: string; project_id: string; title: string; status: string; estimate_minutes: number; assignee_id?: string };
type Employee = { id: string; full_name: string; email?: string; title?: string; billing_rate_cents: number; cost_rate_cents: number; is_active: boolean };
type Entry = { id: string; project_id: string; user_id?: string; employee_id?: string; entry_date: string; minutes: number; description: string; is_billable: boolean; approval_status: string; task_id?: string };
type LeaveRequest = { id: string; employee_id: string; start_date: string; end_date: string; status: string; reason?: string };
type Invoice = { id: string; invoice_number: string; client_name: string; status: string; currency: string; subtotal_cents: number; tax_cents: number; total_cents: number; paid_cents: number; issue_date: string; due_date: string; notes?: string | null; project_id?: string | null; line_items: { id: string; description: string; quantity: number; unit_price_cents: number; amount_cents: number }[] };
type Expense = { id: string; submitted_by?: string; vendor: string; category: string; description: string; amount_cents: number; currency: string; expense_date: string; status: string };
type ApprovalItem = { id: string; entity_type: string; label: string; reason?: string; amount_cents?: number; currency?: string; created_at: string; assumptions?: string[]; quote_preview?: { title?: string; currency?: string; total_cents?: number; line_items?: { description: string; quantity: number; unit_price_cents: number }[] } };
type MigrationJob = { id: string; filename: string; target: string; status: string; row_count?: number; imported?: number; errors?: string[]; sample?: Record<string, string>[] };
type Document = { id: string; title: string; category: string; content: string; updated_at: string };
type WorkflowRun = { id: string; workflow_type: string; status: string; created_at: string; input_data?: Record<string, unknown>; result_data: { items?: Record<string, unknown>[]; quote_id?: string; flags?: string[]; error?: string } };
type KnowledgeResult = { content: string; document: { id: string; title: string }; relevance_score: number };

const fieldControl = 'rounded-ui-xl px-3.5 py-2 text-sm border border-semantic-border bg-semantic-surface text-semantic-text placeholder:text-semantic-text-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-border w-full';

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || '?';
}

function formatCurrency(cents: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

const CATEGORY_OPTIONS_EXPENSE = [
  { value: 'general', label: 'General' },
  { value: 'travel', label: 'Travel' },
  { value: 'meals', label: 'Meals' },
  { value: 'software', label: 'Software' },
  { value: 'office', label: 'Office' },
  { value: 'other', label: 'Other' },
];

const CATEGORY_OPTIONS_DOC = [
  { value: 'general', label: 'General' },
  { value: 'contract', label: 'Contract' },
  { value: 'sow', label: 'Statement of work' },
  { value: 'policy', label: 'Policy' },
  { value: 'rate_card', label: 'Rate card' },
];

function expenseCategoryColor(cat: string): 'default' | 'ai' | 'success' | 'warning' | 'danger' | 'muted' {
  switch (cat) {
    case 'travel': return 'warning';
    case 'meals': return 'success';
    case 'software': return 'ai';
    case 'office': return 'default';
    case 'other': return 'muted';
    default: return 'default';
  }
}

export function ProjectsPage() {
  const [rows, setRows] = useState<Project[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [tasks, setTasks] = useState<Record<string, Task[]>>({});
  const [expanded, setExpanded] = useState('');
  const [name, setName] = useState('');
  const [budgetHours, setBudgetHours] = useState('');
  const [budget, setBudget] = useState('');
  const [editing, setEditing] = useState<Project | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortKey, setSortKey] = useState<string | null>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [newTaskTitle, setNewTaskTitle] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [projectRows, entryRows] = await Promise.all([
        apiRequest<Project[]>('/operations/projects'),
        apiRequest<Entry[]>('/operations/timesheets').catch(() => [] as Entry[]),
      ]);
      setRows(projectRows);
      setEntries(entryRows);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const usedMinutesByProject = useMemo(() => {
    const map = new Map<string, number>();
    entries.forEach((entry) => {
      map.set(entry.project_id, (map.get(entry.project_id) || 0) + entry.minutes);
    });
    return map;
  }, [entries]);

  const saveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest(editing ? `/operations/projects/${editing.id}` : '/operations/projects', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name,
          budget_minutes: Math.round(Number(budgetHours || 0) * 60),
          budget_amount_cents: Math.round(Number(budget || 0) * 100),
        }),
      });
      setName(''); setBudgetHours(''); setBudget(''); setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save project');
    }
  };

  const toggle = async (project: Project) => {
    if (expanded === project.id) { setExpanded(''); return; }
    setExpanded(project.id);
    try {
      const result = await apiRequest<Task[]>(`/operations/projects/${project.id}/tasks`);
      setTasks((old) => ({ ...old, [project.id]: result }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load tasks');
    }
  };

  const refreshTasks = async (projectId: string) => {
    const updated = await apiRequest<Task[]>(`/operations/projects/${projectId}/tasks`);
    setTasks((old) => ({ ...old, [projectId]: updated }));
  };

  const addTask = async (projectId: string, title: string) => {
    try {
      await apiRequest(`/operations/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify({ title }) });
      await refreshTasks(projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to add task');
    }
  };

  const updateTask = async (task: Task, values: Record<string, unknown>) => {
    try {
      await apiRequest(`/operations/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify(values) });
      await refreshTasks(task.project_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update task');
    }
  };

  const removeTask = async (task: Task) => {
    if (!window.confirm('Delete this task? Tasks with logged time are protected.')) return;
    try {
      await apiRequest(`/operations/tasks/${task.id}`, { method: 'DELETE' });
      await refreshTasks(task.project_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to delete task');
    }
  };

  const archiveProject = async (project: Project) => {
    if (!window.confirm(`Archive "${project.name}"? Project history will remain available.`)) return;
    try {
      await apiRequest(`/operations/projects/${project.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to archive project');
    }
  };

  const active_count = useMemo(() => rows.filter((r) => r.status === 'active').length, [rows]);

  const filteredRows = useMemo(() => {
    let list = [...rows];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q));
    }
    if (filterStatus !== 'all') {
      list = list.filter((r) => r.status === filterStatus);
    }
    if (sortKey) {
      list.sort((a, b) => {
        let cmp = 0;
        if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
        else if (sortKey === 'created_at') cmp = a.id.localeCompare(b.id);
        else if (sortKey === 'budget_used') {
          const pa = a.budget_minutes ? (a.budget_minutes / 60) : 0;
          const pb = b.budget_minutes ? (b.budget_minutes / 60) : 0;
          cmp = pa - pb;
        }
        return sortDir === 'desc' ? -cmp : cmp;
      });
    }
    return list;
  }, [rows, search, filterStatus, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  return (
    <div className="page-shell space-y-6">
      <PageHeader
        eyebrow="Delivery"
        title="Projects & Tasks"
        description="Plan work, assign tasks, and keep delivery budgets visible."
        statChips={[{ label: 'Active projects', value: active_count, tone: 'accent' }]}
      />
      {error && <Alert variant="danger" title="Error">{error}</Alert>}

      <Card>
        <CardHeader>
          <div>
            <h2 className="font-semibold text-semantic-text">{editing ? 'Update project' : 'Create project'}</h2>
            <p className="text-xs text-semantic-text-muted mt-0.5">Set the time and amount budget for delivery tracking.</p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void saveProject(e)} className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <label className="text-xs font-semibold text-semantic-text-muted">
              Project name
              <input className={`${fieldControl} mt-1.5`} required placeholder="e.g. Client portal rollout" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="text-xs font-semibold text-semantic-text-muted">
              Time budget (hours)
              <input className={`${fieldControl} mt-1.5`} type="number" min="0" placeholder="0" value={budgetHours} onChange={(e) => setBudgetHours(e.target.value)} />
            </label>
            <label className="text-xs font-semibold text-semantic-text-muted">
              Amount budget (USD)
              <input className={`${fieldControl} mt-1.5`} type="number" min="0" step="0.01" placeholder="0.00" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </label>
            <div className="flex items-end gap-2">
              <Button type="submit" size="md">{editing ? 'Save changes' : 'Create project'}</Button>
              {editing && (
                <Button type="button" variant="secondary" onClick={() => { setEditing(null); setName(''); setBudgetHours(''); setBudget(''); }}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <h2 className="font-semibold text-semantic-text">Projects list</h2>
            <p className="text-xs text-semantic-text-muted mt-0.5">Click a project name to open its tasks.</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-semantic-text-muted" />
              <input
                type="text"
                placeholder="Search projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-ui-xl px-3.5 py-2 pl-9 text-sm border border-semantic-border bg-semantic-surface text-semantic-text placeholder:text-semantic-text-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-border min-w-[200px]"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-ui-lg border border-semantic-border bg-semantic-surface text-semantic-text text-sm px-3 py-1.5 min-w-[130px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-border"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
            <select
              value={sortKey ?? ''}
              onChange={(e) => toggleSort(e.target.value || 'created_at')}
              className="rounded-ui-lg border border-semantic-border bg-semantic-surface text-semantic-text text-sm px-3 py-1.5 min-w-[160px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-border"
            >
              <option value="created_at">Created {sortDir === 'desc' ? '↓' : '↑'}</option>
              <option value="name">Name {sortDir === 'desc' ? '↓' : '↑'}</option>
              <option value="budget_used">Budget used {sortDir === 'desc' ? '↓' : '↑'}</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="space-y-3">
              <Skeleton variant="card" />
              <Skeleton variant="card" />
            </div>
          ) : filteredRows.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No projects yet"
              description="Add a project above to begin tracking delivery and tasks."
            />
          ) : (
            filteredRows.map((project) => (
              <Card key={project.id} className={cn(expanded === project.id && 'ring-2 ring-semantic-accent/20')}>
                <CardHeader>
                  <button
                    className="min-w-0 flex-1 text-left flex flex-col items-start gap-1"
                    onClick={() => void toggle(project)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-semantic-text">{project.name}</span>
                      <Badge variant={project.status === 'archived' ? 'muted' : 'success'}>
                        {project.status}
                      </Badge>
                    </div>
                    {project.description && (
                      <p className="text-sm text-semantic-text-muted truncate max-w-xl">{project.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-semantic-text-muted mt-0.5">
                      {(project.start_date || project.end_date) && (
                        <span>
                          {project.start_date || '—'} → {project.end_date || '—'}
                        </span>
                      )}
                      <span>
                        {(project.budget_minutes / 60).toFixed(1)}h · {formatCurrency(project.budget_amount_cents, project.currency)} budget
                      </span>
                    </div>
                    {project.budget_minutes > 0 && (() => {
                      const usedMinutes = usedMinutesByProject.get(project.id) || 0;
                      const pct = Math.min(100, (usedMinutes / project.budget_minutes) * 100);
                      const overBudget = usedMinutes > project.budget_minutes;
                      return (
                        <div className="w-full max-w-md mt-2">
                          <div className="flex justify-between text-[11px] text-semantic-text-muted mb-1">
                            <span>Budget usage</span>
                            <span className={cn(overBudget && 'font-semibold text-semantic-danger')}>
                              {(usedMinutes / 60).toFixed(1)} / {(project.budget_minutes / 60).toFixed(1)}h · {Math.round((usedMinutes / project.budget_minutes) * 100)}%
                            </span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-semantic-surface-muted overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all duration-300',
                                overBudget ? 'bg-semantic-danger' : pct >= 80 ? 'bg-semantic-warning' : 'bg-semantic-accent/70'
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </button>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setEditing(project);
                        setName(project.name);
                        setBudgetHours(String(project.budget_minutes / 60));
                        setBudget(String(project.budget_amount_cents / 100));
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      Edit
                    </Button>
                    {project.status !== 'archived' && (
                      <Button variant="ghost" size="sm" className="text-semantic-danger hover:text-semantic-danger hover:bg-semantic-danger-soft" onClick={() => void archiveProject(project)}>
                        Archive
                      </Button>
                    )}
                  </div>
                </CardHeader>
                {expanded === project.id && (
                  <CardContent className="border-t border-semantic-border bg-semantic-surface-muted/40">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-semantic-text-muted mb-3">Tasks</h3>
                    <div className="space-y-2 mb-4">
                      {(tasks[project.id] || []).length === 0 ? (
                        <div className="py-6">
                          <EmptyState icon={Inbox} title="No tasks yet" description="Add a task below to start planning." />
                        </div>
                      ) : (
                        (tasks[project.id] || []).map((task) => (
                          <div key={task.id} className="flex flex-wrap items-center justify-between gap-3 rounded-ui-xl border border-semantic-border bg-semantic-surface px-3 py-2.5 text-sm">
                            <button
                              className="min-w-0 flex-1 truncate text-left font-medium text-semantic-text"
                              onClick={() => {
                                const title = window.prompt('Update task title', task.title);
                                if (title?.trim() && title !== task.title) void updateTask(task, { title: title.trim() });
                              }}
                            >
                              {task.title}
                            </button>
                            <div className="flex flex-wrap items-center gap-2">
                              {task.assignee_id ? (
                                <Badge variant="muted" className="h-6 w-6 rounded-full p-0 justify-center">
                                  {initials('U')}
                                </Badge>
                              ) : (
                                <Badge variant="muted" size="sm">Unassigned</Badge>
                              )}
                              {task.estimate_minutes > 0 && (
                                <Badge variant="muted" size="sm">{(task.estimate_minutes / 60).toFixed(1)}h est</Badge>
                              )}
                              <select
                                aria-label={`Status for ${task.title}`}
                                className="rounded-ui-lg border border-semantic-border bg-semantic-surface px-2 py-1.5 text-xs"
                                value={task.status}
                                onChange={(e) => void updateTask(task, { status: e.target.value })}
                              >
                                <option value="todo">To do</option>
                                <option value="in_progress">In progress</option>
                                <option value="done">Done</option>
                              </select>
                              <Button variant="ghost" size="sm" className="text-semantic-danger hover:text-semantic-danger hover:bg-semantic-danger-soft py-1 px-2" onClick={() => void removeTask(task)}>
                                Delete
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <form
                      className="flex flex-col gap-2 sm:flex-row"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const title = newTaskTitle[project.id] || '';
                        if (title.trim()) {
                          void addTask(project.id, title.trim());
                          setNewTaskTitle((old) => ({ ...old, [project.id]: '' }));
                        }
                      }}
                    >
                      <input
                        aria-label="New task title"
                        className={fieldControl}
                        placeholder="Describe a task to add to this project"
                        value={newTaskTitle[project.id] || ''}
                        onChange={(e) => setNewTaskTitle((old) => ({ ...old, [project.id]: e.target.value }))}
                      />
                      <Button type="submit">Add task</Button>
                    </form>
                  </CardContent>
                )}
              </Card>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function TimesheetsPage() {
  const { user } = useAuth();
  const canApprove = ['owner', 'approver', 'project_manager', 'finance'].includes(user?.role || '');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [people, setPeople] = useState<Employee[]>([]);
  const [projectId, setProjectId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState('');
  const [description, setDescription] = useState('');
  const [billable, setBillable] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string | string[]>>({
    approval_status: 'all',
    project_id: 'all',
    is_billable: '',
  });
  const [sortKey, setSortKey] = useState<string | null>('entry_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, p, pe] = await Promise.all([
        apiRequest<Entry[]>('/operations/timesheets'),
        apiRequest<Project[]>('/operations/projects'),
        apiRequest<Employee[]>('/operations/people').catch(() => [] as Employee[]),
      ]);
      setEntries(e); setProjects(p); setPeople(pe);
      if (!projectId && p[0]) setProjectId(p[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load timesheets');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest(editingId ? `/operations/timesheets/${editingId}` : '/operations/timesheets', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          project_id: projectId,
          entry_date: date,
          minutes: Math.round(Number(hours) * 60),
          description,
          is_billable: billable,
        }),
      });
      setHours(''); setDescription(''); setEditingId('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save time');
    }
  };

  const decide = async (id: string, status: string) => {
    try {
      await apiRequest(`/operations/timesheets/${id}/approval`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update approval');
    }
  };

  const remove = async (entry: Entry) => {
    if (!window.confirm('Delete this pending time entry?')) return;
    try {
      await apiRequest(`/operations/timesheets/${entry.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to delete time entry');
    }
  };

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name || '—';
  const employeeName = (entry: Entry) => {
    if (entry.employee_id) {
      const p = people.find((x) => x.id === entry.employee_id);
      if (p) return p.full_name;
    }
    if (entry.user_id === user?.id) return 'You';
    return '—';
  };

  const filteredEntries = useMemo(() => {
    let list = [...entries];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.description.toLowerCase().includes(q));
    }
    const as = filterValues.approval_status as string;
    if (as && as !== 'all') list = list.filter((r) => r.approval_status === as);
    const pid = filterValues.project_id as string;
    if (pid && pid !== 'all') list = list.filter((r) => r.project_id === pid);
    const ib = filterValues.is_billable as string;
    if (ib === 'yes') list = list.filter((r) => r.is_billable);
    else if (ib === 'no') list = list.filter((r) => !r.is_billable);
    if (sortKey) {
      list.sort((a, b) => {
        let cmp = 0;
        if (sortKey === 'entry_date') cmp = a.entry_date.localeCompare(b.entry_date);
        else if (sortKey === 'minutes') cmp = a.minutes - b.minutes;
        return sortDir === 'desc' ? -cmp : cmp;
      });
    }
    return list;
  }, [entries, search, filterValues, sortKey, sortDir, user?.id]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const onFilterChange = (key: string, value: string | string[]) => {
    setFilterValues((old) => ({ ...old, [key]: value }));
  };

  const filters: DataTableFilterDef[] = [
    {
      key: 'approval_status',
      label: 'Approval',
      type: 'dropdown',
      options: [
        { value: 'all', label: 'All' },
        { value: 'pending', label: 'Pending' },
        { value: 'approved', label: 'Approved' },
        { value: 'rejected', label: 'Rejected' },
      ],
    },
    {
      key: 'project_id',
      label: 'Project',
      type: 'dropdown',
      options: [
        { value: 'all', label: 'All projects' },
        ...projects.map((p) => ({ value: p.id, label: p.name })),
      ],
    },
    {
      key: 'is_billable',
      label: 'Billable',
      type: 'chips',
      options: [
        { value: 'yes', label: 'Billable' },
        { value: 'no', label: 'Non-billable' },
      ],
    },
  ];

  const columns: DataTableColumn<Entry>[] = [
    {
      key: 'entry_date',
      header: 'Date',
      sortable: true,
      widthClass: 'w-[130px]',
      accessor: (r) => r.entry_date,
    },
    {
      key: 'project_id',
      header: 'Project',
      render: (r) => <span className="font-medium text-semantic-text">{projectName(r.project_id)}</span>,
    },
    {
      key: 'employee',
      header: 'Employee',
      render: (r) => {
        const name = employeeName(r);
        if (name === 'You') return <Badge variant="success" size="sm">You</Badge>;
        if (name === '—') return <span className="text-semantic-text-muted">—</span>;
        return (
          <span className="inline-flex items-center gap-1.5">
            <Badge variant="muted" size="sm" className="h-6 w-6 rounded-full p-0 justify-center">{initials(name)}</Badge>
            <span>{name}</span>
          </span>
        );
      },
    },
    {
      key: 'description',
      header: 'Work',
      render: (r) => <span className="font-semibold text-semantic-text">{r.description}</span>,
    },
    {
      key: 'minutes',
      header: 'Hours',
      sortable: true,
      align: 'right',
      widthClass: 'w-[90px]',
      render: (r) => (r.minutes / 60).toFixed(1),
    },
    {
      key: 'is_billable',
      header: 'Billable',
      widthClass: 'w-[100px]',
      render: (r) => r.is_billable ? <Badge variant="success" size="sm">Yes</Badge> : <Badge variant="muted" size="sm">No</Badge>,
    },
    {
      key: 'approval_status',
      header: 'Approval',
      widthClass: 'w-[120px]',
      render: (r) => {
        const v: 'success' | 'warning' | 'danger' | 'muted' =
          r.approval_status === 'approved' ? 'success'
          : r.approval_status === 'rejected' ? 'danger'
          : r.approval_status === 'pending' ? 'warning'
          : 'muted';
        return <Badge variant={v}>{r.approval_status.replaceAll('_', ' ')}</Badge>;
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      widthClass: 'w-[260px]',
      render: (entry) => (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {entry.approval_status === 'pending' && (
            <>
              {(entry.user_id === user?.id || entry.employee_id === user?.id || canApprove) && (
                <>
                  <Button variant="secondary" size="sm" onClick={() => {
                    setEditingId(entry.id);
                    setProjectId(entry.project_id);
                    setDate(entry.entry_date);
                    setHours((entry.minutes / 60).toFixed(1));
                    setDescription(entry.description);
                    setBillable(entry.is_billable);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}>Edit</Button>
                  <Button variant="ghost" size="sm" className="text-semantic-danger hover:text-semantic-danger hover:bg-semantic-danger-soft py-1 px-2" onClick={() => void remove(entry)}>Delete</Button>
                </>
              )}
              {canApprove && (
                <>
                  <Button variant="primary" size="sm" className="bg-semantic-success hover:bg-emerald-700 min-h-[32px] px-3 py-1" onClick={() => void decide(entry.id, 'approved')}>Approve</Button>
                  <Button variant="ghost" size="sm" className="text-semantic-danger hover:text-semantic-danger hover:bg-semantic-danger-soft py-1 px-2" onClick={() => void decide(entry.id, 'rejected')}>Reject</Button>
                </>
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="page-shell space-y-6">
      <PageHeader
        eyebrow="Time tracking"
        title="Timesheets"
        description="Log work against a project. Edit or remove your entries while they are pending review."
      />
      {error && <Alert variant="danger" title="Error">{error}</Alert>}

      <Card>
        <CardHeader>
          <div>
            <h2 className="font-semibold text-semantic-text">{editingId ? 'Update entry' : 'Log time'}</h2>
            <p className="text-xs text-semantic-text-muted mt-0.5">Assign hours to a project with a short description.</p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void add(e)} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-xs font-semibold text-semantic-text-muted">
              Project
              <select className={`${fieldControl} mt-1.5`} required value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Choose project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-semantic-text-muted">
              Work date
              <input className={`${fieldControl} mt-1.5`} type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="text-xs font-semibold text-semantic-text-muted">
              Hours worked
              <input className={`${fieldControl} mt-1.5`} type="number" required min="0.1" max="24" step="0.1" placeholder="e.g. 2.5" value={hours} onChange={(e) => setHours(e.target.value)} />
            </label>
            <label className="text-xs font-semibold text-semantic-text-muted">
              Work description
              <input className={`${fieldControl} mt-1.5`} required placeholder="What work did you complete?" value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex items-center gap-2 pb-2 text-sm text-semantic-text-muted">
                <input type="checkbox" className="h-4 w-4 rounded border-semantic-border accent-[var(--accent)] transition" checked={billable} onChange={(e) => setBillable(e.target.checked)} />
                Billable
              </label>
              <Button type="submit" disabled={!projects.length}>{editingId ? 'Save entry' : 'Log time'}</Button>
              {editingId && (
                <Button type="button" variant="secondary" onClick={() => { setEditingId(''); setHours(''); setDescription(''); }}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <DataTable<Entry>
        columns={columns}
        rows={filteredEntries}
        rowKey={(r) => r.id}
        searchable
        searchPlaceholder="Search description..."
        searchValue={search}
        onSearchChange={setSearch}
        filters={filters}
        filterValues={filterValues}
        onFilterChange={onFilterChange}
        sortable
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={toggleSort}
        loading={loading}
        emptyState={<EmptyState icon={Inbox} title="No time entries" description="Log your first entry using the form above." />}
      />
    </div>
  );
}

export function PeoplePage() {
  const { user } = useAuth();
  const canManagePeople = ['owner', 'finance'].includes(user?.role || '');
  const [rows, setRows] = useState<Employee[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [billing, setBilling] = useState('');
  const [cost, setCost] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<string>('all');
  const [sortKey, setSortKey] = useState<string | null>('full_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await apiRequest<Employee[]>('/operations/people'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load team');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest(editing ? `/operations/people/${editing.id}` : '/operations/people', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({
          full_name: name,
          email: email || null,
          title: title || null,
          billing_rate_cents: Math.round(Number(billing || 0) * 100),
          cost_rate_cents: Math.round(Number(cost || 0) * 100),
        }),
      });
      setName(''); setEmail(''); setTitle(''); setBilling(''); setCost(''); setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save teammate');
    }
  };

  const deactivate = async (person: Employee) => {
    if (!window.confirm(`Deactivate ${person.full_name}? Their time history will be preserved.`)) return;
    try {
      await apiRequest(`/operations/people/${person.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to deactivate teammate');
    }
  };

  const reactivate = async (person: Employee) => {
    try {
      await apiRequest(`/operations/people/${person.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: true }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to reactivate teammate');
    }
  };

  const filteredRows = useMemo(() => {
    let list = [...rows];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.full_name.toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q));
    }
    if (filterActive === 'active') list = list.filter((r) => r.is_active);
    else if (filterActive === 'inactive') list = list.filter((r) => !r.is_active);
    if (sortKey === 'full_name') {
      list.sort((a, b) => {
        const cmp = a.full_name.localeCompare(b.full_name);
        return sortDir === 'desc' ? -cmp : cmp;
      });
    }
    return list;
  }, [rows, search, filterActive, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const filters: DataTableFilterDef[] = [
    {
      key: 'is_active',
      label: 'Status',
      type: 'dropdown',
      options: [
        { value: 'all', label: 'All' },
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' },
      ],
    },
  ];

  const onFilterChange = (key: string, value: string | string[]) => {
    if (key === 'is_active') setFilterActive(value as string);
  };

  const columns: DataTableColumn<Employee>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-bold text-semantic-text flex items-center gap-2">
            {r.full_name}
            {!r.is_active && <Badge variant="danger" size="sm">Inactive</Badge>}
          </span>
          {r.title && <span className="text-xs text-semantic-text-muted mt-0.5">{r.title}</span>}
        </div>
      ),
    },
    { key: 'title', header: 'Title', accessor: (r) => r.title || '—' },
    { key: 'email', header: 'Email', accessor: (r) => r.email || '—' },
    {
      key: 'billing_rate_cents',
      header: 'Bill rate',
      align: 'right',
      accessor: (r) => formatCurrency(r.billing_rate_cents),
    },
    {
      key: 'cost_rate_cents',
      header: 'Cost rate',
      align: 'right',
      accessor: (r) => formatCurrency(r.cost_rate_cents),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      widthClass: 'w-[200px]',
      render: (r) => canManagePeople ? (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => {
            setEditing(r);
            setName(r.full_name);
            setEmail(r.email || '');
            setTitle(r.title || '');
            setBilling((r.billing_rate_cents / 100).toFixed(2));
            setCost((r.cost_rate_cents / 100).toFixed(2));
          }}>Edit</Button>
          {r.is_active ? (
            <Button variant="ghost" size="sm" className="text-semantic-danger hover:text-semantic-danger hover:bg-semantic-danger-soft py-1 px-2" onClick={() => void deactivate(r)}>Deactivate</Button>
          ) : (
            <Button variant="primary" size="sm" className="bg-semantic-success hover:bg-emerald-700 min-h-[32px] px-3 py-1" onClick={() => void reactivate(r)}>Reactivate</Button>
          )}
        </div>
      ) : null,
    },
  ];

  return (
    <div className="page-shell space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="People & Team"
        description="Maintain employee records, billing rates and leave requests."
      />
      {error && <Alert variant="danger" title="Error">{error}</Alert>}

      {canManagePeople && (
        <Card>
          <CardHeader>
            <div>
              <h2 className="font-semibold text-semantic-text">{editing ? 'Update teammate' : 'Add teammate'}</h2>
              <p className="text-xs text-semantic-text-muted mt-0.5">Set billing and cost rates used for profitability reporting.</p>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void add(e)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <label className="text-xs font-semibold text-semantic-text-muted">
                Full name
                <input className={`${fieldControl} mt-1.5`} required placeholder="Team member name" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="text-xs font-semibold text-semantic-text-muted">
                Email
                <input className={`${fieldControl} mt-1.5`} type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label className="text-xs font-semibold text-semantic-text-muted">
                Job title
                <input className={`${fieldControl} mt-1.5`} placeholder="e.g. Designer" value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="text-xs font-semibold text-semantic-text-muted">
                Billing rate / hour
                <input className={`${fieldControl} mt-1.5`} type="number" min="0" step="0.01" placeholder="0.00" value={billing} onChange={(e) => setBilling(e.target.value)} />
              </label>
              <label className="text-xs font-semibold text-semantic-text-muted">
                Cost rate / hour
                <input className={`${fieldControl} mt-1.5`} type="number" min="0" step="0.01" placeholder="0.00" value={cost} onChange={(e) => setCost(e.target.value)} />
              </label>
              <div className="flex items-end gap-2">
                <Button type="submit">{editing ? 'Save changes' : 'Add teammate'}</Button>
                {editing && (
                  <Button type="button" variant="secondary" onClick={() => { setEditing(null); setName(''); setEmail(''); setTitle(''); setBilling(''); setCost(''); }}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <DataTable<Employee>
        columns={columns}
        rows={filteredRows}
        rowKey={(r) => r.id}
        searchable
        searchPlaceholder="Search by name or email..."
        searchValue={search}
        onSearchChange={setSearch}
        filters={filters}
        filterValues={{ is_active: filterActive }}
        onFilterChange={onFilterChange}
        sortable
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={toggleSort}
        loading={loading}
        emptyState={<EmptyState icon={Inbox} title="No team members" description="Add teammates once they join the workspace." />}
      />

      <LeaveWidget employees={rows.filter((row) => row.is_active)} />
    </div>
  );
}

function LeaveWidget({ employees }: { employees: Employee[] }) {
  const [items, setItems] = useState<LeaveRequest[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<LeaveRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await apiRequest<LeaveRequest[]>('/operations/leave-requests'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load leave requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = editing
        ? { start_date: start, end_date: end, reason: reason || null }
        : { employee_id: employeeId, start_date: start, end_date: end, reason: reason || null };
      await apiRequest(editing ? `/operations/leave-requests/${editing.id}` : '/operations/leave-requests', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      setStart(''); setEnd(''); setReason(''); setEditing(null); setError('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save leave request');
    }
  };

  const remove = async (item: LeaveRequest) => {
    if (!window.confirm('Delete this pending leave request?')) return;
    try {
      await apiRequest(`/operations/leave-requests/${item.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to delete leave request');
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((i) => {
      const n = employees.find((e) => e.id === i.employee_id)?.full_name || '';
      return n.toLowerCase().includes(q) || (i.reason || '').toLowerCase().includes(q);
    });
  }, [items, search, employees]);

  return (
    <Card>
      <CardHeader>
        <div>
          <h2 className="font-semibold text-semantic-text">Leave requests</h2>
          <p className="text-xs text-semantic-text-muted mt-0.5">Record planned time away against a team member.</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-semantic-text-muted" />
          <input
            type="text"
            placeholder="Search requests..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-ui-xl px-3.5 py-2 pl-9 text-sm border border-semantic-border bg-semantic-surface text-semantic-text placeholder:text-semantic-text-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-border min-w-[200px]"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <Alert variant="danger">{error}</Alert>}
        <form onSubmit={(e) => void add(e)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {!editing && (
            <label className="text-xs font-semibold text-semantic-text-muted">
              Team member
              <select className={`${fieldControl} mt-1.5`} required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">Choose a person</option>
                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}
              </select>
            </label>
          )}
          <label className="text-xs font-semibold text-semantic-text-muted">
            First day
            <input className={`${fieldControl} mt-1.5`} type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-semantic-text-muted">
            Last day
            <input className={`${fieldControl} mt-1.5`} type="date" required value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-semantic-text-muted">
            Reason (optional)
            <input className={`${fieldControl} mt-1.5`} placeholder="Add a short note" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="flex items-end gap-2">
            <Button type="submit" disabled={!editing && !employees.length}>{editing ? 'Save changes' : 'Submit request'}</Button>
            {editing && (
              <Button type="button" variant="secondary" onClick={() => { setEditing(null); setStart(''); setEnd(''); setReason(''); }}>
                Cancel
              </Button>
            )}
          </div>
        </form>

        {loading ? (
          <div className="space-y-2">
            <Skeleton variant="text" />
            <Skeleton variant="text" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Inbox} title="No leave requests" description="No planned time away has been recorded yet." />
        ) : (
          <ul className="divide-y divide-semantic-border rounded-ui-xl border border-semantic-border bg-semantic-surface">
            {filtered.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-medium text-semantic-text flex items-center gap-2 flex-wrap">
                    <Badge variant="muted" size="sm" className="h-6 w-6 rounded-full p-0 justify-center">
                      {initials(employees.find((e) => e.id === item.employee_id)?.full_name || '?')}
                    </Badge>
                    {employees.find((employee) => employee.id === item.employee_id)?.full_name || 'Team member'}
                    <span className="text-semantic-text-muted font-normal">· {item.start_date} to {item.end_date}</span>
                  </span>
                  {item.reason && <span className="text-xs text-semantic-text-muted ml-8">{item.reason}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={
                    item.status === 'approved' ? 'success' :
                    item.status === 'rejected' ? 'danger' :
                    item.status === 'pending' ? 'warning' : 'muted'
                  }>
                    {item.status}
                  </Badge>
                  {item.status === 'pending' && (
                    <>
                      <Button variant="secondary" size="sm" onClick={() => {
                        setEditing(item);
                        setEmployeeId(item.employee_id);
                        setStart(item.start_date);
                        setEnd(item.end_date);
                        setReason(item.reason || '');
                      }}>Edit</Button>
                      <Button variant="ghost" size="sm" className="text-semantic-danger hover:text-semantic-danger hover:bg-semantic-danger-soft py-1 px-2" onClick={() => void remove(item)}>Delete</Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function InvoicingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [client, setClient] = useState('');
  const [projectId, setProjectId] = useState<string>('');
  const [lineItems, setLineItems] = useState([{ description: '', quantity: '1', price: '' }]);
  const [tax, setTax] = useState('0');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string | string[]>>({
    status: 'all',
    overdue: '',
  });
  const [sortKey, setSortKey] = useState<string | null>('due_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inv, pr] = await Promise.all([
        apiRequest<Invoice[]>('/billing/invoices'),
        apiRequest<Project[]>('/operations/projects').catch(() => []),
      ]);
      setInvoices(inv);
      setProjects(pr);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load invoices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = (inv: Invoice) => {
    const balance = inv.total_cents - inv.paid_cents;
    return balance > 0 && inv.due_date < today && (inv.status === 'draft' || inv.status === 'sent');
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: Record<string, unknown> = {
        client_name: client,
        currency: editing?.currency || 'USD',
        issue_date: issueDate,
        due_date: dueDate,
        tax_bps: Math.round(Number(tax) * 100),
        line_items: lineItems.map((line) => ({
          description: line.description,
          quantity: Number(line.quantity),
          unit_price_cents: Math.round(Number(line.price) * 100),
        })),
      };
      if (projectId) payload.project_id = projectId;
      await apiRequest(editing ? `/billing/invoices/${editing.id}` : '/billing/invoices', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      setClient(''); setProjectId(''); setLineItems([{ description: '', quantity: '1', price: '' }]); setTax('0'); setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save invoice');
    }
  };

  const pay = async (invoice: Invoice) => {
    const remaining = invoice.total_cents - invoice.paid_cents;
    if (remaining <= 0) return;
    try {
      await apiRequest(`/billing/invoices/${invoice.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({ amount_cents: remaining, paid_date: new Date().toISOString().slice(0, 10), method: 'other' }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to record payment');
    }
  };

  const send = async (invoice: Invoice) => {
    try {
      await apiRequest(`/billing/invoices/${invoice.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'sent' }) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to mark invoice sent');
    }
  };

  const voidInv = async (invoice: Invoice) => {
    try {
      await apiRequest(`/billing/invoices/${invoice.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'void' }) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to void invoice');
    }
  };

  const edit = (invoice: Invoice) => {
    setEditing(invoice);
    setClient(invoice.client_name);
    setProjectId(invoice.project_id || '');
    setIssueDate(invoice.issue_date);
    setDueDate(invoice.due_date);
    setTax(invoice.subtotal_cents ? ((invoice.tax_cents * 100) / invoice.subtotal_cents).toFixed(2) : '0');
    setLineItems(invoice.line_items.map((line) => ({
      description: line.description,
      quantity: String(line.quantity),
      price: (line.unit_price_cents / 100).toFixed(2),
    })));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (invoice: Invoice) => {
    if (!window.confirm('Delete this unpaid draft invoice?')) return;
    try {
      await apiRequest(`/billing/invoices/${invoice.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to delete invoice');
    }
  };

  const projectName = (id?: string | null) => projects.find((p) => p.id === id)?.name || '—';

  const filteredInvoices = useMemo(() => {
    let list = [...invoices];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.invoice_number.toLowerCase().includes(q) || r.client_name.toLowerCase().includes(q));
    }
    const st = filterValues.status as string;
    if (st && st !== 'all') list = list.filter((r) => r.status === st);
    const ov = filterValues.overdue as string;
    if (ov === 'overdue') list = list.filter(isOverdue);
    if (sortKey) {
      list.sort((a, b) => {
        let cmp = 0;
        if (sortKey === 'due_date') cmp = a.due_date.localeCompare(b.due_date);
        else if (sortKey === 'total') cmp = a.total_cents - b.total_cents;
        return sortDir === 'desc' ? -cmp : cmp;
      });
    }
    return list;
  }, [invoices, search, filterValues, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const onFilterChange = (key: string, value: string | string[]) => {
    setFilterValues((old) => ({ ...old, [key]: value }));
  };

  const filters: DataTableFilterDef[] = [
    {
      key: 'status',
      label: 'Status',
      type: 'dropdown',
      options: [
        { value: 'all', label: 'All' },
        { value: 'draft', label: 'Draft' },
        { value: 'sent', label: 'Sent' },
        { value: 'paid', label: 'Paid' },
        { value: 'void', label: 'Void' },
      ],
    },
    {
      key: 'overdue',
      label: 'Flags',
      type: 'chips',
      options: [{ value: 'overdue', label: 'Overdue' }],
    },
  ];

  const columns: DataTableColumn<Invoice>[] = [
    {
      key: 'invoice_number',
      header: 'Invoice',
      render: (r) => (
        <div className="min-w-0">
          <span className="font-bold text-semantic-text">{r.invoice_number}</span>
          {r.notes && (
            <div className="mt-0.5 max-w-[220px] truncate text-xs font-normal text-semantic-text-muted" title={r.notes}>
              {r.notes}
            </div>
          )}
        </div>
      ),
    },
    { key: 'client_name', header: 'Client', accessor: (r) => r.client_name },
    {
      key: 'project_id',
      header: 'Project',
      render: (r) => projectName(r.project_id),
    },
    { key: 'issue_date', header: 'Issue Date', accessor: (r) => r.issue_date },
    {
      key: 'due_date',
      header: 'Due Date',
      sortable: true,
      render: (r) => (
        <span className="inline-flex items-center gap-2 flex-wrap">
          <span>{r.due_date}</span>
          {isOverdue(r) && <Badge variant="danger">OVERDUE</Badge>}
        </span>
      ),
    },
    {
      key: 'total_cents',
      header: 'Total',
      align: 'right',
      sortable: false,
      accessor: (r) => formatCurrency(r.total_cents, r.currency),
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      accessor: (r) => formatCurrency(r.total_cents - r.paid_cents, r.currency),
    },
    {
      key: 'status',
      header: 'Status',
      widthClass: 'w-[100px]',
      render: (r) => {
        const v: 'success' | 'warning' | 'danger' | 'muted' =
          r.status === 'paid' ? 'success' :
          r.status === 'sent' ? 'warning' :
          r.status === 'void' ? 'danger' :
          'muted';
        return <Badge variant={v}>{r.status}</Badge>;
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      widthClass: 'w-[320px]',
      render: (inv) => (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {inv.status === 'draft' && (
            <>
              <Button variant="secondary" size="sm" onClick={() => edit(inv)}>Edit</Button>
              <Button variant="primary" size="sm" className="bg-sky-600 hover:bg-sky-700 min-h-[32px] px-3 py-1" onClick={() => void send(inv)}>Mark sent</Button>
              <Button variant="ghost" size="sm" className="text-semantic-danger hover:text-semantic-danger hover:bg-semantic-danger-soft py-1 px-2" onClick={() => void remove(inv)}>Delete</Button>
            </>
          )}
          {inv.status !== 'paid' && inv.status !== 'void' && (
            <Button variant="primary" size="sm" className="bg-semantic-success hover:bg-emerald-700 min-h-[32px] px-3 py-1" onClick={() => void pay(inv)}>Record payment</Button>
          )}
          {inv.status === 'sent' && (
            <Button variant="ghost" size="sm" className="text-semantic-danger hover:text-semantic-danger hover:bg-semantic-danger-soft py-1 px-2" onClick={() => void voidInv(inv)}>Void</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="page-shell space-y-6">
      <PageHeader
        eyebrow="Finance"
        title="Invoices & Payments"
        description="Create invoices, record incoming payments and track outstanding balances."
      />
      {error && <Alert variant="danger" title="Error">{error}</Alert>}

      <Card>
        <CardHeader>
          <div>
            <h2 className="font-semibold text-semantic-text">{editing ? 'Update invoice' : 'Create draft invoice'}</h2>
            <p className="text-xs text-semantic-text-muted mt-0.5">Add line items and set a due date. Drafts can be edited or deleted.</p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void create(e)} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-semibold text-semantic-text-muted">
              Client name
              <input className={`${fieldControl} mt-1.5`} required placeholder="Customer or company" value={client} onChange={(e) => setClient(e.target.value)} />
            </label>
            <label className="text-xs font-semibold text-semantic-text-muted">
              Project (optional)
              <select className={`${fieldControl} mt-1.5`} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">No project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-semantic-text-muted">
              Issue date
              <input className={`${fieldControl} mt-1.5`} type="date" required value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-semantic-text-muted">
                Due date
                <input className={`${fieldControl} mt-1.5`} type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </label>
              <label className="text-xs font-semibold text-semantic-text-muted">
                Tax rate (%)
                <input className={`${fieldControl} mt-1.5`} type="number" min="0" max="100" step="0.01" placeholder="0" value={tax} onChange={(e) => setTax(e.target.value)} />
              </label>
            </div>

            <div className="space-y-3 sm:col-span-2 lg:col-span-4">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-semantic-text-muted">Invoice line items</h3>
              {lineItems.map((line, index) => (
                <div key={index} className="grid items-end gap-3 rounded-ui-xl border border-semantic-border bg-semantic-surface-muted/50 p-3 sm:grid-cols-[2fr_120px_1fr_auto]">
                  <label className="text-xs font-semibold text-semantic-text-muted">
                    Description
                    <input className={`${fieldControl} mt-1.5`} required placeholder="Service or product" value={line.description} onChange={(e) => setLineItems((old) => old.map((item, i) => i === index ? { ...item, description: e.target.value } : item))} />
                  </label>
                  <label className="text-xs font-semibold text-semantic-text-muted">
                    Quantity
                    <input className={`${fieldControl} mt-1.5`} required type="number" min="1" value={line.quantity} onChange={(e) => setLineItems((old) => old.map((item, i) => i === index ? { ...item, quantity: e.target.value } : item))} />
                  </label>
                  <label className="text-xs font-semibold text-semantic-text-muted">
                    Unit price (USD)
                    <input className={`${fieldControl} mt-1.5`} required type="number" min="0" step="0.01" placeholder="0.00" value={line.price} onChange={(e) => setLineItems((old) => old.map((item, i) => i === index ? { ...item, price: e.target.value } : item))} />
                  </label>
                  {lineItems.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" className="text-semantic-danger hover:text-semantic-danger hover:bg-semantic-danger-soft py-1 px-2" onClick={() => setLineItems((old) => old.filter((_, i) => i !== index))}>
                      Remove
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => setLineItems((old) => [...old, { description: '', quantity: '1', price: '' }])}>
                + Add line item
              </Button>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-semantic-border pt-4 sm:col-span-2 lg:col-span-4">
              {editing && (
                <Button type="button" variant="secondary" onClick={() => {
                  setEditing(null); setClient(''); setProjectId(''); setLineItems([{ description: '', quantity: '1', price: '' }]); setTax('0');
                }}>Cancel</Button>
              )}
              <Button type="submit">{editing ? 'Save invoice changes' : 'Create draft invoice'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <DataTable<Invoice>
        columns={columns}
        rows={filteredInvoices}
        rowKey={(r) => r.id}
        searchable
        searchPlaceholder="Search invoice # or client..."
        searchValue={search}
        onSearchChange={setSearch}
        filters={filters}
        filterValues={filterValues}
        onFilterChange={onFilterChange}
        sortable
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={toggleSort}
        loading={loading}
        emptyState={<EmptyState icon={Inbox} title="No invoices yet" description="Create your first draft invoice above." />}
      />
    </div>
  );
}

export function ExpensesPage() {
  const { user } = useAuth();
  const canReview = ['owner', 'finance', 'approver'].includes(user?.role || '');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [vendor, setVendor] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string | string[]>>({
    status: 'all',
    category: 'all',
  });
  const [sortKey, setSortKey] = useState<string | null>('expense_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setExpenses(await apiRequest<Expense[]>('/billing/expenses'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load expenses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest(editing ? `/billing/expenses/${editing.id}` : '/billing/expenses', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({
          vendor,
          description,
          category,
          amount_cents: Math.round(Number(amount) * 100),
          expense_date: date,
          currency: 'USD',
        }),
      });
      setVendor(''); setDescription(''); setCategory('general'); setAmount(''); setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit expense');
    }
  };

  const review = async (expense: Expense, status: string) => {
    try {
      await apiRequest(`/billing/expenses/${expense.id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to review expense');
    }
  };

  const remove = async (expense: Expense) => {
    if (!window.confirm('Delete this pending expense?')) return;
    try {
      await apiRequest(`/billing/expenses/${expense.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to delete expense');
    }
  };

  const filtered = useMemo(() => {
    let list = [...expenses];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.vendor.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
    }
    const st = filterValues.status as string;
    if (st && st !== 'all') list = list.filter((r) => r.status === st);
    const cat = filterValues.category as string;
    if (cat && cat !== 'all') list = list.filter((r) => r.category === cat);
    if (sortKey) {
      list.sort((a, b) => {
        let cmp = 0;
        if (sortKey === 'expense_date') cmp = a.expense_date.localeCompare(b.expense_date);
        else if (sortKey === 'amount') cmp = a.amount_cents - b.amount_cents;
        return sortDir === 'desc' ? -cmp : cmp;
      });
    }
    return list;
  }, [expenses, search, filterValues, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const onFilterChange = (key: string, value: string | string[]) => {
    setFilterValues((old) => ({ ...old, [key]: value }));
  };

  const filters: DataTableFilterDef[] = [
    {
      key: 'status',
      label: 'Status',
      type: 'dropdown',
      options: [
        { value: 'all', label: 'All' },
        { value: 'pending', label: 'Pending' },
        { value: 'approved', label: 'Approved' },
        { value: 'rejected', label: 'Rejected' },
      ],
    },
    {
      key: 'category',
      label: 'Category',
      type: 'dropdown',
      options: [
        { value: 'all', label: 'All categories' },
        ...CATEGORY_OPTIONS_EXPENSE,
      ],
    },
  ];

  const columns: DataTableColumn<Expense>[] = [
    {
      key: 'expense_date',
      header: 'Date',
      sortable: true,
      widthClass: 'w-[130px]',
      accessor: (r) => r.expense_date,
    },
    { key: 'vendor', header: 'Vendor', accessor: (r) => <span className="font-semibold text-semantic-text">{r.vendor}</span> },
    {
      key: 'category',
      header: 'Category',
      widthClass: 'w-[120px]',
      render: (r) => {
        const label = CATEGORY_OPTIONS_EXPENSE.find((o) => o.value === r.category)?.label || r.category;
        return <Badge variant={expenseCategoryColor(r.category)}>{label}</Badge>;
      },
    },
    { key: 'description', header: 'Description', accessor: (r) => r.description },
    {
      key: 'amount_cents',
      header: 'Amount',
      align: 'right',
      sortable: true,
      render: (r) => <span className="font-bold text-semantic-text">{formatCurrency(r.amount_cents, r.currency)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      widthClass: 'w-[110px]',
      render: (r) => {
        const v: 'success' | 'warning' | 'danger' | 'muted' =
          r.status === 'approved' ? 'success' :
          r.status === 'rejected' ? 'danger' :
          r.status === 'pending' ? 'warning' : 'muted';
        return <Badge variant={v}>{r.status}</Badge>;
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      widthClass: 'w-[260px]',
      render: (exp) => (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {exp.status === 'pending' && exp.submitted_by === user?.id && (
            <>
              <Button variant="secondary" size="sm" onClick={() => {
                setEditing(exp);
                setVendor(exp.vendor);
                setDescription(exp.description);
                setCategory(exp.category || 'general');
                setAmount((exp.amount_cents / 100).toFixed(2));
                setDate(exp.expense_date);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}>Edit</Button>
              <Button variant="ghost" size="sm" className="text-semantic-danger hover:text-semantic-danger hover:bg-semantic-danger-soft py-1 px-2" onClick={() => void remove(exp)}>Delete</Button>
            </>
          )}
          {canReview && exp.status === 'pending' && (
            <>
              <Button variant="primary" size="sm" className="bg-semantic-success hover:bg-emerald-700 min-h-[32px] px-3 py-1" onClick={() => void review(exp, 'approved')}>Approve</Button>
              <Button variant="ghost" size="sm" className="text-semantic-danger hover:text-semantic-danger hover:bg-semantic-danger-soft py-1 px-2" onClick={() => void review(exp, 'rejected')}>Reject</Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="page-shell space-y-6">
      <PageHeader
        eyebrow="Finance"
        title="Expenses & Vendor Bills"
        description="Submit an expense with its vendor, amount and date."
      />
      {error && <Alert variant="danger" title="Error">{error}</Alert>}

      <Card>
        <CardHeader>
          <div>
            <h2 className="font-semibold text-semantic-text">{editing ? 'Update expense' : 'Submit expense'}</h2>
            <p className="text-xs text-semantic-text-muted mt-0.5">Pending entries can be edited or removed; approved records remain in the ledger.</p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void create(e)} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-xs font-semibold text-semantic-text-muted">
              Vendor
              <input className={`${fieldControl} mt-1.5`} required placeholder="Business or supplier" value={vendor} onChange={(e) => setVendor(e.target.value)} />
            </label>
            <label className="text-xs font-semibold text-semantic-text-muted">
              Expense description
              <input className={`${fieldControl} mt-1.5`} required placeholder="What was purchased?" value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <label className="text-xs font-semibold text-semantic-text-muted">
              Category
              <select className={`${fieldControl} mt-1.5`} value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORY_OPTIONS_EXPENSE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-semantic-text-muted">
              Amount (USD)
              <input className={`${fieldControl} mt-1.5`} required type="number" min="0.01" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <label className="text-xs font-semibold text-semantic-text-muted w-full sm:flex-1">
                Expense date
                <input className={`${fieldControl} mt-1.5`} required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <div className="flex gap-2 pb-0.5">
                <Button type="submit">{editing ? 'Save changes' : 'Submit expense'}</Button>
                {editing && (
                  <Button type="button" variant="secondary" onClick={() => { setEditing(null); setVendor(''); setDescription(''); setCategory('general'); setAmount(''); }}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <DataTable<Expense>
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.id}
        searchable
        searchPlaceholder="Search vendor or description..."
        searchValue={search}
        onSearchChange={setSearch}
        filters={filters}
        filterValues={filterValues}
        onFilterChange={onFilterChange}
        sortable
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={toggleSort}
        loading={loading}
        emptyState={<EmptyState icon={Inbox} title="No expenses submitted" description="Use the form above to submit an expense." />}
      />
    </div>
  );
}

export function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('general');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState('');
  const [semanticQuery, setSemanticQuery] = useState('');
  const [knowledge, setKnowledge] = useState<KnowledgeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('all');
  const [sortKey, setSortKey] = useState<string | null>('updated_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const load = useCallback(async (q = query) => {
    setLoading(true);
    try {
      setDocuments(await apiRequest<Document[]>(`/documents${q ? `?q=${encodeURIComponent(q)}` : ''}`));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load documents');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { void load(''); }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest(editingId ? `/documents/${editingId}` : '/documents', {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify({ title, category, content }),
      });
      setTitle(''); setContent(''); setEditingId('');
      await load('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save document');
    }
  };

  const edit = (doc: Document) => {
    setEditingId(doc.id);
    setTitle(doc.title);
    setCategory(doc.category);
    setContent(doc.content);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this document and its search index?')) return;
    try {
      await apiRequest(`/documents/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to delete document');
    }
  };

  const semanticSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!semanticQuery.trim()) return;
    setSearching(true); setError('');
    try {
      setKnowledge(await apiRequest<KnowledgeResult[]>(`/knowledge/search?q=${encodeURIComponent(semanticQuery)}&k=5`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI knowledge search is unavailable');
    } finally {
      setSearching(false);
    }
  };

  const filteredDocs = useMemo(() => {
    let list = [...documents];
    if (filterCategory !== 'all') {
      list = list.filter((r) => r.category === filterCategory);
    }
    if (sortKey === 'updated_at') {
      list.sort((a, b) => {
        const cmp = a.updated_at.localeCompare(b.updated_at);
        return sortDir === 'desc' ? -cmp : cmp;
      });
    }
    return list;
  }, [documents, filterCategory, sortKey, sortDir]);

  const categoryLabel = (cat: string) => CATEGORY_OPTIONS_DOC.find((o) => o.value === cat)?.label || cat;
  const categoryBadgeVariant = (cat: string): 'success' | 'warning' | 'danger' | 'muted' | 'ai' => {
    switch (cat) {
      case 'contract': return 'warning';
      case 'sow': return 'ai';
      case 'policy': return 'success';
      case 'rate_card': return 'danger';
      default: return 'muted';
    }
  };

  return (
    <div className="page-shell space-y-6">
      <PageHeader
        eyebrow="Knowledge base"
        title="Documents & SOWs"
        description="Store team knowledge, contracts and statements of work indexed for AI search."
      />
      {error && <Alert variant="danger" title="Error">{error}</Alert>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <h2 className="font-semibold text-semantic-text">{editingId ? 'Update document' : 'Add a document'}</h2>
              <p className="text-xs text-semantic-text-muted mt-0.5">Paste text content below; saved content becomes searchable by your workspace.</p>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void save(e)} className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-semibold text-semantic-text-muted">
                  Document title
                  <input className={`${fieldControl} mt-1.5`} required placeholder="e.g. Standard services agreement" value={title} onChange={(e) => setTitle(e.target.value)} />
                </label>
                <label className="text-xs font-semibold text-semantic-text-muted">
                  Document category
                  <select className={`${fieldControl} mt-1.5`} value={category} onChange={(e) => setCategory(e.target.value)}>
                    {CATEGORY_OPTIONS_DOC.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              </div>
              <label className="text-xs font-semibold text-semantic-text-muted">
                Document text
                <textarea className={`${fieldControl} mt-1.5 min-h-[180px]`} required rows={6} placeholder="Paste the document text you want your team to search" value={content} onChange={(e) => setContent(e.target.value)} />
              </label>
              <div className="flex justify-end gap-2">
                {editingId && (
                  <Button type="button" variant="secondary" onClick={() => { setEditingId(''); setTitle(''); setCategory('general'); setContent(''); }}>
                    Cancel
                  </Button>
                )}
                <Button type="submit">{editingId ? 'Save changes' : 'Save document'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-semantic-accent" />
              <div>
                <h2 className="font-semibold text-semantic-text">Ask your documents</h2>
                <p className="text-xs text-semantic-text-muted mt-0.5">Search by meaning to find relevant passages.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={(e) => void semanticSearch(e)} className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-semantic-text-muted" />
                <input
                  className={`${fieldControl} pl-9`}
                  placeholder="e.g. What are our standard payment terms?"
                  value={semanticQuery}
                  onChange={(e) => setSemanticQuery(e.target.value)}
                />
              </div>
              <Button type="submit" loading={searching} disabled={!semanticQuery.trim()}>
                {searching ? 'Searching…' : 'Search knowledge'}
              </Button>
            </form>
            {knowledge.length > 0 && (
              <div className="space-y-3">
                {knowledge.map((item, index) => (
                  <article key={`${item.document.id}-${index}`} className="rounded-ui-xl border border-semantic-accent/20 bg-semantic-accent-soft/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-semantic-text">{item.document.title}</h3>
                      <Badge variant="ai">{Math.round(item.relevance_score * 100)}% match</Badge>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-semantic-text-muted">{item.content}</p>
                  </article>
                ))}
              </div>
            )}
            {!searching && semanticQuery && knowledge.length === 0 && (
              <Alert variant="info" title="No close matches found">Try another phrase.</Alert>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <h2 className="font-semibold text-semantic-text">Saved documents</h2>
            <p className="text-xs text-semantic-text-muted mt-0.5">Browse and maintain the workspace knowledge base.</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-semantic-text-muted" />
              <input
                type="text"
                placeholder="Search by title..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void load(); } }}
                className="rounded-ui-xl px-3.5 py-2 pl-9 text-sm border border-semantic-border bg-semantic-surface text-semantic-text placeholder:text-semantic-text-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-border min-w-[200px]"
              />
            </div>
            <Button variant="secondary" size="sm" onClick={() => void load()}>Search</Button>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="rounded-ui-lg border border-semantic-border bg-semantic-surface text-semantic-text text-sm px-3 py-1.5 min-w-[150px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-border"
            >
              <option value="all">All categories</option>
              {CATEGORY_OPTIONS_DOC.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select
              value={sortKey ?? ''}
              onChange={(e) => {
                const k = e.target.value || 'updated_at';
                if (sortKey === k) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
                else { setSortKey(k); setSortDir('desc'); }
              }}
              className="rounded-ui-lg border border-semantic-border bg-semantic-surface text-semantic-text text-sm px-3 py-1.5 min-w-[140px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-border"
            >
              <option value="updated_at">Updated {sortDir === 'desc' ? '↓' : '↑'}</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="space-y-3">
              <Skeleton variant="card" />
              <Skeleton variant="card" />
            </div>
          ) : filteredDocs.length === 0 ? (
            <EmptyState icon={Inbox} title="No documents yet" description="Add one above to build your searchable knowledge base." />
          ) : (
            filteredDocs.map((doc) => (
              <Card key={doc.id}>
                <CardHeader>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-semantic-text">{doc.title}</h3>
                      <Badge variant={categoryBadgeVariant(doc.category)} size="sm">{categoryLabel(doc.category)}</Badge>
                    </div>
                    <p className="text-xs text-semantic-text-muted mt-0.5">Updated {doc.updated_at}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => edit(doc)}>Edit</Button>
                    <Button variant="ghost" size="sm" className="text-semantic-danger hover:text-semantic-danger hover:bg-semantic-danger-soft py-1 px-2" onClick={() => void remove(doc.id)}>Delete</Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="whitespace-pre-wrap text-sm leading-6 text-semantic-text-muted line-clamp-2">{doc.content}</p>
                </CardContent>
              </Card>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function MigrationPage() {
  const [jobs, setJobs] = useState<MigrationJob[]>([]);
  const [target, setTarget] = useState('leads');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<MigrationJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filterTarget, setFilterTarget] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setJobs(await apiRequest<MigrationJob[]>('/migration/jobs'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load imports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const runDry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setError('');
    const form = new FormData();
    form.append('target', target);
    form.append('file', file);
    try {
      setPreview(await apiRequest<MigrationJob>('/migration/dry-run', { method: 'POST', body: form }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to preview import');
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const done = await apiRequest<MigrationJob>(`/migration/jobs/${preview.id}/apply`, { method: 'POST' });
      setPreview({ ...preview, ...done });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to apply import');
    } finally {
      setBusy(false);
    }
  };

  const filteredJobs = useMemo(() => {
    let list = [...jobs];
    if (filterTarget !== 'all') list = list.filter((j) => j.target === filterTarget);
    if (filterStatus !== 'all') list = list.filter((j) => j.status === filterStatus);
    list.sort((a, b) => (b.id || '').localeCompare(a.id || ''));
    return list;
  }, [jobs, filterTarget, filterStatus]);

  return (
    <div className="page-shell space-y-6">
      <PageHeader
        eyebrow="Data tools"
        title="Odoo Migration Center"
        description="Import company, contact or lead CSV exports with a validation preview."
      />
      {error && <Alert variant="danger" title="Error">{error}</Alert>}

      <Card>
        <CardHeader>
          <div>
            <h2 className="font-semibold text-semantic-text">CSV preview & import</h2>
            <p className="text-xs text-semantic-text-muted mt-0.5">Select a record type, upload the CSV, then preview before creating records.</p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void runDry(e)} className="grid gap-4 sm:grid-cols-[1fr_2fr_auto]">
            <label className="text-xs font-semibold text-semantic-text-muted">
              Records to import
              <select className={`${fieldControl} mt-1.5`} value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="leads">Leads</option>
                <option value="companies">Companies</option>
                <option value="contacts">Contacts</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-semantic-text-muted">
              CSV file
              <input className={`${fieldControl} mt-1.5 file:mr-3 file:py-1.5 file:px-3 file:rounded-ui-lg file:border-0 file:text-xs file:font-semibold file:bg-semantic-accent file:text-white hover:file:bg-semantic-accent-hover`} required type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            <Button type="submit" className="self-end" loading={busy} disabled={!file}>
              {busy ? 'Checking…' : 'Preview CSV'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <div>
              <h2 className="font-semibold text-semantic-text">Preview: {preview.filename}</h2>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <Badge variant="muted" size="sm">{preview.target}</Badge>
                <Badge variant="success" size="sm">{preview.imported ?? 0}/{preview.row_count ?? 0} rows</Badge>
                {(preview.errors?.length ?? 0) > 0 && (
                  <Badge variant="danger" size="sm">{preview.errors?.length ?? 0} errors</Badge>
                )}
                <span className="text-xs text-semantic-text-muted capitalize">Status: {preview.status}</span>
              </div>
            </div>
            {preview.status === 'dry_run' && (
              <Button
                loading={busy}
                disabled={busy || Boolean(preview.errors?.length)}
                onClick={() => void apply()}
              >
                Apply import
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {preview.errors?.map((item) => (
              <Alert key={item} variant="danger">{item}</Alert>
            ))}
            {preview.status === 'completed' && (
              <Alert variant="success">Imported {preview.imported} records.</Alert>
            )}
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-semantic-text-muted mb-2">Sample rows</h3>
              <pre className="max-h-72 overflow-auto rounded-ui-xl bg-slate-950 p-4 text-xs text-slate-100">
                {JSON.stringify(preview.sample || [], null, 2)}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div>
            <h2 className="font-semibold text-semantic-text">Import history</h2>
            <p className="text-xs text-semantic-text-muted mt-0.5">Track every migration run and its validation result.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={filterTarget}
              onChange={(e) => setFilterTarget(e.target.value)}
              className="rounded-ui-lg border border-semantic-border bg-semantic-surface text-semantic-text text-sm px-3 py-1.5 min-w-[130px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-border"
            >
              <option value="all">All targets</option>
              <option value="leads">Leads</option>
              <option value="companies">Companies</option>
              <option value="contacts">Contacts</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-ui-lg border border-semantic-border bg-semantic-surface text-semantic-text text-sm px-3 py-1.5 min-w-[140px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-border"
            >
              <option value="all">All statuses</option>
              <option value="dry_run">Dry run</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div className="space-y-2">
              <Skeleton variant="text" />
              <Skeleton variant="text" />
            </div>
          ) : filteredJobs.length === 0 ? (
            <EmptyState icon={Inbox} title="No migration runs yet" description="Run a CSV preview above to create your first import job." />
          ) : (
            filteredJobs.map((job) => (
              <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-ui-xl border border-semantic-border bg-semantic-surface px-4 py-3">
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="font-medium text-semantic-text">{job.filename}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="muted" size="sm">{job.target}</Badge>
                    <Badge variant="success" size="sm">{job.imported ?? 0}/{job.row_count ?? 0} rows</Badge>
                    {(job.errors?.length ?? 0) > 0 && (
                      <Badge variant="danger" size="sm">{job.errors?.length} errors</Badge>
                    )}
                    <span className="text-xs text-semantic-text-muted">{job.id.slice(0, 8)}…</span>
                  </div>
                </div>
                <Badge variant={
                  job.status === 'completed' ? 'success' :
                  job.status === 'dry_run' ? 'warning' :
                  job.status === 'failed' ? 'danger' : 'muted'
                }>
                  {job.status}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function WorkflowsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canRunAgent = ['owner', 'sales', 'project_manager'].includes(user?.role || '');
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [leads, setLeads] = useState<{ id: string; title: string; status: string }[]>([]);
  const [leadId, setLeadId] = useState('');
  const [runningCheck, setRunningCheck] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const [aiStatus, setAiStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [aiErrorMsg, setAiErrorMsg] = useState('');
  const [aiResult, setAiResult] = useState<{ status: string; message: string; quoteId?: string } | null>(null);

  const [filterValues, setFilterValues] = useState<Record<string, string | string[]>>({
    workflow_type: 'all',
    status: 'all',
  });
  const [sortKey, setSortKey] = useState<string | null>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [runRows, leadRows] = await Promise.all([
        apiRequest<WorkflowRun[]>('/workflows'),
        apiRequest<{ id: string; title: string; status: string }[]>('/crm/leads'),
      ]);
      setRuns(runRows);
      setLeads(leadRows);
      const firstOpenLead = leadRows.find((lead) => lead.status === 'open')?.id || '';
      setLeadId((current) => current || firstOpenLead);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load workflows');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const run = async (type: string) => {
    if (runningCheck) return;
    setRunningCheck(type); setError(''); setMessage('');
    try {
      await apiRequest(`/workflows/${type}`, { method: 'POST' });
      setMessage('Workflow finished and was added to run history.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to run workflow');
    } finally {
      setRunningCheck('');
    }
  };

  const runQuoteAgent = async () => {
    if (!leadId) return;
    setAiStatus('running');
    setAiErrorMsg('');
    setAiResult(null);
    setError('');
    setMessage('');
    try {
      const result = await apiRequest<WorkflowRun>('/workflows/quote-agent/run', {
        method: 'POST',
        body: JSON.stringify({ lead_id: leadId }),
      });
      if (result.status === 'paused_for_approval') {
        setAiStatus('success');
        setAiResult({ status: 'paused_for_approval', message: 'The agent flagged the quote and sent it to the Approvals Inbox. No quote was saved before review.' });
      } else if (result.status === 'completed') {
        setAiStatus('success');
        setAiResult({ status: 'completed', message: 'The agent completed its checks and saved a draft quote for human review.', quoteId: result.result_data.quote_id });
      } else {
        throw new Error(result.result_data.error || `Workflow status: ${result.status}`);
      }
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unable to run quote agent';
      setAiStatus('error');
      setAiErrorMsg(msg);
      setError(msg);
    }
  };

  const retryQuote = () => {
    void runQuoteAgent();
  };

  const resetQuote = () => {
    setAiStatus('idle');
    setAiResult(null);
    setAiErrorMsg('');
  };

  const filteredRuns = useMemo(() => {
    let list = [...runs];
    const wt = filterValues.workflow_type as string;
    if (wt && wt !== 'all') list = list.filter((r) => r.workflow_type === wt);
    const st = filterValues.status as string;
    if (st && st !== 'all') list = list.filter((r) => r.status === st);
    if (sortKey === 'created_at') {
      list.sort((a, b) => {
        const cmp = a.created_at.localeCompare(b.created_at);
        return sortDir === 'desc' ? -cmp : cmp;
      });
    }
    return list;
  }, [runs, filterValues, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const onFilterChange = (key: string, value: string | string[]) => {
    setFilterValues((old) => ({ ...old, [key]: value }));
  };

  const workflowTypeOptions = [
    { value: 'all', label: 'All types' },
    { value: 'quote_agent', label: 'Quote agent' },
    { value: 'lead_qualification', label: 'Lead qualification' },
    { value: 'project_health', label: 'Project health' },
    { value: 'invoice_aging', label: 'Invoice aging' },
  ];

  const filters: DataTableFilterDef[] = [
    {
      key: 'workflow_type',
      label: 'Workflow',
      type: 'dropdown',
      options: workflowTypeOptions,
    },
    {
      key: 'status',
      label: 'Status',
      type: 'dropdown',
      options: [
        { value: 'all', label: 'All' },
        { value: 'completed', label: 'Completed' },
        { value: 'paused_for_approval', label: 'Paused' },
        { value: 'running', label: 'Running' },
        { value: 'failed', label: 'Failed' },
      ],
    },
  ];

  const aiSteps = [
    'Reading lead…',
    'Searching documents…',
    'Drafting line items…',
    'Validating totals…',
    'Checking flags…',
  ];

  const runColumns: DataTableColumn<WorkflowRun>[] = [
    {
      key: 'workflow_type',
      header: 'Workflow',
      sortable: true,
      render: (r) => <span className="font-semibold capitalize text-semantic-text">{r.workflow_type.replaceAll('_', ' ')}</span>,
    },
    {
      key: 'created_at',
      header: 'Started',
      sortable: true,
      accessor: (r) => new Date(r.created_at).toLocaleString(),
    },
    {
      key: 'status',
      header: 'Status',
      widthClass: 'w-[140px]',
      render: (r) => {
        const v: 'success' | 'warning' | 'danger' | 'muted' =
          r.status === 'completed' ? 'success' :
          r.status === 'paused_for_approval' ? 'warning' :
          r.status === 'failed' ? 'danger' : 'muted';
        return <Badge variant={v}>{r.status.replaceAll('_', ' ')}</Badge>;
      },
    },
  ];

  return (
    <div className="page-shell space-y-6">
      <PageHeader
        eyebrow="Automation"
        title="Agent Workflows"
        description="Run operational checks or prepare a quote with the AI agent."
      />
      {error && aiStatus !== 'error' && <Alert variant="danger" title="Error">{error}</Alert>}
      {message && aiStatus !== 'success' && <Alert variant="success">{message}</Alert>}

      {canRunAgent && (
        <Card className="border-semantic-accent/30 bg-gradient-to-br from-semantic-accent-soft via-semantic-surface to-white">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-4 flex-1">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-semantic-accent-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-semantic-accent border border-semantic-accent/20">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI quote agent
                </div>
                <h2 className="text-lg font-bold text-semantic-text">Prepare a quote for review</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-semantic-text-muted">
                  The agent reviews the lead, finds relevant workspace knowledge, drafts a priced quote, and checks its totals.
                </p>
              </div>
              <Link to="/quotes" className="text-sm font-semibold text-semantic-accent underline decoration-indigo-200 underline-offset-4 shrink-0">
                Open quote editor
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiStatus === 'idle' && (
              <div className="flex flex-col gap-3 sm:flex-row">
                <label className="flex-1 text-xs font-semibold text-semantic-text-muted">
                  Lead to quote
                  <select
                    className={`${fieldControl} mt-1.5`}
                    value={leadId}
                    onChange={(e) => setLeadId(e.target.value)}
                  >
                    <option value="">Choose an open lead</option>
                    {leads.filter((lead) => lead.status === 'open').map((lead) => (
                      <option key={lead.id} value={lead.id}>{lead.title}</option>
                    ))}
                  </select>
                </label>
                <Button className="self-end" disabled={!leadId} onClick={() => void runQuoteAgent()}>
                  <Sparkles className="h-4 w-4" />
                  Run quote agent
                </Button>
              </div>
            )}

            {aiStatus !== 'idle' && (
              <div className="space-y-4">
                <AIProgress
                  steps={aiSteps}
                  status={aiStatus as 'running' | 'success' | 'error'}
                  errorMessage={aiErrorMsg || undefined}
                  onRetry={aiStatus === 'error' ? retryQuote : undefined}
                  resultPreview={aiResult ? (
                    <div className="rounded-ui-xl border border-semantic-success/30 bg-semantic-success-soft/40 p-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <h4 className="font-semibold text-semantic-text">
                            {aiResult.status === 'completed' ? 'Draft quote saved' : 'Sent to approvals inbox'}
                          </h4>
                          <p className="text-sm text-semantic-text-muted mt-1">{aiResult.message}</p>
                          {aiResult.quoteId && (
                            <p className="text-xs text-semantic-text-muted mt-2">
                              Quote ID: <code className="px-1.5 py-0.5 rounded bg-white">{aiResult.quoteId}</code>
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {aiResult.status === 'completed' && (
                            <Button variant="secondary" size="sm" onClick={() => navigate('/quotes')}>
                              Open quotes
                            </Button>
                          )}
                          <Button variant="secondary" size="sm" onClick={resetQuote}>
                            Run another
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : undefined}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div>
            <h2 className="font-semibold text-semantic-text">Operational checks</h2>
            <p className="text-xs text-semantic-text-muted mt-0.5">Deterministic checks use current workspace records; they do not make AI calls.</p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['lead_qualification', 'Qualify open leads', 'Score and group leads by completeness.'],
              ['project_health', 'Review project health', 'Check logged time against project budgets.'],
              ['invoice_aging', 'Check invoice aging', 'Find outstanding invoices past due.'],
            ].map(([type, label, description]) => {
              const isRunning = runningCheck === type;
              const isDisabled = Boolean(runningCheck);
              return (
                <Card
                  key={type}
                  className={cn(
                    'transition',
                    isDisabled
                      ? 'opacity-80'
                      : 'hover:-translate-y-0.5 hover:border-semantic-accent/40 hover:shadow-lg'
                  )}
                >
                  <CardContent
                    className={cn('space-y-3', isDisabled ? 'cursor-not-allowed' : 'cursor-pointer')}
                    onClick={() => { if (!isDisabled) void run(type); }}
                  >
                    <h3 className="font-semibold text-semantic-text">{label}</h3>
                    <p className="text-xs leading-5 text-semantic-text-muted min-h-[40px]">{description}</p>
                    {isRunning ? (
                      <div className="flex items-center gap-1.5 text-xs font-bold text-semantic-accent">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Running…
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs font-bold text-semantic-accent">
                        Run check
                        <span>→</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <h2 className="font-semibold text-semantic-text">Run history</h2>
            <p className="text-xs text-semantic-text-muted mt-0.5">Inspect the outcome of recent automations. Expand to see the result payload and agent steps.</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-0">
          <DataTable<WorkflowRun>
            columns={runColumns}
            rows={filteredRuns}
            rowKey={(r) => r.id}
            filters={filters}
            filterValues={filterValues}
            onFilterChange={onFilterChange}
            sortable
            sortKey={sortKey}
            sortDir={sortDir}
            onSortChange={toggleSort}
            loading={loading}
            emptyState={<EmptyState icon={Inbox} title="No workflow runs yet" description="Start a quote agent or run an operational check above." />}
            wrapperClassName="border-0 shadow-none rounded-none"
            headerClassName="!px-0 !pt-0"
          />
          {!loading && filteredRuns.length > 0 && (
            <div className="mt-4 space-y-3">
              {filteredRuns.map((item) => (
                <details key={item.id} className="rounded-ui-xl border border-semantic-border bg-semantic-surface p-4 group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="font-semibold capitalize text-semantic-text">{item.workflow_type.replaceAll('_', ' ')}</span>
                      <span className="ml-2 text-xs text-semantic-text-muted">{new Date(item.created_at).toLocaleString()}</span>
                    </div>
                    <Badge variant={
                      item.status === 'completed' ? 'success' :
                      item.status === 'paused_for_approval' ? 'warning' :
                      item.status === 'failed' ? 'danger' : 'muted'
                    }>
                      {item.status.replaceAll('_', ' ')}
                    </Badge>
                  </summary>
                  <div className="mt-4 border-t border-semantic-border pt-4 space-y-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-semantic-text-muted mb-2">Result</p>
                      <pre className="max-h-80 overflow-auto rounded-ui-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                        {JSON.stringify(item.result_data || {}, null, 2)}
                      </pre>
                    </div>
                    {item.workflow_type === 'quote_agent' && (
                      <AgentRunDetails runId={item.id} />
                    )}
                  </div>
                </details>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AgentRunDetails({ runId }: { runId: string }) {
  const [steps, setSteps] = useState<{ id: string; node_name: string; model: string; latency_ms: number; status: string; result_summary: string }[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void apiRequest<{ steps: typeof steps }>(`/workflows/runs/${runId}`)
      .then((data) => { if (active) setSteps(data.steps); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : 'Could not load run steps'); });
    return () => { active = false; };
  }, [runId]);

  if (error) return <p className="mt-3 text-xs text-semantic-danger">{error}</p>;

  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-semantic-text-muted mb-2">Agent steps</h3>
      <ol className="divide-y divide-semantic-border rounded-ui-xl border border-semantic-border bg-semantic-surface">
        {steps.map((step) => (
          <li key={step.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
            <div className="min-w-0 flex-1">
              <span className="font-semibold text-semantic-text">{step.node_name.replaceAll('_', ' ')}</span>
              <p className="mt-0.5 text-xs text-semantic-text-muted truncate">{step.result_summary}</p>
            </div>
            <Badge variant={
              step.status === 'completed' ? 'success' :
              step.status === 'error' ? 'danger' : 'muted'
            } size="sm">
              {step.status}
            </Badge>
            <span className="text-[11px] text-semantic-text-muted whitespace-nowrap">
              {step.model} · {Math.round(step.latency_ms)} ms
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ApprovalsPage() {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filterEntity, setFilterEntity] = useState<string>('all');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [pending, setPending] = useState<{ key: string; decision: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await apiRequest<ApprovalItem[]>('/workflows/approvals'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load approvals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const decide = async (item: ApprovalItem, decision: string) => {
    const key = `${item.entity_type}-${item.id}`;
    setPending({ key, decision });
    setError('');
    try {
      await apiRequest(`/workflows/approvals/${item.entity_type}/${item.id}`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update approval');
    } finally {
      setPending(null);
    }
  };

  const filteredItems = useMemo(() => {
    let list = [...items];
    if (filterEntity !== 'all') list = list.filter((r) => r.entity_type === filterEntity);
    list.sort((a, b) => {
      const cmp = a.created_at.localeCompare(b.created_at);
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return list;
  }, [items, filterEntity, sortDir]);

  const entityBadgeVariant = (t: string): 'success' | 'warning' | 'danger' | 'muted' | 'ai' => {
    switch (t) {
      case 'timesheet': return 'warning';
      case 'expense': return 'danger';
      case 'quote_agent': return 'ai';
      default: return 'muted';
    }
  };

  const entityLabel = (t: string): string => {
    switch (t) {
      case 'timesheet': return 'time entry';
      case 'expense': return 'expense';
      case 'quote_agent': return 'quote draft';
      default: return t.replaceAll('_', ' ');
    }
  };

  return (
    <div className="page-shell space-y-6">
      <PageHeader
        eyebrow="Human review"
        title="Approvals Inbox"
        description="Review time, expenses and quote drafts before they move forward."
        statChips={[{ label: 'Pending approvals', value: items.length, tone: 'warning' }]}
      />
      {error && <Alert variant="danger" title="Error">{error}</Alert>}

      <Card>
        <CardHeader>
          <div>
            <h2 className="font-semibold text-semantic-text">Review queue</h2>
            <p className="text-xs text-semantic-text-muted mt-0.5">Oldest pending items appear first.</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { value: 'all', label: 'All' },
                { value: 'timesheet', label: 'Time entries' },
                { value: 'expense', label: 'Expenses' },
                { value: 'quote_agent', label: 'Quote drafts' },
              ].map((opt) => {
                const active = filterEntity === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFilterEntity(opt.value)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-180ms border',
                      active
                        ? 'bg-semantic-accent text-white border-semantic-accent hover:bg-semantic-accent-hover'
                        : 'border-semantic-border bg-semantic-surface text-semantic-text hover:bg-semantic-surface-muted'
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <select
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')}
              className="rounded-ui-lg border border-semantic-border bg-semantic-surface text-semantic-text text-sm px-3 py-1.5 min-w-[140px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-border"
            >
              <option value="asc">Oldest first</option>
              <option value="desc">Newest first</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="space-y-3">
              <Skeleton variant="card" />
              <Skeleton variant="card" />
            </div>
          ) : filteredItems.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="You're all caught up"
              description="No records waiting for approval."
            />
          ) : (
            filteredItems.map((item) => {
              const itemKey = `${item.entity_type}-${item.id}`;
              const isPending = pending?.key === itemKey;
              return (
              <Card key={itemKey}>
                <CardContent className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2.5">
                    <Badge variant={entityBadgeVariant(item.entity_type)} size="sm">
                      {entityLabel(item.entity_type)}
                    </Badge>
                    <p className="font-semibold text-semantic-text text-base">{item.label}</p>
                    {item.reason && (
                      <Alert variant="warning" title="Review flags">
                        {item.reason}
                      </Alert>
                    )}
                    {item.quote_preview && (
                      <div className="max-w-2xl rounded-ui-xl border border-semantic-border bg-semantic-surface-muted/40 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="font-semibold text-semantic-text">{item.quote_preview.title || 'Quote draft'}</h3>
                          <span className="font-bold text-semantic-text">
                            {formatCurrency(item.quote_preview.total_cents || 0, item.quote_preview.currency || 'USD')}
                          </span>
                        </div>
                        <ul className="mt-3 divide-y divide-semantic-border">
                          {item.quote_preview.line_items?.map((line, index) => (
                            <li key={`${line.description}-${index}`} className="flex justify-between gap-3 py-2 text-sm">
                              <span>{line.quantity} × {line.description}</span>
                              <span className="whitespace-nowrap text-semantic-text-muted">
                                {formatCurrency(line.quantity * line.unit_price_cents, item.quote_preview?.currency || 'USD')}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {item.assumptions && item.assumptions.length > 0 && (
                          <div className="mt-3 border-t border-semantic-border pt-3">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-semantic-warning">Draft assumptions</p>
                            <ul className="mt-1 list-disc pl-4 text-xs leading-5 text-semantic-text-muted space-y-0.5">
                              {item.assumptions.map((assumption, index) => (
                                <li key={index}>{assumption}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                    {item.amount_cents != null && (
                      <p className="text-sm font-medium text-semantic-text">
                        {formatCurrency(item.amount_cents, item.currency || 'USD')}
                      </p>
                    )}
                    <p className="text-xs text-semantic-text-muted">Submitted {new Date(item.created_at).toLocaleString()}</p>
                    {isPending && item.entity_type === 'quote_agent' && (
                      <div className="flex items-center gap-2 rounded-ui-xl border border-semantic-accent/30 bg-semantic-accent-soft/50 px-3.5 py-2.5 text-xs font-medium text-semantic-text">
                        <Sparkles className="h-3.5 w-3.5 animate-pulse text-semantic-accent" />
                        Applying your decision — the quote agent is finishing its run. This can take up to a minute.
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="primary"
                      className="bg-semantic-success hover:bg-emerald-700"
                      loading={isPending && pending?.decision === 'approved'}
                      disabled={isPending}
                      onClick={() => void decide(item, 'approved')}
                    >
                      {isPending && pending?.decision === 'approved' ? 'Approving…' : 'Approve'}
                    </Button>
                    <Button
                      variant="outline"
                      className="border-semantic-danger/30 text-semantic-danger hover:bg-semantic-danger-soft"
                      loading={isPending && pending?.decision === 'rejected'}
                      disabled={isPending}
                      onClick={() => void decide(item, 'rejected')}
                    >
                      {isPending && pending?.decision === 'rejected' ? 'Rejecting…' : 'Reject'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
