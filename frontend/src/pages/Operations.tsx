import { useCallback, useEffect, useId, useMemo, useRef, useState, type ComponentType, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/toast';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Sparkles, CheckCircle2, Inbox, Loader2, ChevronDown, Target, Activity, Receipt, ArrowUp, ArrowDown, ArrowUpDown, Pencil, Trash2, CalendarDays, Check, CircleCheck, CircleX, Clock3, ReceiptText, RefreshCw, X, AlarmClock, WalletCards, FileText, Plus, CircleDollarSign, Send, Ban } from 'lucide-react';
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
type ApprovalItem = { id: string; entity_type: string; label: string; reason?: string; amount_cents?: number; currency?: string; created_at: string; assumptions?: string[]; quote_preview?: { title?: string; currency?: string; total_cents?: number; discount_bps?: number; tax_bps?: number; line_items?: { description: string; quantity: number; unit_price_cents: number }[] } };
type MigrationJob = { id: string; filename: string; target: string; status: string; row_count?: number; imported?: number; errors?: string[]; sample?: Record<string, string>[] };
type Document = { id: string; title: string; category: string; content: string; updated_at: string };
type WorkflowRun = { id: string; workflow_type: string; status: string; created_at: string; input_data?: Record<string, unknown>; result_data: { items?: Record<string, unknown>[]; quote_id?: string; flags?: string[]; error?: string } };
type KnowledgeAskResult = {
  answer: string;
  citations: { chunk_id: string; document_id: string; document_title: string; relevance_score: number }[];
  degraded?: boolean;
};

const fieldControl = 'rounded-ui-xl px-3.5 py-2 text-sm border border-semantic-border bg-semantic-surface text-semantic-text placeholder:text-semantic-text-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-border w-full';

function ProjectDropdown({ projects, value, onChange }: { projects: Project[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const selected = projects.find((project) => project.id === value);
  const filteredProjects = projects.filter((project) => project.name.toLowerCase().includes(search.trim().toLowerCase()));

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(filteredProjects.length - 1, 0)));
  }, [filteredProjects.length]);

  const choose = (project: Project) => {
    onChange(project.id);
    setOpen(false);
    setSearch('');
  };
  const moveActive = (direction: number) => {
    if (!filteredProjects.length) return;
    setActiveIndex((index) => (index + direction + filteredProjects.length) % filteredProjects.length);
  };

  return (
    <div ref={rootRef} className="relative mt-1.5">
      <button
        type="button"
        role="combobox"
        aria-label="Project"
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-required="true"
        aria-activedescendant={open && filteredProjects.length ? `${listboxId}-option-${activeIndex}` : undefined}
        disabled={!projects.length}
        onClick={() => {
          setOpen((previous) => !previous);
          setSearch('');
          setActiveIndex(Math.max(0, projects.findIndex((project) => project.id === value)));
          window.setTimeout(() => searchRef.current?.focus(), 0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!open) setOpen(true);
            else moveActive(event.key === 'ArrowDown' ? 1 : -1);
            window.setTimeout(() => searchRef.current?.focus(), 0);
          } else if (event.key === 'Escape' && open) {
            event.preventDefault();
            setOpen(false);
            setSearch('');
          }
        }}
        className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border bg-semantic-surface px-3.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-accent/40 disabled:cursor-not-allowed disabled:opacity-50 ${open ? 'border-semantic-accent ring-2 ring-semantic-accent/10' : 'border-semantic-border hover:border-semantic-accent/50'}`}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-semantic-accent/10 text-semantic-accent" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M8 8h8M8 12h5M8 16h3" /></svg>
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-semantic-text">{selected?.name ?? (projects.length ? 'Choose a project' : 'No projects available')}</span>
            <span className="block text-xs font-normal text-semantic-text-muted">{selected ? 'Project selected' : 'Click to select a project'}</span>
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-semantic-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-semantic-border bg-semantic-surface shadow-xl">
          <div className="border-b border-semantic-border p-3">
            <input
              ref={searchRef}
              autoFocus
              type="search"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setActiveIndex(0); }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  moveActive(event.key === 'ArrowDown' ? 1 : -1);
                } else if (event.key === 'Enter' && filteredProjects[activeIndex]) {
                  event.preventDefault();
                  choose(filteredProjects[activeIndex]);
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  setOpen(false);
                  setSearch('');
                }
              }}
              placeholder="Search projects..."
              aria-label="Search projects"
              aria-controls={listboxId}
              aria-activedescendant={filteredProjects.length ? `${listboxId}-option-${activeIndex}` : undefined}
              className="min-h-10 w-full rounded-lg border border-semantic-border bg-semantic-surface px-3 text-sm text-semantic-text outline-none transition focus:border-semantic-accent focus:ring-2 focus:ring-semantic-accent/10"
            />
          </div>
          <div id={listboxId} role="listbox" aria-label="Available projects" className="max-h-60 overflow-y-auto p-1.5">
            {filteredProjects.map((project, index) => {
              const isSelected = project.id === value;
              return (
                <button
                  key={project.id}
                  id={`${listboxId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(project)}
                  className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${index === activeIndex ? 'bg-semantic-accent/5' : ''} ${isSelected ? 'text-semantic-accent' : 'text-semantic-text hover:bg-semantic-accent/5'}`}
                >
                  <span className="truncate">{project.name}</span>
                  {isSelected && <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
                </button>
              );
            })}
            {filteredProjects.length === 0 && <p className="px-3 py-6 text-center text-sm text-semantic-text-muted">No matching projects found.</p>}
          </div>
          <div className="border-t border-semantic-border px-3 py-2 text-xs text-semantic-text-muted">
            {filteredProjects.length} {filteredProjects.length === 1 ? 'project' : 'projects'} available
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared UI helpers (animation + scrolling)                           */
/* ------------------------------------------------------------------ */

/**
 * Smoothly scrolls an element into view. `scrollIntoView` works with whichever ancestor actually scrolls.
 * The app layout scrolls <main>, not the window, so `window.scrollTo(...)` had no effect.
 */
function scrollToElement(el: HTMLElement | null) {
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Ref + helper for a page's editor form: scrolls it into view and pulses it briefly. */
function useEditorScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState(false);
  const focusEditor = useCallback(() => {
    scrollToElement(ref.current);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 1200);
  }, []);
  const className = cn('ops-rise ops-cq scroll-mt-4 rounded-ui-2xl', flash && 'ops-flash');
  return { ref, focusEditor, className };
}

const opsStyles = `
@keyframes ops-rise {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: none; }
}
@keyframes ops-pop {
  from { opacity: 0; transform: translateY(6px) scale(0.985); }
  to { opacity: 1; transform: none; }
}
@keyframes ops-flash {
  0% { box-shadow: 0 0 0 0 rgba(14, 165, 233, 0.55); }
  100% { box-shadow: 0 0 0 14px rgba(14, 165, 233, 0); }
}
.ops-rise { animation: ops-rise 520ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.ops-pop { animation: ops-pop 300ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.ops-flash { animation: ops-flash 1100ms ease-out 1; }
@media (prefers-reduced-motion: reduce) {
  .ops-rise, .ops-pop, .ops-flash { animation: none; }
}

/* ---- Container-responsive forms: columns follow the content width, not the browser width ---- */
.ops-cq { container-type: inline-size; }
.ops-form { display: grid; gap: 1rem; grid-template-columns: minmax(0, 1fr); }
@container (min-width: 520px) {
  .ops-form { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@container (min-width: 860px) {
  .ops-form--proj { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) auto; }
  .ops-form--ts { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .ops-span3-wide { grid-column: span 3; }
}
@container (max-width: 859.98px) {
  .ops-fullbelow, .ops-span3-wide { grid-column: 1 / -1; }
}
/* ---- Responsive grid list (reacts to the CONTENT width, not the browser width) ---- */
.rgrid-cq { container-type: inline-size; }
.rgrid-head { display: none; }
.rgrid-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem 1rem;
  padding: 1rem;
  align-items: start;
}
.rgrid-cell { min-width: 0; }
.rgrid-cell[data-role='primary'] { grid-column: 1 / -1; order: -1; }
.rgrid-cell[data-role='actions'] { grid-column: 1 / -1; }
.rgrid-cell[data-label]::before {
  content: attr(data-label);
  display: block;
  margin-bottom: 0.2rem;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.55;
}
.rgrid-cell:empty { display: none; }
.rgrid-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.375rem; }
.rgrid-end { display: flex; flex-direction: column; align-items: flex-start; gap: 0.25rem; }
@container (min-width: 800px) {
  .rgrid-cq:not([data-wide='lg']) .rgrid-head, .rgrid-cq:not([data-wide='lg']) .rgrid-row {
    display: grid;
    grid-template-columns: var(--rgrid-cols);
    column-gap: 1rem;
    align-items: center;
  }
  .rgrid-cq:not([data-wide='lg']) .rgrid-head { padding: 0.7rem 1.25rem; }
  .rgrid-cq:not([data-wide='lg']) .rgrid-row { padding: 0.85rem 1.25rem; }
  .rgrid-cq:not([data-wide='lg']) .rgrid-cell[data-role='primary'] { grid-column: auto; order: 0; }
  .rgrid-cq:not([data-wide='lg']) .rgrid-cell[data-role='actions'] { grid-column: auto; }
  .rgrid-cq:not([data-wide='lg']) .rgrid-cell[data-label]::before { display: none; }
  .rgrid-cq:not([data-wide='lg']) .rgrid-cell:empty { display: block; }
  .rgrid-cq:not([data-wide='lg']) .rgrid-cell[data-align='right'], .rgrid-cq:not([data-wide='lg']) .rgrid-head > [data-align='right'] { text-align: right; }
  .rgrid-cq:not([data-wide='lg']) .rgrid-actions { justify-content: flex-end; }
  .rgrid-cq:not([data-wide='lg']) .rgrid-end { align-items: flex-end; }
}
@container (min-width: 900px) {
  .rgrid-cq[data-wide='lg'] .rgrid-head, .rgrid-cq[data-wide='lg'] .rgrid-row {
    display: grid;
    grid-template-columns: var(--rgrid-cols);
    column-gap: 1rem;
    align-items: center;
  }
  .rgrid-cq[data-wide='lg'] .rgrid-head { padding: 0.7rem 1.25rem; }
  .rgrid-cq[data-wide='lg'] .rgrid-row { padding: 0.85rem 1.25rem; }
  .rgrid-cq[data-wide='lg'] .rgrid-cell[data-role='primary'] { grid-column: auto; order: 0; }
  .rgrid-cq[data-wide='lg'] .rgrid-cell[data-role='actions'] { grid-column: auto; }
  .rgrid-cq[data-wide='lg'] .rgrid-cell[data-label]::before { display: none; }
  .rgrid-cq[data-wide='lg'] .rgrid-cell:empty { display: block; }
  .rgrid-cq[data-wide='lg'] .rgrid-cell[data-align='right'], .rgrid-cq[data-wide='lg'] .rgrid-head > [data-align='right'] { text-align: right; }
  .rgrid-cq[data-wide='lg'] .rgrid-actions { justify-content: flex-end; }
  .rgrid-cq[data-wide='lg'] .rgrid-end { align-items: flex-end; }
}
`;

const OpsStyles = () => <style>{opsStyles}</style>;

/** Thin gradient strip used on top of editor/form cards. */
const FormAccent = () => (
  <span
    aria-hidden="true"
    className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 opacity-80"
  />
);

/* ------------------------------------------------------------------ */
/* Responsive list: table on wide content, stacked cards on narrow.    */
/* Layout follows the content width (container query), so it stays     */
/* tidy at 90% / 100% / 110% browser zoom with the sidebar open and    */
/* never needs a horizontal scrollbar.                                 */
/* ------------------------------------------------------------------ */

type GridColumn<T> = {
  key: string;
  header: string;
  /** CSS grid track for the wide layout, e.g. 'minmax(0, 2fr)' or '200px' */
  track: string;
  /** 'primary' = full-width title row on narrow layouts, 'actions' = full-width button row */
  role?: 'primary' | 'actions';
  align?: 'right';
  sortKey?: string;
  render: (row: T) => ReactNode;
};

type ToolbarFilter = {
  key: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
};

function GridToolbar({
  search,
  onSearch,
  searchPlaceholder = 'Search…',
  filters = [],
  sortValue,
  sortOptions,
  onSortChange,
}: {
  search?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ToolbarFilter[];
  sortValue?: string;
  sortOptions?: { value: string; label: string }[];
  onSortChange?: (value: string) => void;
}) {
  const labelClass = 'flex min-w-[140px] flex-[1_1_150px] flex-col text-[10px] font-bold uppercase tracking-wider text-semantic-text-muted sm:max-w-[220px]';
  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-semantic-border p-3 sm:p-4">
      {onSearch && (
        <div className="relative min-w-[200px] flex-[2_1_220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-semantic-text-muted" />
          <input
            type="text"
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={search ?? ''}
            onChange={(e) => onSearch(e.target.value)}
            className={cn(fieldControl, 'pl-9')}
          />
        </div>
      )}
      {filters.map((f) => (
        <label key={f.key} className={labelClass}>
          {f.label}
          <select className={`${fieldControl} mt-1`} value={f.value} onChange={(e) => f.onChange(e.target.value)}>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      ))}
      {sortOptions && onSortChange && (
        <label className={labelClass}>
          Sort by
          <select className={`${fieldControl} mt-1`} value={sortValue ?? ''} onChange={(e) => onSortChange(e.target.value)}>
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

function ResponsiveGrid<T>({
  columns,
  rows,
  rowKey,
  emptyState,
  loading = false,
  sortKey = null,
  sortDir = null,
  onSort,
  toolbar,
  footer,
  wideAt = 'md',
}: {
  columns: GridColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyState: ReactNode;
  loading?: boolean;
  sortKey?: string | null;
  sortDir?: 'asc' | 'desc' | null;
  onSort?: (key: string) => void;
  toolbar?: ReactNode;
  footer?: ReactNode;
  /** Content width where the table layout kicks in: 'md' = 800px, 'lg' = 900px (use for dense tables). */
  wideAt?: 'md' | 'lg';
}) {
  const tableStyle = { '--rgrid-cols': columns.map((c) => c.track).join(' ') } as CSSProperties;
  return (
    <div data-wide={wideAt} className="rgrid-cq overflow-hidden rounded-ui-2xl border border-semantic-border bg-semantic-surface shadow-ui-sm">
      {toolbar}
      <div role="table" style={tableStyle}>
        <div
          role="row"
          className="rgrid-head border-b border-semantic-border bg-semantic-surface-muted/50 text-[11px] font-bold uppercase tracking-wider text-semantic-text-muted"
        >
          {columns.map((col) => {
            const sk = col.sortKey;
            const active = !!sk && sortKey === sk;
            return (
              <div
                key={col.key}
                role="columnheader"
                data-align={col.align}
                aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
              >
                {sk && onSort ? (
                  <button
                    type="button"
                    onClick={() => onSort(sk)}
                    className={cn(
                      'inline-flex items-center gap-1 font-bold uppercase tracking-wider transition-colors hover:text-semantic-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-border',
                      active && 'text-semantic-accent'
                    )}
                  >
                    {col.header}
                    {active ? (
                      sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-50" />
                    )}
                  </button>
                ) : (
                  col.header
                )}
              </div>
            );
          })}
        </div>

        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} aria-hidden="true" className="space-y-2 border-b border-semantic-border/60 p-4 last:border-0">
              <div className="h-4 w-2/3 animate-pulse rounded bg-semantic-surface-muted" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-semantic-surface-muted" />
            </div>
          ))
        ) : rows.length === 0 ? (
          <div className="p-6">{emptyState}</div>
        ) : (
          rows.map((row) => (
            <div
              key={rowKey(row)}
              role="row"
              className="rgrid-row border-b border-semantic-border/60 transition-colors last:border-0 hover:bg-semantic-surface-muted/50"
            >
              {columns.map((col) => (
                <div
                  key={col.key}
                  role="cell"
                  className="rgrid-cell"
                  data-role={col.role}
                  data-align={col.align}
                  data-label={col.role ? undefined : col.header}
                >
                  {col.render(row)}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
      {footer && (
        <div className="border-t border-semantic-border bg-semantic-surface-muted/30 px-4 py-2.5 text-xs text-semantic-text-muted sm:px-5">
          {footer}
        </div>
      )}
    </div>
  );
}

const formatEntryDate = (value: string) => {
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};


const BudgetBar = ({ usedMinutes, budgetMinutes }: { usedMinutes: number; budgetMinutes: number }) => {
  const usagePct = budgetMinutes > 0 ? (usedMinutes / budgetMinutes) * 100 : 0;
  const pct = Math.min(100, Math.max(0, usagePct));
  const overBudget = usedMinutes > budgetMinutes;
  return (
    <div className="w-full max-w-md mt-2">
      <div className="flex justify-between text-[11px] text-semantic-text-muted mb-1">
        <span>Budget usage</span>
        <span className={cn('tabular-nums', overBudget && 'font-semibold text-semantic-danger')}>
          {(usedMinutes / 60).toFixed(1)} / {(budgetMinutes / 60).toFixed(1)}h · {Math.round(usagePct)}%
        </span>
      </div>
      <div
        className="h-2 w-full rounded-full bg-semantic-surface-muted overflow-hidden"
        role="progressbar"
        aria-label="Budget usage"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-1000 ease-out',
            overBudget ? 'bg-semantic-danger' : pct >= 80 ? 'bg-semantic-warning' : 'bg-semantic-accent'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

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

function quotePreviewTotalCents(preview: NonNullable<ApprovalItem['quote_preview']>): number {
  if (preview.total_cents != null) return preview.total_cents;

  const subtotal = (preview.line_items || []).reduce(
    (sum, line) => sum + line.quantity * line.unit_price_cents,
    0,
  );
  const discounted = Math.floor((subtotal * (10000 - (preview.discount_bps || 0)) + 5000) / 10000);
  return discounted + Math.floor((discounted * (preview.tax_bps || 0) + 5000) / 10000);
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

/* ------------------------------------------------------------------ */
/* Projects                                                            */
/* ------------------------------------------------------------------ */

export function ProjectsPage() {
  const toast = useToast();
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
  const editor = useEditorScroll();

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

  const saveProject = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const isEditing = Boolean(editing);
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
      toast.success(isEditing ? 'Project updated.' : 'Project created.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save project');
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
      toast.success('Task created.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to add task');
    }
  };

  const updateTask = async (task: Task, values: Record<string, unknown>) => {
    try {
      await apiRequest(`/operations/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify(values) });
      await refreshTasks(task.project_id);
      toast.success('Task updated.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to update task');
    }
  };

  const removeTask = async (task: Task) => {
    if (!window.confirm('Delete this task? Tasks with logged time are protected.')) return;
    try {
      await apiRequest(`/operations/tasks/${task.id}`, { method: 'DELETE' });
      await refreshTasks(task.project_id);
      toast.success('Task deleted.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to delete task');
    }
  };

  const archiveProject = async (project: Project) => {
    if (!window.confirm(`Archive "${project.name}"? Project history will remain available.`)) return;
    try {
      await apiRequest(`/operations/projects/${project.id}`, { method: 'DELETE' });
      await load();
      toast.success('Project archived.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to archive project');
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
          // Fix: sort by how much of its budget each project has actually used (matches the label).
          const pa = a.budget_minutes ? (usedMinutesByProject.get(a.id) || 0) / a.budget_minutes : 0;
          const pb = b.budget_minutes ? (usedMinutesByProject.get(b.id) || 0) / b.budget_minutes : 0;
          cmp = pa - pb;
        }
        return sortDir === 'desc' ? -cmp : cmp;
      });
    }
    return list;
  }, [rows, search, filterStatus, sortKey, sortDir, usedMinutesByProject]);

  // Sort dropdown values look like "name:asc" (works at every screen size).
  const sortSelectValue = `${sortKey ?? 'created_at'}:${sortDir}`;
  const handleSortSelect = (value: string) => {
    const [key, dir] = value.split(':');
    setSortKey(key);
    setSortDir(dir === 'asc' ? 'asc' : 'desc');
  };
  const projectSortOptions = [
    { value: 'created_at:desc', label: 'Newest first' },
    { value: 'created_at:asc', label: 'Oldest first' },
    { value: 'name:asc', label: 'Name A–Z' },
    { value: 'name:desc', label: 'Name Z–A' },
    { value: 'budget_used:desc', label: 'Most budget used' },
    { value: 'budget_used:asc', label: 'Least budget used' },
  ];
  const resetProjectForm = () => { setEditing(null); setName(''); setBudgetHours(''); setBudget(''); };

  return (
    <div className="page-shell space-y-6">
      <OpsStyles />
      <PageHeader
        eyebrow="Delivery"
        title="Projects & Tasks"
        description="Plan work, assign tasks, and keep delivery budgets visible."
        statChips={[
          { label: 'Active projects', value: active_count, tone: 'accent' },
          { label: 'Total projects', value: rows.length, tone: 'muted' },
        ]}
      />
      {error && <Alert variant="danger" title="Error">{error}</Alert>}

      <div ref={editor.ref} className={editor.className}>
        <Card className="relative overflow-hidden">
          <FormAccent />
          <CardHeader>
            <div>
              <h2 className="font-semibold text-semantic-text">{editing ? 'Update project' : 'Create project'}</h2>
              <p className="text-xs text-semantic-text-muted mt-0.5">Set the time and amount budget for delivery tracking.</p>
            </div>
            {editing && <Badge variant="warning">Editing</Badge>}
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void saveProject(e)} className="ops-form ops-form--proj">
              <label className="ops-fullbelow text-xs font-semibold text-semantic-text-muted">
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
              <div className="ops-fullbelow flex flex-wrap items-end gap-2 self-end">
                <Button type="submit" size="md">{editing ? 'Save changes' : 'Create project'}</Button>
                {editing && (
                  <Button type="button" variant="secondary" onClick={resetProjectForm}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="ops-rise" style={{ animationDelay: '80ms' }}>
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="min-w-0">
              <h2 className="font-semibold text-semantic-text">Projects list</h2>
              <p className="text-xs text-semantic-text-muted mt-0.5">Click a project name to open its tasks.</p>
            </div>
            <Badge variant="muted">{filteredRows.length} of {rows.length}</Badge>
          </CardHeader>
          <GridToolbar
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Search projects..."
            filters={[
              {
                key: 'status',
                label: 'Status',
                value: filterStatus,
                onChange: setFilterStatus,
                options: [
                  { value: 'all', label: 'All statuses' },
                  { value: 'active', label: 'Active' },
                  { value: 'archived', label: 'Archived' },
                ],
              },
            ]}
            sortValue={sortSelectValue}
            sortOptions={projectSortOptions}
            onSortChange={handleSortSelect}
          />
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
              filteredRows.map((project, index) => (
                <Card
                  key={project.id}
                  className={cn(
                    'ops-pop overflow-hidden transition-all duration-200 hover:shadow-ui-lg',
                    expanded === project.id && 'ring-2 ring-semantic-accent/20'
                  )}
                  style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                >
                  {/* Wraps instead of overflowing: the buttons drop below the details when space is tight. */}
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-4 py-4 sm:px-5">
                    <button
                      type="button"
                      className="group flex min-w-0 flex-[1_1_300px] flex-col items-start gap-1 text-left focus-visible:outline-none"
                      onClick={() => void toggle(project)}
                      aria-expanded={expanded === project.id}
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <ChevronDown
                          className={cn(
                            'h-4 w-4 shrink-0 text-semantic-text-muted transition-transform duration-200 group-hover:text-semantic-accent',
                            expanded === project.id && 'rotate-180 text-semantic-accent'
                          )}
                        />
                        <span className="min-w-0 break-words font-bold text-semantic-text transition-colors group-hover:text-semantic-accent">{project.name}</span>
                        <Badge variant={project.status === 'archived' ? 'muted' : 'success'}>
                          {project.status}
                        </Badge>
                      </div>
                      {project.description && (
                        <p className="line-clamp-2 max-w-full text-sm text-semantic-text-muted">{project.description}</p>
                      )}
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-semantic-text-muted">
                        {(project.start_date || project.end_date) && (
                          <span>
                            {project.start_date || '—'} → {project.end_date || '—'}
                          </span>
                        )}
                        <span>
                          {(project.budget_minutes / 60).toFixed(1)}h · {formatCurrency(project.budget_amount_cents, project.currency)} budget
                        </span>
                      </div>
                      {project.budget_minutes > 0 && (
                        <BudgetBar
                          usedMinutes={usedMinutesByProject.get(project.id) || 0}
                          budgetMinutes={project.budget_minutes}
                        />
                      )}
                    </button>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setEditing(project);
                          setName(project.name);
                          setBudgetHours(String(project.budget_minutes / 60));
                          setBudget(String(project.budget_amount_cents / 100));
                          editor.focusEditor();
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
                  </div>
                  {expanded === project.id && (
                    <CardContent className="ops-pop border-t border-semantic-border bg-semantic-surface-muted/40">
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-semantic-text-muted mb-3">Tasks</h3>
                      <div className="space-y-2 mb-4">
                        {(tasks[project.id] || []).length === 0 ? (
                          <div className="py-6">
                            <EmptyState icon={Inbox} title="No tasks yet" description="Add a task below to start planning." />
                          </div>
                        ) : (
                          (tasks[project.id] || []).map((task) => (
                            <div key={task.id} className="ops-pop flex flex-wrap items-center justify-between gap-3 rounded-ui-xl border border-semantic-border bg-semantic-surface px-3 py-2.5 text-sm transition-colors hover:border-semantic-accent/40">
                              <button
                                className="min-w-0 flex-[1_1_200px] break-words text-left font-medium text-semantic-text"
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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Timesheets                                                          */
/* ------------------------------------------------------------------ */

function renderWorkDescriptionInline(text: string): ReactNode[] {
  return text.split(/(\*\*.+?\*\*|`[^`]+`|\*[^*]+\*)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-semibold text-semantic-text">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index} className="rounded bg-semantic-surface-muted px-1.5 py-0.5 font-mono text-[0.9em]">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

function WorkDescription({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const Heading = `h${heading[1].length}` as 'h1' | 'h2' | 'h3';
      blocks.push(
        <Heading key={index} className="mt-5 first:mt-0 text-base font-bold text-semantic-text">
          {renderWorkDescriptionInline(heading[2])}
        </Heading>
      );
      index += 1;
      continue;
    }

    const listItem = /^([-*]|\d+\.)\s+(.+)$/.exec(line);
    if (listItem) {
      const ordered = listItem[1] !== '-' && listItem[1] !== '*';
      const items: string[] = [];
      while (index < lines.length) {
        const item = /^([-*]|\d+\.)\s+(.+)$/.exec(lines[index].trim());
        if (!item || (item[1] !== '-' && item[1] !== '*') !== ordered) break;
        items.push(item[2]);
        index += 1;
      }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(
        <List key={blocks.length} className={`my-3 space-y-1.5 pl-6 ${ordered ? 'list-decimal' : 'list-disc'}`}>
          {items.map((item, itemIndex) => <li key={itemIndex} className="pl-1">{renderWorkDescriptionInline(item)}</li>)}
        </List>
      );
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^(#{1,3})\s+/.test(lines[index].trim()) && !/^([-*]|\d+\.)\s+/.test(lines[index].trim())) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(
      <p key={blocks.length} className="my-3 first:mt-0 last:mb-0 leading-7 text-semantic-text">
        {renderWorkDescriptionInline(paragraph.join(' '))}
      </p>
    );
  }

  return <div>{blocks.length ? blocks : <p className="text-semantic-text-muted">No description provided.</p>}</div>;
}

export function TimesheetsPage() {
  const { user } = useAuth();
  const toast = useToast();
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
  const editor = useEditorScroll();

  const [search, setSearch] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string | string[]>>({
    approval_status: 'all',
    project_id: 'all',
    is_billable: '',
  });
  const [sortKey, setSortKey] = useState<string | null>('entry_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [viewingEntry, setViewingEntry] = useState<Entry | null>(null);
  const closeDescriptionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!viewingEntry) return;
    closeDescriptionRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setViewingEntry(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [viewingEntry]);

  // Fix: no longer depends on `projectId`. Previously, choosing a project in the form recreated this
  // callback and triggered a full reload (table loading flash) every time the project selection changed.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, p, pe] = await Promise.all([
        apiRequest<Entry[]>('/operations/timesheets'),
        apiRequest<Project[]>('/operations/projects'),
        apiRequest<Employee[]>('/operations/people').catch(() => [] as Employee[]),
      ]);
      setEntries(e); setProjects(p); setPeople(pe);
      setProjectId((current) => current || p[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load timesheets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const isEditing = Boolean(editingId);
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
      toast.success(isEditing ? 'Time entry updated.' : 'Time entry submitted for approval.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save time');
    }
  };

  const decide = async (id: string, status: string) => {
    try {
      await apiRequest(`/operations/timesheets/${id}/approval`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
      toast.success(status === 'approved' ? 'Time entry approved.' : status === 'rejected' ? 'Time entry rejected.' : 'Time entry approval updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to update approval');
    }
  };

  const remove = async (entry: Entry) => {
    if (!window.confirm('Delete this pending time entry?')) return;
    try {
      await apiRequest(`/operations/timesheets/${entry.id}`, { method: 'DELETE' });
      await load();
      toast.success('Time entry deleted.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to delete time entry');
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
    return list;0
  }, [entries, search, filterValues, sortKey, sortDir, user?.id]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const onFilterChange = (key: string, value: string | string[]) => {
    setFilterValues((old) => ({ ...old, [key]: value }));
  };

  const filterValue = (key: string, fallback: string) => {
    const v = filterValues[key];
    return typeof v === 'string' ? v : fallback;
  };

  const toolbarFilters: ToolbarFilter[] = [
    {
      key: 'approval_status',
      label: 'Approval',
      value: filterValue('approval_status', 'all'),
      onChange: (v) => onFilterChange('approval_status', v),
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
      value: filterValue('project_id', 'all'),
      onChange: (v) => onFilterChange('project_id', v),
      options: [
        { value: 'all', label: 'All projects' },
        ...projects.map((p) => ({ value: p.id, label: p.name })),
      ],
    },
    {
      key: 'is_billable',
      label: 'Billing',
      value: filterValue('is_billable', ''),
      onChange: (v) => onFilterChange('is_billable', v),
      options: [
        { value: '', label: 'Billable & non-billable' },
        { value: 'yes', label: 'Billable only' },
        { value: 'no', label: 'Non-billable only' },
      ],
    },
  ];

  // Sort dropdown (works on narrow layouts where there are no column headers).
  const sortOptions = [
    { value: 'entry_date:desc', label: 'Newest first' },
    { value: 'entry_date:asc', label: 'Oldest first' },
    { value: 'minutes:desc', label: 'Most hours' },
    { value: 'minutes:asc', label: 'Fewest hours' },
  ];
  const sortSelectValue = `${sortKey ?? 'entry_date'}:${sortDir}`;
  const handleSortSelect = (value: string) => {
    const [key, dir] = value.split(':');
    setSortKey(key);
    setSortDir(dir === 'asc' ? 'asc' : 'desc');
  };

  const pendingCount = entries.filter((entry) => entry.approval_status === 'pending').length;
  const loggedHours = entries.reduce((sum, entry) => sum + entry.minutes, 0) / 60;
  const shownHours = filteredEntries.reduce((sum, entry) => sum + entry.minutes, 0) / 60;

  const columns: GridColumn<Entry>[] = [
    {
      key: 'entry_date',
      header: 'Date',
      track: 'minmax(0, 0.9fr)',
      sortKey: 'entry_date',
      render: (r) => <span className="text-sm font-medium tabular-nums text-semantic-text">{formatEntryDate(r.entry_date)}</span>,
    },
    {
      key: 'description',
      header: 'Work',
      track: 'minmax(0, 2.6fr)',
      role: 'primary',
      render: (r) => (
        <div className="min-w-0">
          <button
            type="button"
            className="block w-full truncate text-left font-semibold text-semantic-text hover:text-semantic-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-accent"
            title="View full work description"
            onClick={() => setViewingEntry(r)}
          >
            {r.description}
          </button>
          <div className="mt-0.5 truncate text-xs text-semantic-text-muted">{projectName(r.project_id)}</div>
        </div>
      ),
    },
    {
      key: 'employee',
      header: 'Employee',
      track: 'minmax(0, 1.1fr)',
      render: (r) => {
        const name = employeeName(r);
        if (name === 'You') return <Badge variant="success" size="sm">You</Badge>;
        if (name === '—') return <span className="text-semantic-text-muted">—</span>;
        return (
          <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
            <Badge variant="muted" size="sm" className="h-6 w-6 shrink-0 rounded-full p-0 justify-center">{initials(name)}</Badge>
            <span className="truncate text-sm">{name}</span>
          </span>
        );
      },
    },
    {
      key: 'minutes',
      header: 'Hours',
      track: 'minmax(0, 1.15fr)',
      align: 'right',
      sortKey: 'minutes',
      render: (r) => (
        <div className="rgrid-end">
          <span className="font-bold tabular-nums text-semantic-text">{(r.minutes / 60).toFixed(1)}h</span>
          {r.is_billable
            ? <Badge variant="success" size="sm">Billable</Badge>
            : <Badge variant="muted" size="sm">Non-billable</Badge>}
        </div>
      ),
    },
    {
      key: 'approval_status',
      header: 'Approval',
      track: 'minmax(0, 0.95fr)',
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
      track: '176px',
      role: 'actions',
      align: 'right',
      render: (entry) => {
        if (entry.approval_status !== 'pending') return null;
        const canEditEntry = entry.user_id === user?.id || entry.employee_id === user?.id || canApprove;
        if (!canEditEntry) return null;
        return (
          <div className="rgrid-actions">
            <Button variant="secondary" size="sm" onClick={() => {
              setEditingId(entry.id);
              setProjectId(entry.project_id);
              setDate(entry.entry_date);
              setHours((entry.minutes / 60).toFixed(1));
              setDescription(entry.description);
              setBillable(entry.is_billable);
              editor.focusEditor();
            }}>Edit</Button>
            <Button variant="ghost" size="sm" className="text-semantic-danger hover:text-semantic-danger hover:bg-semantic-danger-soft py-1 px-2" onClick={() => void remove(entry)}>Delete</Button>
            {canApprove && (
              <>
                <Button variant="primary" size="sm" className="bg-semantic-success hover:bg-emerald-700 min-h-[32px] px-3 py-1" onClick={() => void decide(entry.id, 'approved')}>Approve</Button>
                <Button variant="ghost" size="sm" className="text-semantic-danger hover:text-semantic-danger hover:bg-semantic-danger-soft py-1 px-2" onClick={() => void decide(entry.id, 'rejected')}>Reject</Button>
              </>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="page-shell space-y-6">
      <OpsStyles />
      <PageHeader
        eyebrow="Time tracking"
        title="Timesheets"
        description="Log work against a project. Edit or remove your entries while they are pending review."
        statChips={[
          { label: 'Pending review', value: pendingCount, tone: 'warning' },
          { label: 'Hours logged', value: `${loggedHours.toFixed(1)}h`, tone: 'accent' },
        ]}
      />
      {error && <Alert variant="danger" title="Error">{error}</Alert>}

      <div ref={editor.ref} className={editor.className}>
        <Card className="relative overflow-hidden">
          <FormAccent />
          <CardHeader>
            <div>
              <h2 className="font-semibold text-semantic-text">{editingId ? 'Update entry' : 'Log time'}</h2>
              <p className="text-xs text-semantic-text-muted mt-0.5">Assign hours to a project with a short description.</p>
            </div>
            {editingId && <Badge variant="warning">Editing</Badge>}
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void add(e)} className="space-y-5">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                <label className="block min-w-0 text-sm font-medium text-semantic-text">
                  Project
                  <ProjectDropdown
                    projects={projects}
                    value={projectId}
                    onChange={setProjectId}
                  />
                </label>

                <label className="block min-w-0 text-sm font-medium text-semantic-text">
                  Work date
                  <input
                    className={`${fieldControl} mt-1.5 min-h-12 w-full rounded-xl`}
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>

                <label className="block min-w-0 text-sm font-medium text-semantic-text">
                  Hours worked
                  <div className="relative mt-1.5">
                    <input
                      className={`${fieldControl} min-h-12 w-full rounded-xl pr-16`}
                      type="number"
                      required
                      min="0.1"
                      max="24"
                      step="0.1"
                      placeholder="e.g. 2.5"
                      value={hours}
                      onChange={(e) => setHours(e.target.value)}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-semantic-text-muted">
                      hours
                    </span>
                  </div>
                </label>
              </div>

              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-semantic-border bg-semantic-surface p-4 transition-colors hover:border-semantic-accent/40">
                <span className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-semantic-accent/10 text-semantic-accent">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path d="m8 12 2.5 2.5L16 9" />
                    </svg>
                  </span>

                  <span>
                    <span className="block text-sm font-semibold text-semantic-text">
                      Billable hours
                    </span>
                    <span className="block text-xs text-semantic-text-muted">
                      Mark this work as chargeable to the client
                    </span>
                  </span>
                </span>

                <input
                  type="checkbox"
                  checked={billable}
                  onChange={(e) => setBillable(e.target.checked)}
                  className="h-5 w-5 shrink-0 cursor-pointer rounded accent-[var(--accent)]"
                />
              </label>

              <label className="block text-sm font-medium text-semantic-text">
                Work description
                <textarea
                  className={`${fieldControl} mt-1.5 min-h-28 w-full resize-y rounded-xl py-3`}
                  required
                  rows={3}
                  placeholder="Describe the work completed, progress made, or task delivered..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <span className="mt-1.5 block text-xs font-normal text-semantic-text-muted">
                  Include enough detail to make this time entry easy to review.
                </span>
              </label>

              <div className="flex flex-col-reverse gap-3 border-t border-semantic-border pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-semantic-text-muted">
                  Review your project, date, and hours before saving.
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  {editingId && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setEditingId('');
                        setHours('');
                        setDescription('');
                      }}
                    >
                      Cancel
                    </Button>
                  )}

                  <Button
                    type="submit"
                    disabled={!projects.length || !projectId}
                  >
                    {editingId ? 'Save changes' : 'Log time'}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="ops-rise" style={{ animationDelay: '80ms' }}>
        <ResponsiveGrid<Entry>
          columns={columns}
          rows={filteredEntries}
          rowKey={(r) => r.id}
          loading={loading}
          wideAt="lg"
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          toolbar={
            <GridToolbar
              search={search}
              onSearch={setSearch}
              searchPlaceholder="Search description..."
              filters={toolbarFilters}
              sortValue={sortSelectValue}
              sortOptions={sortOptions}
              onSortChange={handleSortSelect}
            />
          }
          footer={`Showing ${filteredEntries.length} of ${entries.length} entries · ${shownHours.toFixed(1)}h`}
          emptyState={<EmptyState icon={Inbox} title="No time entries" description="Log your first entry using the form above." />}
        />
      </div>
      {viewingEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setViewingEntry(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="work-description-title"
            className="flex max-h-[min(85vh,760px)] w-full max-w-2xl flex-col overflow-hidden rounded-ui-2xl border border-semantic-border bg-semantic-surface shadow-ui-xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-semantic-border px-6 py-5">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-semantic-text-muted">Work description</p>
                <h2 id="work-description-title" className="mt-1 truncate text-xl font-bold text-semantic-text">
                  {projectName(viewingEntry.project_id)}
                </h2>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-semantic-text-muted">
                  <span>{employeeName(viewingEntry)}</span>
                  <span>{formatEntryDate(viewingEntry.entry_date)}</span>
                  <span>{(viewingEntry.minutes / 60).toFixed(1)}h</span>
                </div>
              </div>
              <button
                ref={closeDescriptionRef}
                type="button"
                aria-label="Close work description"
                className="shrink-0 rounded-ui-lg p-2 text-semantic-text-muted transition hover:bg-semantic-surface-muted hover:text-semantic-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-accent"
                onClick={() => setViewingEntry(null)}
              >
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="overflow-y-auto px-6 py-5">
              <WorkDescription text={viewingEntry.description} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */

export function PeoplePage() {
  const toast = useToast();
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
  const editor = useEditorScroll();

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

  const add = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const isEditing = Boolean(editing);
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
      toast.success(isEditing ? 'Team member updated.' : 'Team member created.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save teammate');
    }
  };

  const deactivate = async (person: Employee) => {
    if (!window.confirm(`Deactivate ${person.full_name}? Their time history will be preserved.`)) return;
    try {
      await apiRequest(`/operations/people/${person.id}`, { method: 'DELETE' });
      await load();
      toast.success('Team member deactivated.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to deactivate teammate');
    }
  };

  const reactivate = async (person: Employee) => {
    try {
      await apiRequest(`/operations/people/${person.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: true }) });
      await load();
      toast.success('Team member reactivated.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to reactivate teammate');
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
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-xs font-bold text-white">
            {initials(r.full_name)}
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-semantic-text flex items-center gap-2">
              {r.full_name}
              {!r.is_active && <Badge variant="danger" size="sm">Inactive</Badge>}
            </span>
            {r.title && <span className="text-xs text-semantic-text-muted mt-0.5">{r.title}</span>}
          </div>
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
            editor.focusEditor();
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
      <OpsStyles />
      <PageHeader
        eyebrow="Workspace"
        title="People & Team"
        description="Maintain employee records, billing rates and leave requests."
      />
      {error && <Alert variant="danger" title="Error">{error}</Alert>}

      {canManagePeople && (
        <div ref={editor.ref} className={editor.className}>
          <Card className="relative overflow-hidden">
            <FormAccent />
            <CardHeader>
              <div>
                <h2 className="font-semibold text-semantic-text">{editing ? 'Update teammate' : 'Add teammate'}</h2>
                <p className="text-xs text-semantic-text-muted mt-0.5">Set billing and cost rates used for profitability reporting.</p>
              </div>
              {editing && <Badge variant="warning">Editing</Badge>}
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
        </div>
      )}

      <div className="ops-rise" style={{ animationDelay: '80ms' }}>
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
      </div>

      <div className="ops-rise" style={{ animationDelay: '140ms' }}>
        <LeaveWidget employees={rows.filter((row) => row.is_active)} />
      </div>
    </div>
  );
}

function LeaveWidget({ employees }: { employees: Employee[] }) {
  const toast = useToast();
  const [items, setItems] = useState<LeaveRequest[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<LeaveRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const editor = useEditorScroll();

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

  const add = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const isEditing = Boolean(editing);
      const payload = editing
        ? { start_date: start, end_date: end, reason: reason || null }
        : { employee_id: employeeId, start_date: start, end_date: end, reason: reason || null };
      await apiRequest(editing ? `/operations/leave-requests/${editing.id}` : '/operations/leave-requests', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      setStart(''); setEnd(''); setReason(''); setEditing(null); setError('');
      await load();
      toast.success(isEditing ? 'Leave request updated.' : 'Leave request submitted.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save leave request');
    }
  };

  const remove = async (item: LeaveRequest) => {
    if (!window.confirm('Delete this pending leave request?')) return;
    try {
      await apiRequest(`/operations/leave-requests/${item.id}`, { method: 'DELETE' });
      await load();
      toast.success('Leave request deleted.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to delete leave request');
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
    <div ref={editor.ref} className="scroll-mt-4">
      <Card className="relative overflow-hidden">
        <FormAccent />
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
                <li key={item.id} className="ops-pop flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm transition-colors hover:bg-semantic-surface-muted/50">
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
                          editor.focusEditor();
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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Invoicing                                                           */
/* ------------------------------------------------------------------ */

export function InvoicingPage() {
  const toast = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [client, setClient] = useState('');
  const [projectId, setProjectId] = useState('');
  const [lineItems, setLineItems] = useState([{ description: '', quantity: '1', price: '' }]);
  const [tax, setTax] = useState('0');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sort, setSort] = useState('due-asc');
  const editor = useEditorScroll();

  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = (inv: Invoice) =>
    inv.total_cents > inv.paid_cents &&
    inv.due_date < today &&
    (inv.status === 'draft' || inv.status === 'sent');

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

  const resetForm = () => {
    setClient('');
    setProjectId('');
    setLineItems([{ description: '', quantity: '1', price: '' }]);
    setTax('0');
    setIssueDate(new Date().toISOString().slice(0, 10));
    setDueDate('');
    setEditing(null);
  };

  const subtotal = lineItems.reduce((sum, item) => {
    const q = Number(item.quantity);
    const p = Number(item.price);
    return sum + (Number.isFinite(q) && Number.isFinite(p) ? Math.max(0, q) * Math.max(0, p) * 100 : 0);
  }, 0);
  const taxCents = Math.round(subtotal * Math.max(0, Number(tax) || 0) / 100);
  const total = Math.round(subtotal) + taxCents;

  const saveInvoice = async (e: FormEvent) => {
    e.preventDefault();
    if (dueDate < issueDate) {
      toast.error('Due date cannot be earlier than the issue date.');
      return;
    }
    if (!lineItems.length || lineItems.some((item) =>
      !item.description.trim() || !Number.isFinite(Number(item.quantity)) ||
      Number(item.quantity) <= 0 || !Number.isFinite(Number(item.price)) || Number(item.price) < 0
    )) {
      toast.error('Enter a description, positive quantity, and valid price for every line item.');
      return;
    }
    if (!Number.isFinite(Number(tax)) || Number(tax) < 0 || Number(tax) > 100) {
      toast.error('Tax rate must be between 0 and 100%.');
      return;
    }

    setSaving(true);
    const wasEditing = Boolean(editing);
    try {
      const payload: Record<string, unknown> = {
        client_name: client.trim(),
        currency: editing?.currency || 'USD',
        issue_date: issueDate,
        due_date: dueDate,
        tax_bps: Math.round(Number(tax) * 100),
        line_items: lineItems.map((item) => ({
          description: item.description.trim(),
          quantity: Number(item.quantity),
          unit_price_cents: Math.round(Number(item.price) * 100),
        })),
      };
      if (projectId) payload.project_id = projectId;
      await apiRequest(editing ? `/billing/invoices/${editing.id}` : '/billing/invoices', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      resetForm();
      await load();
      toast.success(wasEditing ? 'Invoice updated.' : 'Invoice created.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save invoice');
    } finally {
      setSaving(false);
    }
  };

  const pay = async (invoice: Invoice) => {
    const remaining = invoice.total_cents - invoice.paid_cents;
    if (remaining <= 0) return;
    try {
      await apiRequest(`/billing/invoices/${invoice.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount_cents: remaining,
          paid_date: new Date().toISOString().slice(0, 10),
          method: 'other',
        }),
      });
      await load();
      toast.success('Payment recorded.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to record payment');
    }
  };

  const send = async (invoice: Invoice) => {
    try {
      await apiRequest(`/billing/invoices/${invoice.id}/status`, {
        method: 'PATCH', body: JSON.stringify({ status: 'sent' }),
      });
      await load();
      toast.success('Invoice marked as sent.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to mark invoice sent');
    }
  };

  const voidInvoice = async (invoice: Invoice) => {
    if (!window.confirm(`Void invoice ${invoice.invoice_number}?`)) return;
    try {
      await apiRequest(`/billing/invoices/${invoice.id}/status`, {
        method: 'PATCH', body: JSON.stringify({ status: 'void' }),
      });
      await load();
      toast.success('Invoice voided.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to void invoice');
    }
  };

  const edit = (invoice: Invoice) => {
    setEditing(invoice);
    setClient(invoice.client_name);
    setProjectId(invoice.project_id || '');
    setIssueDate(invoice.issue_date);
    setDueDate(invoice.due_date);
    setTax(invoice.subtotal_cents ? ((invoice.tax_cents * 100) / invoice.subtotal_cents).toFixed(2) : '0');
    setLineItems(invoice.line_items.map((item) => ({
      description: item.description,
      quantity: String(item.quantity),
      price: (item.unit_price_cents / 100).toFixed(2),
    })));
    editor.focusEditor();
  };

  const remove = async (invoice: Invoice) => {
    if (!window.confirm('Delete this unpaid draft invoice?')) return;
    try {
      await apiRequest(`/billing/invoices/${invoice.id}`, { method: 'DELETE' });
      await load();
      toast.success('Invoice deleted.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to delete invoice');
    }
  };

  const projectName = (id?: string | null) => projects.find((p) => p.id === id)?.name || 'No project';
  const filteredInvoices = useMemo(() => {
    let list = invoices.filter((inv) => {
      const q = search.trim().toLowerCase();
      const matchesSearch = !q ||
        inv.invoice_number.toLowerCase().includes(q) ||
        inv.client_name.toLowerCase().includes(q) ||
        (inv.notes || '').toLowerCase().includes(q) ||
        projectName(inv.project_id).toLowerCase().includes(q);
      return matchesSearch &&
        (statusFilter === 'all' || inv.status === statusFilter) &&
        (!overdueOnly || isOverdue(inv));
    });
    list = [...list];
    list.sort((a, b) => {
      if (sort === 'due-desc') return b.due_date.localeCompare(a.due_date);
      if (sort === 'amount-desc') return b.total_cents - a.total_cents;
      if (sort === 'amount-asc') return a.total_cents - b.total_cents;
      if (sort === 'client') return a.client_name.localeCompare(b.client_name);
      return a.due_date.localeCompare(b.due_date);
    });
    return list;
  }, [invoices, search, statusFilter, overdueOnly, sort, projects]);

  const outstanding = invoices.filter((inv) => inv.status !== 'void')
    .reduce((sum, inv) => sum + Math.max(0, inv.total_cents - inv.paid_cents), 0);
  const overdueCount = invoices.filter(isOverdue).length;
  const paidCount = invoices.filter((inv) => inv.status === 'paid').length;
  const draftCount = invoices.filter((inv) => inv.status === 'draft').length;
  const tone = (status: string): 'success' | 'warning' | 'danger' | 'muted' =>
    status === 'paid' ? 'success' : status === 'sent' ? 'warning' : status === 'void' ? 'danger' : 'muted';

  return (
    <div className="page-shell min-w-0 space-y-6 overflow-x-clip">
      <OpsStyles />
      <PageHeader
        eyebrow="Finance workspace"
        title="Invoices & Payments"
        description="Create client invoices, record payments, and monitor outstanding balances."
      />
      {error && (
        <Alert variant="danger" title="Unable to load invoices">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="secondary" size="sm" onClick={() => void load()}>Try again</Button>
          </div>
        </Alert>
      )}

      <section className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Outstanding balance', value: formatCurrency(outstanding, 'USD'), hint: 'Across non-void invoices', icon: WalletCards, style: 'bg-sky-500/10 text-sky-600' },
          { label: 'Overdue invoices', value: String(overdueCount), hint: 'Past due with balance remaining', icon: AlarmClock, style: 'bg-rose-500/10 text-rose-600' },
          { label: 'Paid invoices', value: String(paidCount), hint: 'Successfully settled', icon: CircleCheck, style: 'bg-emerald-500/10 text-emerald-600' },
          { label: 'Draft invoices', value: String(draftCount), hint: 'Ready to review or send', icon: FileText, style: 'bg-violet-500/10 text-violet-600' },
        ].map((stat) => (
          <Card key={stat.label} className="min-w-0">
            <CardContent>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-semantic-text-muted">{stat.label}</p>
                  <p className="mt-2 break-words text-2xl font-bold tracking-tight text-semantic-text">{stat.value}</p>
                  <p className="mt-1 text-xs text-semantic-text-muted">{stat.hint}</p>
                </div>
                <span className={`shrink-0 rounded-xl p-2.5 ${stat.style}`}><stat.icon size={20} /></span>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <div ref={editor.ref} className={`${editor.className} min-w-0 scroll-mt-6`}>
        <Card className="relative min-w-0 overflow-hidden">
          <FormAccent />
          <CardHeader>
            <div className="flex min-w-0 items-start gap-3">
              <span className="rounded-xl bg-semantic-accent/10 p-2.5 text-semantic-accent"><ReceiptText size={20} /></span>
              <div className="min-w-0">
                <h2 className="font-semibold text-semantic-text">{editing ? 'Edit invoice' : 'Create an invoice'}</h2>
                <p className="mt-1 text-sm text-semantic-text-muted">
                  {editing ? `Update ${editing.invoice_number}.` : 'Enter billing details and line items to prepare a draft.'}
                </p>
              </div>
            </div>
            {editing && <Badge variant="warning">Editing draft</Badge>}
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void saveInvoice(e)} className="min-w-0 space-y-6">
              <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="min-w-0 text-xs font-semibold text-semantic-text-muted">
                  Client name *
                  <input className={`${fieldControl} mt-1.5 w-full min-w-0`} required maxLength={160} placeholder="Customer or company" value={client} onChange={(e) => setClient(e.target.value)} />
                </label>
                <label className="min-w-0 text-xs font-semibold text-semantic-text-muted">
                  Project <span className="font-normal">(optional)</span>
                  <select className={`${fieldControl} mt-1.5 w-full min-w-0`} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                    <option value="">No project linked</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <label className="min-w-0 text-xs font-semibold text-semantic-text-muted">
                  Issue date
                  <input className={`${fieldControl} mt-1.5 w-full min-w-0`} type="date" required value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
                </label>
                <label className="min-w-0 text-xs font-semibold text-semantic-text-muted">
                  Due date
                  <input className={`${fieldControl} mt-1.5 w-full min-w-0`} type="date" required min={issueDate} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </label>
              </div>

              <div className="min-w-0 rounded-2xl border border-semantic-border bg-semantic-surface-muted/30 p-3 sm:p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-semantic-text">Invoice line items</h3>
                    <p className="mt-1 text-xs text-semantic-text-muted">Describe each product or service being billed.</p>
                  </div>
                  <Badge variant="muted">{lineItems.length} {lineItems.length === 1 ? 'item' : 'items'}</Badge>
                </div>
                <div className="min-w-0 space-y-3">
                  {lineItems.map((line, index) => {
                    const amount = Math.round(Math.max(0, Number(line.quantity) || 0) * Math.max(0, Number(line.price) || 0) * 100);
                    return (
                      <div key={index} className="min-w-0 rounded-xl border border-semantic-border bg-semantic-surface p-3 sm:p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <span className="text-xs font-bold uppercase tracking-wide text-semantic-text-muted">Item {String(index + 1).padStart(2, '0')}</span>
                          {lineItems.length > 1 && (
                            <Button type="button" variant="ghost" size="sm" className="min-h-8 px-2 text-semantic-danger" onClick={() => setLineItems((old) => old.filter((_, i) => i !== index))}>
                              <Trash2 size={14} /> Remove
                            </Button>
                          )}
                        </div>
                        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(90px,0.7fr)_minmax(130px,1fr)_minmax(115px,0.8fr)]">
                          <label className="min-w-0 text-xs font-semibold text-semantic-text-muted">
                            Description
                            <input className={`${fieldControl} mt-1.5 w-full min-w-0`} required maxLength={240} placeholder="e.g. Backend development" value={line.description} onChange={(e) => setLineItems((old) => old.map((item, i) => i === index ? { ...item, description: e.target.value } : item))} />
                          </label>
                          <label className="min-w-0 text-xs font-semibold text-semantic-text-muted">
                            Quantity
                            <input className={`${fieldControl} mt-1.5 w-full min-w-0`} required type="number" min="0.01" step="any" value={line.quantity} onChange={(e) => setLineItems((old) => old.map((item, i) => i === index ? { ...item, quantity: e.target.value } : item))} />
                          </label>
                          <label className="min-w-0 text-xs font-semibold text-semantic-text-muted">
                            Unit price (USD)
                            <input className={`${fieldControl} mt-1.5 w-full min-w-0`} required type="number" min="0" step="0.01" placeholder="0.00" value={line.price} onChange={(e) => setLineItems((old) => old.map((item, i) => i === index ? { ...item, price: e.target.value } : item))} />
                          </label>
                          <div className="flex min-w-0 flex-col justify-center rounded-lg bg-semantic-surface-muted/70 px-3 py-2">
                            <span className="text-[11px] text-semantic-text-muted">Line total</span>
                            <span className="mt-1 break-words text-base font-semibold tabular-nums text-semantic-text">{formatCurrency(amount, editing?.currency || 'USD')}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => setLineItems((old) => [...old, { description: '', quantity: '1', price: '' }])}>
                  <Plus size={15} /> Add line item
                </Button>
              </div>

              <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.75fr)]">
                <label className="min-w-0 text-xs font-semibold text-semantic-text-muted">
                  Tax rate (%)
                  <input className={`${fieldControl} mt-1.5 w-full max-w-xs`} type="number" min="0" max="100" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} />
                  <span className="mt-1.5 block font-normal">Calculated against the line-item subtotal.</span>
                </label>
                <div className="min-w-0 rounded-2xl border border-semantic-border bg-semantic-surface-muted/40 p-4">
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-semantic-text-muted">Subtotal</span>
                    <span className="font-medium tabular-nums text-semantic-text">{formatCurrency(Math.round(subtotal), editing?.currency || 'USD')}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-4 text-sm">
                    <span className="text-semantic-text-muted">Tax ({Number(tax) || 0}%)</span>
                    <span className="font-medium tabular-nums text-semantic-text">{formatCurrency(taxCents, editing?.currency || 'USD')}</span>
                  </div>
                  <div className="my-4 border-t border-semantic-border" />
                  <div className="flex items-end justify-between gap-4">
                    <span className="text-sm font-semibold text-semantic-text">Estimated total</span>
                    <span className="break-words text-right text-2xl font-bold tracking-tight tabular-nums text-semantic-text">{formatCurrency(total, editing?.currency || 'USD')}</span>
                  </div>
                  <p className="mt-2 text-xs text-semantic-text-muted">Final totals are calculated by the server.</p>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-semantic-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-semantic-text-muted">Currency: {editing?.currency || 'USD'}</p>
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  {editing && <Button type="button" variant="secondary" onClick={resetForm}>Cancel edit</Button>}
                  <Button type="submit" disabled={saving} loading={saving}>{saving ? 'Saving…' : editing ? 'Save invoice changes' : 'Create draft invoice'}</Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <section className="min-w-0 space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-semantic-text">Invoice register</h2>
            <p className="mt-1 text-sm text-semantic-text-muted">A compact, responsive view of your invoices.</p>
          </div>
          <p className="text-sm text-semantic-text-muted">{filteredInvoices.length} of {invoices.length} invoices</p>
        </div>

        <Card className="min-w-0">
          <CardContent>
            <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_170px] xl:grid-cols-[minmax(0,1fr)_170px_auto_190px]">
              <label className="relative block min-w-0">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-semantic-text-muted" />
                <input className={`${fieldControl} w-full min-w-0 pl-9`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search invoice, client, project…" aria-label="Search invoices" />
              </label>
              <select className={`${fieldControl} w-full min-w-0`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="void">Void</option>
              </select>
              <Button type="button" variant={overdueOnly ? 'primary' : 'secondary'} onClick={() => setOverdueOnly((value) => !value)}>
                <AlarmClock size={15} /> {overdueOnly ? 'Show all invoices' : 'Overdue only'}
              </Button>
              <select className={`${fieldControl} w-full min-w-0`} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort invoices">
                <option value="due-asc">Due date: earliest</option>
                <option value="due-desc">Due date: latest</option>
                <option value="amount-desc">Amount: high to low</option>
                <option value="amount-asc">Amount: low to high</option>
                <option value="client">Client: A to Z</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">
            {[0, 1, 2, 3].map((n) => <Card key={n} className="min-w-0 animate-pulse"><CardContent><div className="h-4 w-1/3 rounded bg-semantic-surface-muted" /><div className="mt-4 h-6 w-1/2 rounded bg-semantic-surface-muted" /><div className="mt-5 h-16 rounded bg-semantic-surface-muted" /></CardContent></Card>)}
          </div>
        ) : filteredInvoices.length === 0 ? (
          <Card>
            <CardContent>
              <EmptyState icon={Inbox} title={invoices.length ? 'No matching invoices' : 'No invoices yet'} description={invoices.length ? 'Try changing your search or filters.' : 'Create your first draft invoice above to start tracking billing.'} />
              {invoices.length > 0 && <div className="mt-3 flex justify-center"><Button variant="secondary" size="sm" onClick={() => { setSearch(''); setStatusFilter('all'); setOverdueOnly(false); }}>Clear filters</Button></div>}
            </CardContent>
          </Card>
        ) : (
          <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">
            {filteredInvoices.map((inv) => {
              const balance = Math.max(0, inv.total_cents - inv.paid_cents);
              const progress = inv.total_cents > 0 ? Math.min(100, Math.max(0, inv.paid_cents / inv.total_cents * 100)) : 0;
              const overdue = isOverdue(inv);
              return (
                <Card key={inv.id} className={`min-w-0 overflow-hidden transition-shadow hover:shadow-ui-md ${overdue ? 'border-rose-500/40' : ''}`}>
                  <CardContent>
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="shrink-0 rounded-xl bg-semantic-accent/10 p-2.5 text-semantic-accent"><FileText size={19} /></span>
                        <div className="min-w-0">
                          <p className="break-words text-sm font-bold text-semantic-text">{inv.invoice_number}</p>
                          <p className="mt-1 break-words text-sm text-semantic-text-muted">{inv.client_name}</p>
                          <p className="mt-1 truncate text-xs text-semantic-text-muted" title={projectName(inv.project_id)}>{projectName(inv.project_id)}</p>
                        </div>
                      </div>
                      <div className="flex max-w-[45%] shrink-0 flex-col items-end gap-2">
                        <Badge variant={tone(inv.status)}>{inv.status}</Badge>
                        {overdue && <Badge variant="danger">Overdue</Badge>}
                      </div>
                    </div>

                    {inv.notes && <p className="mt-3 line-clamp-2 break-words text-xs text-semantic-text-muted" title={inv.notes}>{inv.notes}</p>}

                    <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-semantic-surface-muted/40 p-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-semantic-text-muted">Invoice total</p>
                        <p className="mt-1 break-words text-lg font-bold tabular-nums text-semantic-text">{formatCurrency(inv.total_cents, inv.currency)}</p>
                      </div>
                      <div className="min-w-0 text-right">
                        <p className="text-[11px] font-medium text-semantic-text-muted">Balance due</p>
                        <p className={`mt-1 break-words text-lg font-bold tabular-nums ${balance > 0 ? 'text-semantic-text' : 'text-emerald-600'}`}>{formatCurrency(balance, inv.currency)}</p>
                      </div>
                      <div className="col-span-2">
                        <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-semantic-text-muted"><span>Payment progress</span><span>{Math.round(progress)}% paid</span></div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-semantic-border"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} /></div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="flex min-w-0 items-start gap-2"><CalendarDays size={15} className="mt-0.5 shrink-0 text-semantic-text-muted" /><div className="min-w-0"><p className="text-[11px] text-semantic-text-muted">Issue date</p><p className="break-words text-xs font-medium text-semantic-text">{inv.issue_date}</p></div></div>
                      <div className="flex min-w-0 items-start gap-2"><Clock3 size={15} className={`mt-0.5 shrink-0 ${overdue ? 'text-rose-600' : 'text-semantic-text-muted'}`} /><div className="min-w-0"><p className="text-[11px] text-semantic-text-muted">Due date</p><p className={`break-words text-xs font-medium ${overdue ? 'text-rose-600' : 'text-semantic-text'}`}>{inv.due_date}</p></div></div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-semantic-border pt-3">
                      {inv.status === 'draft' && <>
                        <Button variant="secondary" size="sm" onClick={() => edit(inv)}><Pencil size={14} /> Edit</Button>
                        <Button variant="primary" size="sm" onClick={() => void send(inv)}><Send size={14} /> Mark sent</Button>
                        <Button variant="ghost" size="sm" className="text-semantic-danger" onClick={() => void remove(inv)}><Trash2 size={14} /> Delete</Button>
                      </>}
                      {inv.status !== 'paid' && inv.status !== 'void' && balance > 0 && <Button variant="primary" size="sm" className="sm:ml-auto" onClick={() => void pay(inv)}><CircleDollarSign size={14} /> Record payment</Button>}
                      {inv.status === 'sent' && <Button variant="ghost" size="sm" className="text-semantic-danger" onClick={() => void voidInvoice(inv)}><Ban size={14} /> Void invoice</Button>}
                      {inv.status === 'paid' && <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><CircleCheck size={14} /> Fully paid</span>}
                      {inv.status === 'void' && <span className="ml-auto text-xs text-semantic-text-muted">Invoice voided</span>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Expenses                                                            */
/* ------------------------------------------------------------------ */

export function ExpensesPage() {
  const toast = useToast();
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
  const [saving, setSaving] = useState(false);
  const [busyExpenseId, setBusyExpenseId] = useState<string | null>(null);
  const editor = useEditorScroll();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortKey, setSortKey] = useState<'expense_date' | 'amount'>('expense_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const resetForm = () => {
    setVendor('');
    setDescription('');
    setCategory('general');
    setAmount('');
    setDate(new Date().toISOString().slice(0, 10));
    setEditing(null);
  };

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

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const parsedAmount = Number(amount);

    if (!vendor.trim() || !description.trim()) {
      toast.error('Enter a vendor and expense description.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error('Enter an amount greater than zero.');
      return;
    }

    setSaving(true);
    try {
      const isEditing = Boolean(editing);
      await apiRequest(
        editing ? `/billing/expenses/${editing.id}` : '/billing/expenses',
        {
          method: editing ? 'PATCH' : 'POST',
          body: JSON.stringify({
            vendor: vendor.trim(),
            description: description.trim(),
            category,
            amount_cents: Math.round(parsedAmount * 100),
            expense_date: date,
            currency: 'USD',
          }),
        },
      );
      resetForm();
      await load();
      toast.success(isEditing ? 'Expense updated.' : 'Expense submitted for review.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to submit expense');
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (expense: Expense) => {
    setEditing(expense);
    setVendor(expense.vendor);
    setDescription(expense.description);
    setCategory(expense.category || 'general');
    setAmount((expense.amount_cents / 100).toFixed(2));
    setDate(expense.expense_date);
    editor.focusEditor();
  };

  const review = async (expense: Expense, status: 'approved' | 'rejected') => {
    setBusyExpenseId(expense.id);
    try {
      await apiRequest(`/billing/expenses/${expense.id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
      toast.success(status === 'approved' ? 'Expense approved.' : 'Expense rejected.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to review expense');
    } finally {
      setBusyExpenseId(null);
    }
  };

  const remove = async (expense: Expense) => {
    if (!window.confirm('Delete this pending expense?')) return;
    setBusyExpenseId(expense.id);
    try {
      await apiRequest(`/billing/expenses/${expense.id}`, { method: 'DELETE' });
      await load();
      toast.success('Expense deleted.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to delete expense');
    } finally {
      setBusyExpenseId(null);
    }
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = expenses.filter((expense) => {
      const matchesSearch =
        !query ||
        (expense.vendor || '').toLowerCase().includes(query) ||
        (expense.description || '').toLowerCase().includes(query);
      const matchesStatus = statusFilter === 'all' || expense.status === statusFilter;
      const matchesCategory = categoryFilter === 'all' || expense.category === categoryFilter;
      return matchesSearch && matchesStatus && matchesCategory;
    });

    list.sort((a, b) => {
      const comparison =
        sortKey === 'expense_date'
          ? a.expense_date.localeCompare(b.expense_date)
          : a.amount_cents - b.amount_cents;
      return sortDir === 'desc' ? -comparison : comparison;
    });
    return list;
  }, [expenses, search, statusFilter, categoryFilter, sortKey, sortDir]);

  const totalCents = expenses.reduce((sum, expense) => sum + expense.amount_cents, 0);
  const approvedCents = expenses
    .filter((expense) => expense.status === 'approved')
    .reduce((sum, expense) => sum + expense.amount_cents, 0);
  const pendingCount = expenses.filter((expense) => expense.status === 'pending').length;
  const rejectedCount = expenses.filter((expense) => expense.status === 'rejected').length;

  const statusVariant = (status: string): 'success' | 'warning' | 'danger' | 'muted' => {
    if (status === 'approved') return 'success';
    if (status === 'pending') return 'warning';
    if (status === 'rejected') return 'danger';
    return 'muted';
  };

  const inputClass =
    `${fieldControl} mt-1.5 w-full min-w-0 max-w-full box-border`;

  return (
    <div className="page-shell w-full min-w-0 max-w-full space-y-5 overflow-x-clip">
      <OpsStyles />

      <PageHeader
        eyebrow="Finance"
        title="Expense management"
        description="Submit, track and review business expenses in one place."
      />

      {error && (
        <Alert variant="danger" title="Unable to load expenses">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="min-w-0 break-words">{error}</span>
            <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        </Alert>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="min-w-0">
          <CardContent>
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-semantic-text-muted">Total expenses</p>
                <p className="mt-2 break-words text-2xl font-bold tracking-tight text-semantic-text">
                  {formatCurrency(totalCents, 'USD')}
                </p>
                <p className="mt-1 text-xs text-semantic-text-muted">All loaded records</p>
              </div>
              <span className="rounded-xl bg-semantic-surface-subtle p-2 text-semantic-text-muted">
                <ReceiptText className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardContent>
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-semantic-text-muted">Pending review</p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-semantic-text">
                  {pendingCount}
                </p>
                <p className="mt-1 text-xs text-semantic-text-muted">Awaiting a decision</p>
              </div>
              <span className="rounded-xl bg-semantic-warning-soft p-2 text-semantic-warning">
                <Clock3 className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardContent>
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-semantic-text-muted">Approved amount</p>
                <p className="mt-2 break-words text-2xl font-bold tracking-tight text-semantic-text">
                  {formatCurrency(approvedCents, 'USD')}
                </p>
                <p className="mt-1 text-xs text-semantic-text-muted">Approved expenses</p>
              </div>
              <span className="rounded-xl bg-semantic-success-soft p-2 text-semantic-success">
                <CircleCheck className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardContent>
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-semantic-text-muted">Rejected expenses</p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-semantic-text">
                  {rejectedCount}
                </p>
                <p className="mt-1 text-xs text-semantic-text-muted">Require follow-up if needed</p>
              </div>
              <span className="rounded-xl bg-semantic-danger-soft p-2 text-semantic-danger">
                <CircleX className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div ref={editor.ref} className={`${editor.className} min-w-0`}>
        <Card className="relative min-w-0 overflow-hidden">
          <FormAccent />
          <CardHeader>
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-semibold text-semantic-text">
                  {editing ? 'Edit expense' : 'Submit a new expense'}
                </h2>
                <p className="mt-1 text-sm text-semantic-text-muted">
                  Pending expenses can be edited or deleted. Submitted records are sent for review.
                </p>
              </div>
              {editing && <Badge variant="warning">Editing pending expense</Badge>}
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={(e) => void create(e)} className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block min-w-0 text-sm font-medium text-semantic-text">
                Vendor
                <input
                  className={inputClass}
                  required
                  maxLength={200}
                  placeholder="Business or supplier"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                />
              </label>

              <label className="block min-w-0 text-sm font-medium text-semantic-text">
                Expense description
                <input
                  className={inputClass}
                  required
                  maxLength={500}
                  placeholder="What was purchased?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>

              <label className="block min-w-0 text-sm font-medium text-semantic-text">
                Category
                <select
                  className={inputClass}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {CATEGORY_OPTIONS_EXPENSE.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block min-w-0 text-sm font-medium text-semantic-text">
                Amount (USD)
                <div className="relative mt-1.5 min-w-0">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-semantic-text-muted">
                    $
                  </span>
                  <input
                    className={`${fieldControl} box-border w-full min-w-0 max-w-full pl-7`}
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
              </label>

              <label className="block min-w-0 text-sm font-medium text-semantic-text">
                Expense date
                <input
                  className={inputClass}
                  required
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>

              <div className="flex min-w-0 flex-col justify-end gap-2 sm:flex-row md:col-span-2">
                <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                  {saving ? 'Saving…' : editing ? 'Save changes' : 'Submit expense'}
                </Button>
                {editing && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={saving}
                    className="w-full sm:w-auto"
                    onClick={resetForm}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-semibold text-semantic-text">Expense records</h2>
              <p className="mt-1 text-sm text-semantic-text-muted">
                {loading ? 'Loading records…' : `${filtered.length} of ${expenses.length} expenses`}
              </p>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              Refresh
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <div className="mb-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="block min-w-0 text-sm font-medium text-semantic-text sm:col-span-2 xl:col-span-1">
              Search expenses
              <div className="relative mt-1.5 min-w-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-semantic-text-muted" aria-hidden="true" />
                <input
                  className={`${fieldControl} box-border w-full min-w-0 pl-9`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Vendor or description…"
                />
              </div>
            </label>

            <label className="block min-w-0 text-sm font-medium text-semantic-text">
              Status
              <select className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>

            <label className="block min-w-0 text-sm font-medium text-semantic-text">
              Category
              <select className={inputClass} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="all">All categories</option>
                {CATEGORY_OPTIONS_EXPENSE.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block min-w-0 text-sm font-medium text-semantic-text">
              Sort by
              <select
                className={inputClass}
                value={`${sortKey}:${sortDir}`}
                onChange={(e) => {
                  const [key, direction] = e.target.value.split(':') as [
                    'expense_date' | 'amount',
                    'asc' | 'desc',
                  ];
                  setSortKey(key);
                  setSortDir(direction);
                }}
              >
                <option value="expense_date:desc">Newest first</option>
                <option value="expense_date:asc">Oldest first</option>
                <option value="amount:desc">Highest amount</option>
                <option value="amount:asc">Lowest amount</option>
              </select>
            </label>
          </div>

          {(search || statusFilter !== 'all' || categoryFilter !== 'all') && (
            <div className="mb-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                  setCategoryFilter('all');
                }}
              >
                Clear filters
              </Button>
            </div>
          )}

          {loading ? (
            <div className="space-y-3 py-2" aria-label="Loading expenses">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-24 animate-pulse rounded-xl bg-semantic-surface-subtle" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-semantic-border px-5 py-12 text-center">
              <span className="mb-3 rounded-full bg-semantic-surface-subtle p-3">
                <Inbox className="h-6 w-6 text-semantic-text-muted" aria-hidden="true" />
              </span>
              <h3 className="font-semibold text-semantic-text">
                {expenses.length === 0 ? 'No expenses submitted yet' : 'No matching expenses'}
              </h3>
              <p className="mt-1 max-w-sm text-sm text-semantic-text-muted">
                {expenses.length === 0
                  ? 'Submit your first expense using the form above.'
                  : 'Try changing your search or filters.'}
              </p>
              {expenses.length > 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('all');
                    setCategoryFilter('all');
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="grid min-w-0 grid-cols-1 gap-3">
              {filtered.map((expense) => {
                const categoryLabel =
                  CATEGORY_OPTIONS_EXPENSE.find((option) => option.value === expense.category)?.label ||
                  expense.category ||
                  'General';
                const isOwnerPending =
                  expense.status === 'pending' && expense.submitted_by === user?.id;
                const isBusy = busyExpenseId === expense.id;

                return (
                  <article
                    key={expense.id}
                    className="min-w-0 rounded-xl border border-semantic-border bg-semantic-surface p-4 transition-colors hover:border-semantic-border-strong"
                  >
                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="shrink-0 rounded-xl bg-semantic-surface-subtle p-2.5 text-semantic-text-muted">
                          <ReceiptText className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="break-words font-semibold text-semantic-text">
                            {expense.vendor || 'Unknown vendor'}
                          </h3>
                          <p className="mt-1 break-words text-sm text-semantic-text-muted">
                            {expense.description || 'No description provided'}
                          </p>
                          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
                            <Badge variant={statusVariant(expense.status)}>{expense.status}</Badge>
                            <Badge variant={expenseCategoryColor(expense.category)}>
                              {categoryLabel}
                            </Badge>
                            <span className="inline-flex items-center gap-1 text-xs text-semantic-text-muted">
                              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                              {expense.expense_date}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
                        <p className="break-words text-xl font-bold tabular-nums text-semantic-text">
                          {formatCurrency(expense.amount_cents, expense.currency)}
                        </p>
                        <p className="text-xs text-semantic-text-muted">Expense amount</p>
                      </div>
                    </div>

                    {(isOwnerPending || (canReview && expense.status === 'pending')) && (
                      <div className="mt-4 flex min-w-0 flex-wrap gap-2 border-t border-semantic-border pt-3">
                        {isOwnerPending && (
                          <>
                            <Button type="button" variant="secondary" size="sm" disabled={isBusy} onClick={() => startEditing(expense)}>
                              <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={isBusy}
                              className="text-semantic-danger hover:bg-semantic-danger-soft hover:text-semantic-danger"
                              onClick={() => void remove(expense)}
                            >
                              <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                              Delete
                            </Button>
                          </>
                        )}
                        {canReview && expense.status === 'pending' && (
                          <>
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              disabled={isBusy}
                              className="bg-semantic-success hover:bg-emerald-700"
                              onClick={() => void review(expense, 'approved')}
                            >
                              <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                              {isBusy ? 'Processing…' : 'Approve'}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={isBusy}
                              className="text-semantic-danger hover:bg-semantic-danger-soft hover:text-semantic-danger"
                              onClick={() => void review(expense, 'rejected')}
                            >
                              <X className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

export function DocumentsPage() {
  const toast = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('general');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState('');
  const [semanticQuery, setSemanticQuery] = useState('');
  const [knowledgeAnswer, setKnowledgeAnswer] = useState<KnowledgeAskResult | null>(null);
  const [askedQuery, setAskedQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('all');
  const [sortKey, setSortKey] = useState<string | null>('updated_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const editor = useEditorScroll();

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

  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const isEditing = Boolean(editingId);
      await apiRequest(editingId ? `/documents/${editingId}` : '/documents', {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify({ title, category, content }),
      });
      setTitle(''); setContent(''); setEditingId('');
      await load('');
      toast.success(isEditing ? 'Document updated.' : 'Document created.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to save document');
    }
  };

  const edit = (doc: Document) => {
    setEditingId(doc.id);
    setTitle(doc.title);
    setCategory(doc.category);
    setContent(doc.content);
    editor.focusEditor();
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this document and its search index?')) return;
    try {
      await apiRequest(`/documents/${id}`, { method: 'DELETE' });
      await load();
      toast.success('Document deleted.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to delete document');
    }
  };

  const semanticSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!semanticQuery.trim()) return;
    setSearching(true); setError('');
    setKnowledgeAnswer(null);
    try {
      const result = await apiRequest<KnowledgeAskResult>('/knowledge/ask', {
        method: 'POST',
        body: JSON.stringify({ question: semanticQuery.trim(), k: 5 }),
      });
      setKnowledgeAnswer(result);
      setAskedQuery(semanticQuery.trim());
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
      <OpsStyles />
      <PageHeader
        eyebrow="Knowledge base"
        title="Documents & SOWs"
        description="Store team knowledge, contracts and statements of work indexed for AI search."
      />
      {error && <Alert variant="danger" title="Error">{error}</Alert>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div ref={editor.ref} className={cn(editor.className, 'h-full')}>
          <Card className="relative h-full overflow-hidden">
            <FormAccent />
            <CardHeader>
              <div>
                <h2 className="font-semibold text-semantic-text">{editingId ? 'Update document' : 'Add a document'}</h2>
                <p className="text-xs text-semantic-text-muted mt-0.5">Paste text content below; saved content becomes searchable by your workspace.</p>
              </div>
              {editingId && <Badge variant="warning">Editing</Badge>}
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
        </div>

        <div className="ops-rise h-full" style={{ animationDelay: '80ms' }}>
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-semantic-accent" />
                <div>
                  <h2 className="font-semibold text-semantic-text">Ask your documents</h2>
                  <p className="text-xs text-semantic-text-muted mt-0.5">Ask a question and get an answer grounded in saved documents and SOWs.</p>
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
                  {searching ? 'Asking…' : 'Ask with AI'}
                </Button>
              </form>
              {knowledgeAnswer && knowledgeAnswer.answer !== 'not found in documents' && (
                <div className="space-y-3">
                  <article className="ops-pop rounded-ui-xl border border-semantic-accent/20 bg-semantic-accent-soft/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-semantic-text">Answer</h3>
                      {knowledgeAnswer.degraded && <Badge variant="warning">Limited synthesis</Badge>}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-semantic-text">
                      {knowledgeAnswer.answer}
                    </p>
                  </article>
                  {knowledgeAnswer.citations.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-semantic-text-muted">Sources</p>
                      {knowledgeAnswer.citations.map((citation) => (
                        <div
                          key={citation.chunk_id}
                          className="rounded-ui-xl border border-semantic-border bg-semantic-surface p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-semantic-text">{citation.document_title}</p>
                            <Badge variant="ai">{Math.round(citation.relevance_score * 100)}% match</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {!searching && askedQuery && knowledgeAnswer?.answer === 'not found in documents' && (
                <Alert variant="info" title="No close matches found">Try another phrase.</Alert>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="ops-rise" style={{ animationDelay: '140ms' }}>
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
              filteredDocs.map((doc, index) => (
                <Card
                  key={doc.id}
                  className="ops-pop transition-all duration-200 hover:-translate-y-0.5 hover:shadow-ui-lg"
                  style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                >
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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Migration                                                           */
/* ------------------------------------------------------------------ */

export function MigrationPage() {
  const toast = useToast();
  const [jobs, setJobs] = useState<MigrationJob[]>([]);
  const [target, setTarget] = useState('leads');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<MigrationJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filterTarget, setFilterTarget] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const previewRef = useRef<HTMLDivElement>(null);

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

  // When a preview appears, bring it into view (it renders below the upload form).
  useEffect(() => {
    if (!preview) return;
    const id = requestAnimationFrame(() => scrollToElement(previewRef.current));
    return () => cancelAnimationFrame(id);
  }, [preview?.id]);

  const runDry = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setError('');
    const form = new FormData();
    form.append('target', target);
    form.append('file', file);
    try {
      setPreview(await apiRequest<MigrationJob>('/migration/dry-run', { method: 'POST', body: form }));
      await load();
      toast.info('CSV preview is ready. Review it before applying the import.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to preview import');
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
      toast.success(`Import completed: ${done.imported ?? 0} records imported.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to apply import');
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
      <OpsStyles />
      <PageHeader
        eyebrow="Data tools"
        title="Odoo Migration Center"
        description="Import company, contact or lead CSV exports with a validation preview."
      />
      {error && <Alert variant="danger" title="Error">{error}</Alert>}

      <div className="ops-rise">
        <Card className="relative overflow-hidden">
          <FormAccent />
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
      </div>

      {preview && (
        <div ref={previewRef} className="ops-rise scroll-mt-4">
          <Card className="shadow-ui-lg ring-1 ring-semantic-accent/20">
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
        </div>
      )}

      <div className="ops-rise" style={{ animationDelay: '80ms' }}>
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
              filteredJobs.map((job, index) => (
                <div
                  key={job.id}
                  className="ops-pop flex flex-wrap items-center justify-between gap-3 rounded-ui-xl border border-semantic-border bg-semantic-surface px-4 py-3 transition-all duration-200 hover:border-semantic-accent/40 hover:shadow-ui-sm"
                  style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                >
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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Workflows                                                           */
/* ------------------------------------------------------------------ */

const checkIcons: Record<string, ComponentType<{ className?: string }>> = {
  lead_qualification: Target,
  project_health: Activity,
  invoice_aging: Receipt,
};

export function WorkflowsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const canRunAgent = ['owner', 'sales', 'project_manager'].includes(user?.role || '');
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [leads, setLeads] = useState<{ id: string; title: string; status: string }[]>([]);
  const [leadId, setLeadId] = useState('');
  const [runningCheck, setRunningCheck] = useState('');
  const [error, setError] = useState('');
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
      const firstQuoteableLead = leadRows.find((lead) => (lead.status || 'open').toLowerCase() !== 'lost')?.id || '';
      setLeadId((current) => current || firstQuoteableLead);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load workflows');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const run = async (type: string) => {
    if (runningCheck) return;
    setRunningCheck(type); setError('');
    try {
      await apiRequest(`/workflows/${type}`, { method: 'POST' });
      await load();
      toast.success('Workflow completed and added to run history.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to run workflow');
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
    try {
      const result = await apiRequest<WorkflowRun>('/workflows/quote-agent/run', {
        method: 'POST',
        body: JSON.stringify({ lead_id: leadId }),
      });
      if (result.status === 'paused_for_approval') {
        setAiStatus('success');
        setAiResult({ status: 'paused_for_approval', message: 'The agent flagged the quote and sent it to the Approvals Inbox. No quote was saved before review.' });
        toast.info('Quote flagged and sent to the Approvals Inbox for review.');
      } else if (result.status === 'completed') {
        setAiStatus('success');
        setAiResult({ status: 'completed', message: 'The agent completed its checks and saved a draft quote for human review.', quoteId: result.result_data.quote_id });
        toast.success('Quote draft created for human review.');
      } else {
        throw new Error(result.result_data.error || `Workflow status: ${result.status}`);
      }
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unable to run quote agent';
      setAiStatus('error');
      setAiErrorMsg(msg);
      setError(msg);
      toast.error(msg);
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
      <OpsStyles />
      <PageHeader
        eyebrow="Automation"
        title="Agent Workflows"
        description="Run operational checks or prepare a quote with the AI agent."
      />
      {error && aiStatus !== 'error' && <Alert variant="danger" title="Error">{error}</Alert>}

      {canRunAgent && (
        <div className="ops-rise">
          <Card className="relative overflow-hidden border-semantic-accent/30 bg-gradient-to-br from-semantic-accent-soft via-semantic-surface to-white">
            <FormAccent />
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
                      <option value="">Choose a lead</option>
                      {leads.filter((lead) => (lead.status || 'open').toLowerCase() !== 'lost').map((lead) => (
                        <option key={lead.id} value={lead.id}>
                          {lead.title}{lead.status && lead.status !== 'open' ? ` · ${lead.status}` : ''}
                        </option>
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
                      <div className="ops-pop rounded-ui-xl border border-semantic-success/30 bg-semantic-success-soft/40 p-4">
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
        </div>
      )}

      <div className="ops-rise" style={{ animationDelay: '80ms' }}>
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
                const CheckIcon = checkIcons[type];
                return (
                  <Card
                    key={type}
                    className={cn(
                      'transition-all duration-200',
                      isDisabled
                        ? 'opacity-80'
                        : 'hover:-translate-y-0.5 hover:border-semantic-accent/40 hover:shadow-lg'
                    )}
                  >
                    <CardContent
                      className={cn('space-y-3', isDisabled ? 'cursor-not-allowed' : 'cursor-pointer')}
                      onClick={() => { if (!isDisabled) void run(type); }}
                    >
                      <div className="flex items-center gap-3">
                        {CheckIcon && (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-ui-xl bg-semantic-accent-soft text-semantic-accent">
                            <CheckIcon className="h-[18px] w-[18px]" />
                          </span>
                        )}
                        <h3 className="font-semibold text-semantic-text">{label}</h3>
                      </div>
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
      </div>

      <div className="ops-rise" style={{ animationDelay: '140ms' }}>
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
                  <details key={item.id} className="rounded-ui-xl border border-semantic-border bg-semantic-surface p-4 group transition-colors hover:border-semantic-accent/40">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
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
                    <div className="ops-pop mt-4 border-t border-semantic-border pt-4 space-y-4">
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
          <li key={step.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-semantic-surface-muted/50">
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

/* ------------------------------------------------------------------ */
/* Approvals                                                           */
/* ------------------------------------------------------------------ */

export function ApprovalsPage() {
  const toast = useToast();
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
      const decisionLabel = decision === 'approved' ? 'approved' : 'rejected';
      toast.success(`${entityLabel(item.entity_type)} ${decisionLabel}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to update approval');
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
      <OpsStyles />
      <PageHeader
        eyebrow="Human review"
        title="Approvals Inbox"
        description="Review time, expenses and quote drafts before they move forward."
        statChips={[{ label: 'Pending approvals', value: items.length, tone: 'warning' }]}
      />
      {error && <Alert variant="danger" title="Error">{error}</Alert>}

      <div className="ops-rise">
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
                          ? 'bg-semantic-accent text-white border-semantic-accent shadow-sm hover:bg-semantic-accent-hover'
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
              filteredItems.map((item, index) => {
                const itemKey = `${item.entity_type}-${item.id}`;
                const isPending = pending?.key === itemKey;
                return (
                <Card
                  key={itemKey}
                  className="ops-pop transition-all duration-200 hover:shadow-ui-lg"
                  style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                >
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
                            <span className="font-bold tabular-nums text-semantic-text">
                              {formatCurrency(quotePreviewTotalCents(item.quote_preview), item.quote_preview.currency || 'USD')}
                            </span>
                          </div>
                          <ul className="mt-3 divide-y divide-semantic-border">
                            {item.quote_preview.line_items?.map((line, lineIndex) => (
                              <li key={`${line.description}-${lineIndex}`} className="flex justify-between gap-3 py-2 text-sm">
                                <span>{line.quantity} × {line.description}</span>
                                <span className="whitespace-nowrap tabular-nums text-semantic-text-muted">
                                  {formatCurrency(line.quantity * line.unit_price_cents, item.quote_preview?.currency || 'USD')}
                                </span>
                              </li>
                            ))}
                          </ul>
                          {item.assumptions && item.assumptions.length > 0 && (
                            <div className="mt-3 border-t border-semantic-border pt-3">
                              <p className="text-[11px] font-bold uppercase tracking-wide text-semantic-warning">Draft assumptions</p>
                              <ul className="mt-1 list-disc pl-4 text-xs leading-5 text-semantic-text-muted space-y-0.5">
                                {item.assumptions.map((assumption, assumptionIndex) => (
                                  <li key={assumptionIndex}>{assumption}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                      {item.amount_cents != null && (
                        <p className="text-sm font-medium tabular-nums text-semantic-text">
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
    </div>
  );
}