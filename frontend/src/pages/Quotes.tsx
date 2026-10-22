import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Sparkles, FileText, Calendar, CheckCircle2, Trash2, ExternalLink, Edit3, Search, ArrowUp, ArrowDown, ArrowUpDown, Plus, CreditCard } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { Card, CardHeader, CardContent, CardFooter } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Alert } from '../components/ui/Alert';
import { EmptyState } from '../components/ui/EmptyState';
import AIProgress from '../components/ui/AIProgress';
import { AIGatewayBanner, type AIGatewayStatus } from '../components/ui/AIGatewayBanner';
import { useToast } from '../context/toast';
import { RequiredForm } from '../components/ui/RequiredForm';
import { useJobs, useJobForSubject } from '../context/JobsContext';
import {
  submitQuoteAgentJob,
  submitQuoteDraftJob,
} from '../lib/jobs';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function idempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type Lead = { id: string; title: string; status?: string };
type RateCard = { id: string; name: string; currency: string; default_rate_cents: number; description?: string | null };
type Quote = { id: string; title: string; status: string; currency: string; subtotal_cents: number; total_cents: number; accept_token: string; lead_id?: string | null; created_at?: string; accepted_at?: string | null; line_items: { id: string; description: string; quantity: number; amount_cents: number }[] };
type QuoteDraft = { quote: { id: string; title: string; description?: string | null; lead_id: string; rate_card_id?: string; currency: string; discount_bps: number; tax_bps: number; terms?: string | null; line_items: { description: string; quantity: number; unit_price_cents: number }[] }; assumptions: string[] };
const field = 'field-control';

/**
 * Smoothly scrolls an element into view. `scrollIntoView` works with whichever ancestor actually scrolls
 * (the app layout scrolls <main>, not the window, so window.scrollTo(...) had no effect).
 */
function scrollToElement(el: HTMLElement | null) {
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const quoteStyles = `
@keyframes quote-rise {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: none; }
}
@keyframes quote-pop {
  from { opacity: 0; transform: translateY(6px) scale(0.985); }
  to { opacity: 1; transform: none; }
}
@keyframes quote-flash {
  0% { box-shadow: 0 0 0 0 rgba(14, 165, 233, 0.55); }
  100% { box-shadow: 0 0 0 14px rgba(14, 165, 233, 0); }
}
.quote-rise { animation: quote-rise 520ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.quote-pop { animation: quote-pop 280ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.quote-flash { animation: quote-flash 1100ms ease-out 1; }
@media (prefers-reduced-motion: reduce) {
  .quote-rise, .quote-pop, .quote-flash { animation: none; }
}

.quote-cq { container-type: inline-size; }
.quote-form-grid { display: grid; gap: 1rem; grid-template-columns: minmax(0, 1fr); }
.quote-line-grid { grid-template-columns: minmax(0, 1fr); }
.quote-rate-grid { display: grid; gap: 0.75rem; grid-template-columns: minmax(0, 1fr); }
@container (min-width: 600px) {
  .quote-form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .quote-span-2, .quote-span-all { grid-column: 1 / -1; }
  .quote-line-grid { grid-template-columns: minmax(0, 2fr) 110px minmax(0, 1fr) auto; }
  .quote-rate-grid { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr); }
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
            className={cn(field, 'pl-9')}
          />
        </div>
      )}
      {filters.map((f) => (
        <label key={f.key} className={labelClass}>
          {f.label}
          <select className={`${field} mt-1`} value={f.value} onChange={(e) => f.onChange(e.target.value)}>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      ))}
      {sortOptions && onSortChange && (
        <label className={labelClass}>
          Sort by
          <select className={`${field} mt-1`} value={sortValue ?? ''} onChange={(e) => onSortChange(e.target.value)}>
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


export function Quotes() {
  const navigate = useNavigate();
  const toast = useToast();
  const { jobs, refreshJob, acknowledge } = useJobs();
  const [searchParams, setSearchParams] = useSearchParams();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [cards, setCards] = useState<RateCard[]>([]);
  const [editingId, setEditingId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [leadId, setLeadId] = useState('');
  const [cardId, setCardId] = useState('');
  const [lineItems, setLineItems] = useState([{ description: '', quantity: '1', price: '' }]);
  const [discount, setDiscount] = useState('0');
  const [tax, setTax] = useState('0');
  const [currency, setCurrency] = useState('USD');
  const [terms, setTerms] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const requestIntent = useRef(false);
  const agentIntent = useRef(false);
  const requestedJob = useRef('');
  const [editorFlash, setEditorFlash] = useState(false);

  const [search, setSearch] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string | string[]>>({ status: '', currency: '' });
  const [sortKey, setSortKey] = useState<string | null>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>('desc');
  const [view, setView] = useState<'quotes' | 'rates'>('quotes');

  const explicitJobId = searchParams.get('job');
  const explicitJob = explicitJobId ? jobs.get(explicitJobId) : undefined;
  const leadDraftJob = useJobForSubject('quote_draft', leadId);
  const leadAgentJob = useJobForSubject('quote_agent', leadId);
  const aiJob = explicitJob?.job_type === 'quote_draft' ? explicitJob : leadDraftJob;
  const agentJob = explicitJob?.job_type === 'quote_agent' ? explicitJob : leadAgentJob;
  const aiBusy = Boolean(aiJob && ['queued', 'running'].includes(aiJob.status));
  const agentBusy = Boolean(agentJob && ['queued', 'running', 'waiting_for_approval'].includes(agentJob.status));
  const aiError = aiJob?.status === 'failed' ? (aiJob.error_message || 'AI quote drafting failed.') : '';
  const agentError = agentJob?.status === 'failed' ? (agentJob.error_message || 'Quote agent failed.') : '';
  const aiPreview = aiJob?.status === 'completed' && aiJob.result?.quote
    ? {
        quote: aiJob.result.quote,
        assumptions: aiJob.result.assumptions || [],
      }
    : null;
  const agentStatus = agentJob?.status === 'waiting_for_approval'
    ? agentJob.message
    : agentJob?.status === 'completed'
      ? 'Quote agent completed its review.'
      : '';
  const aiGatewayStatus: AIGatewayStatus = aiBusy
    ? 'generating'
    : aiError
      ? 'error'
      : aiPreview && (aiJob?.result?.is_degraded || ['ollama', 'mock'].includes(aiJob?.result?.provider || ''))
        ? 'degraded'
        : 'idle';
  const aiAttempt = { current: 1, total: 1 };
  const aiProvider = aiJob?.result?.provider || 'auto';
  const aiModel = '';

  // Scroll targets
  const editorRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<HTMLDivElement>(null);

  const quoteableLeads = useMemo(
    () => leads.filter((lead) => (lead.status || 'open').toLowerCase() !== 'lost'),
    [leads]
  );

  const load = useCallback(async () => {
    setError('');
    try {
      const [q, l, c] = await Promise.all([
        apiRequest<Quote[]>('/quotes'),
        apiRequest<Lead[]>('/crm/leads'),
        apiRequest<RateCard[]>('/quotes/rate-cards'),
      ]);
      setQuotes(q);
      setLeads(l);
      setCards(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load quotes');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!explicitJobId) return;
    if (explicitJob) {
      if (explicitJob.subject_id) setLeadId(explicitJob.subject_id);
      return;
    }
    if (requestedJob.current === explicitJobId) return;
    requestedJob.current = explicitJobId;
    void refreshJob(explicitJobId, '/quotes')
      .then((job) => {
        if (job.subject_id) setLeadId(job.subject_id);
      })
      .catch((jobError: unknown) => {
        toast.error(jobError instanceof Error ? jobError.message : 'Could not load this background job.');
      });
  }, [explicitJob, explicitJobId, refreshJob, toast]);
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  // When a PDF preview opens, bring it into view automatically (no manual scrolling to the bottom).
  useEffect(() => {
    if (!pdfUrl) return;
    const id = requestAnimationFrame(() => scrollToElement(pdfRef.current));
    return () => cancelAnimationFrame(id);
  }, [pdfUrl]);

  const scrollToEditor = useCallback(() => {
    scrollToElement(editorRef.current);
    setEditorFlash(true);
    window.setTimeout(() => setEditorFlash(false), 1200);
  }, []);

  // Jump straight to the Rate cards tab (they used to be hidden at the very bottom of the page).
  const openRateCards = () => {
    setView('rates');
    requestAnimationFrame(() => scrollToElement(listRef.current));
  };

  const chooseCard = (id: string) => {
    setCardId(id);
    const card = cards.find((item) => item.id === id);
    if (card) {
      setCurrency(card.currency);
      setLineItems((items) =>
        items.map((item, index) =>
          index === 0 && !item.price ? { ...item, price: (card.default_rate_cents / 100).toFixed(2) } : item
        )
      );
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const isEditing = Boolean(editingId);
      await apiRequest(editingId ? `/quotes/${editingId}` : '/quotes', {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify({
          title,
          description: description || null,
          lead_id: leadId || null,
          rate_card_id: cardId || null,
          currency,
          discount_bps: Math.round(Number(discount) * 100),
          tax_bps: Math.round(Number(tax) * 100),
          terms: terms || null,
          line_items: lineItems.map((line) => ({
            description: line.description,
            quantity: Number(line.quantity),
            unit_price_cents: Math.round(Number(line.price) * 100),
            rate_card_id: cardId || null,
          })),
        }),
      });
      resetEditor();
      await load();
      toast.success(isEditing ? 'Quote updated.' : 'Quote created.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save quote');
    } finally {
      setBusy(false);
    }
  };

  const resetEditor = () => {
    if (aiJob && aiPreview) {
      void acknowledge(aiJob.id).catch((ackError: unknown) => {
        toast.error(ackError instanceof Error ? ackError.message : 'Could not dismiss this job.');
      });
    }
    setEditingId('');
    setAssumptions([]);
    setTitle('');
    setDescription('');
    setLeadId('');
    setCardId('');
    setLineItems([{ description: '', quantity: '1', price: '' }]);
    setTerms('');
    setDiscount('0');
    setTax('0');
  };

  const applyAiPreview = async () => {
    if (!aiPreview) return;
    const quote = aiPreview.quote;
    setEditingId(quote.id);
    setTitle(quote.title);
    setDescription(quote.description || '');
    setLeadId(quote.lead_id);
    setCardId(quote.rate_card_id || '');
    setCurrency(quote.currency);
    setDiscount(String(quote.discount_bps / 100));
    setTax(String(quote.tax_bps / 100));
    setTerms(quote.terms || '');
    setLineItems(
      quote.line_items.map((line) => ({
        description: line.description,
        quantity: String(line.quantity),
        price: (line.unit_price_cents / 100).toFixed(2),
      }))
    );
    setAssumptions(aiPreview.assumptions);
    void load();
    if (aiJob) {
      try {
        await acknowledge(aiJob.id);
      } catch (ackError) {
        toast.error(ackError instanceof Error ? ackError.message : 'Could not dismiss this job.');
      }
    }
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('job');
      return next;
    }, { replace: true });
  };

  const discardAiPreview = async () => {
    if (aiJob) {
      try {
        await acknowledge(aiJob.id);
      } catch (ackError) {
        toast.error(ackError instanceof Error ? ackError.message : 'Could not dismiss this job.');
      }
    }
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('job');
      return next;
    }, { replace: true });
  };

  const draftWithAI = async () => {
    if (requestIntent.current || aiBusy) return;
    if (!leadId) {
      setError('Choose a lead before drafting a quote with AI.');
      return;
    }
    const selected = leads.find((lead) => lead.id === leadId);
    if ((selected?.status || '').toLowerCase() === 'lost') {
      setError('Quotes cannot be drafted for lost leads. Choose an open or won lead.');
      return;
    }
    requestIntent.current = true;
    setError('');
    try {
      const submission = await submitQuoteDraftJob({
        lead_id: leadId,
        rate_card_id: cardId || null,
        title: title || null,
        description: description || null,
        currency,
        discount_bps: Math.round(Number(discount) * 100),
        tax_bps: Math.round(Number(tax) * 100),
        terms: terms || null,
        line_items: lineItems
          .filter((line) => line.description.trim())
          .map((line) => ({
            description: line.description,
            quantity: Number(line.quantity),
            unit_price_cents: line.price ? Math.round(Number(line.price) * 100) : null,
          })),
      }, idempotencyKey());
      await refreshJob(submission.job_id, '/quotes');
      setSearchParams({ job: submission.job_id }, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not submit quote drafting job';
      setError(message);
      toast.error(message);
    } finally {
      requestIntent.current = false;
    }
  };

  const runQuoteAgent = async () => {
    if (agentIntent.current || agentBusy) return;
    if (!leadId) {
      setError('Choose a lead before starting the quote agent.');
      return;
    }
    const selected = leads.find((lead) => lead.id === leadId);
    if ((selected?.status || '').toLowerCase() === 'lost') {
      setError('Quotes cannot be drafted for lost leads. Choose an open or won lead.');
      return;
    }
    agentIntent.current = true;
    setError('');
    try {
      const submission = await submitQuoteAgentJob({
        lead_id: leadId,
        rate_card_id: cardId || null,
        title: title || null,
        description: description || null,
        currency,
        discount_bps: Math.round(Number(discount) * 100),
        tax_bps: Math.round(Number(tax) * 100),
        terms: terms || null,
        line_items: lineItems
          .filter((line) => line.description.trim())
          .map((line) => ({
            description: line.description,
            quantity: Number(line.quantity),
            unit_price_cents: line.price ? Math.round(Number(line.price) * 100) : null,
          })),
      }, idempotencyKey());
      await refreshJob(submission.job_id, '/quotes');
      setSearchParams({ job: submission.job_id }, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not submit quote agent job';
      setError(message);
      toast.error(message);
    } finally {
      agentIntent.current = false;
    }
  };

  const showPdf = async (id: string) => {
    setError('');
    try {
      const token = localStorage.getItem('opspilot_token');
      const orgId = localStorage.getItem('opspilot_org_id');
      const response = await fetch(`/api/v1/quotes/${id}/pdf`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(orgId ? { 'X-Org-ID': orgId } : {}),
        },
      });
      if (!response.ok) throw new Error('Unable to create quote PDF');
      const next = URL.createObjectURL(await response.blob());
      setPdfUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return next;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to open PDF');
    }
  };

  const copyAcceptance = async (quote: Quote) => {
    const url = `${window.location.origin}/quote-accept/${quote.accept_token}`;
    const copyWithFallback = () => {
      const input = document.createElement('textarea');
      input.value = url;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      input.setSelectionRange(0, input.value.length);
      try {
        if (!document.execCommand('copy')) {
          throw new Error('Browser could not copy the acceptance link');
        }
      } finally {
        input.remove();
      }
    };

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        copyWithFallback();
      }
      toast.success('Acceptance link copied to clipboard.');
    } catch {
      try {
        copyWithFallback();
        toast.success('Acceptance link copied to clipboard.');
      } catch {
        toast.error(`Could not copy the link. Copy it manually: ${url}`);
      }
    }
  };

  const editQuote = async (id: string) => {
    setError('');
    try {
      const quote = await apiRequest<QuoteDraft['quote']>(`/quotes/${id}`);
      setEditingId(id);
      setTitle(quote.title);
      setDescription(quote.description || '');
      setLeadId(quote.lead_id || '');
      setCardId(quote.rate_card_id || '');
      setCurrency(quote.currency);
      setDiscount(String(quote.discount_bps / 100));
      setTax(String(quote.tax_bps / 100));
      setTerms(quote.terms || '');
      setAssumptions([]);
      setAiPreview(null);
      setLineItems(
        quote.line_items.map((line) => ({
          description: line.description,
          quantity: String(line.quantity),
          price: (line.unit_price_cents / 100).toFixed(2),
        }))
      );
      // Fix: scroll the editor into view (works with the layout's scrolling <main>).
      scrollToEditor();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load quote for editing');
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this quote? This cannot be undone.')) return;
    try {
      await apiRequest(`/quotes/${id}`, { method: 'DELETE' });
      await load();
      toast.success('Quote deleted.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete quote');
    }
  };

  const scrollToForm = () => {
    scrollToElement(editorRef.current);
  };

  const closePdf = () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl('');
    // Return to the saved quotes list after closing the preview.
    requestAnimationFrame(() => scrollToElement(listRef.current));
  };

  const formatCurrency = (amountCents: number, curr: string) => {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: curr }).format(amountCents / 100);
    } catch {
      return `${curr} ${(amountCents / 100).toFixed(2)}`;
    }
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const leadLookup = useMemo(() => {
    const m: Record<string, Lead> = {};
    leads.forEach((l) => { m[l.id] = l; });
    return m;
  }, [leads]);

  const statusBadgeVariant = (s: string): 'success' | 'warning' | 'danger' | 'muted' => {
    switch (s) {
      case 'accepted': return 'success';
      case 'draft': return 'muted';
      case 'void': return 'danger';
      default: return 'muted';
    }
  };

  const aiSteps = [
    'Reading lead details…',
    'Checking selected rate card…',
    'Searching workspace knowledge…',
    'Drafting line items…',
    'Calculating totals and discount…',
  ];

  const agentSteps = [
    'Reading lead + SOW…',
    'Checking rate card…',
    'Drafting line items…',
    'Validating totals…',
    'Checking for approval flags…',
  ];

  const showAiProgress = aiBusy || !!aiPreview || aiError;
  const showAgentProgress = agentBusy || (agentStatus && !agentBusy) || agentError;

  const currencies = useMemo(() => {
    const s = new Set<string>();
    quotes.forEach((q) => s.add(q.currency));
    cards.forEach((c) => s.add(c.currency));
    return Array.from(s);
  }, [quotes, cards]);

  const filteredQuotes = useMemo(() => {
    let rows = [...quotes];
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      rows = rows.filter((r) => {
        const leadTitle = r.lead_id ? leadLookup[r.lead_id]?.title?.toLowerCase() || '' : '';
        return (
          r.title.toLowerCase().includes(q) ||
          leadTitle.includes(q)
        );
      });
    }
    const statusF = filterValues['status'];
    if (typeof statusF === 'string' && statusF) {
      rows = rows.filter((r) => r.status === statusF);
    }
    const curF = filterValues['currency'];
    if (typeof curF === 'string' && curF) {
      rows = rows.filter((r) => r.currency === curF);
    }
    if (sortKey) {
      rows.sort((a, b) => {
        let av: string | number = '';
        let bv: string | number = '';
        if (sortKey === 'created_at') {
          av = a.created_at ? new Date(a.created_at).getTime() : 0;
          bv = b.created_at ? new Date(b.created_at).getTime() : 0;
        } else if (sortKey === 'total_cents') {
          av = a.total_cents;
          bv = b.total_cents;
        } else if (sortKey === 'status') {
          av = a.status;
          bv = b.status;
        }
        if (av < bv) return sortDir === 'asc' ? -1 : 1;
        if (av > bv) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return rows;
  }, [quotes, search, filterValues, sortKey, sortDir, leadLookup]);

  const statusFilter = filterValues['status'];
  const currencyFilter = filterValues['currency'];
  const toolbarFilters: ToolbarFilter[] = [
    {
      key: 'status',
      label: 'Status',
      value: typeof statusFilter === 'string' ? statusFilter : '',
      onChange: (v) => setFilterValues((prev) => ({ ...prev, status: v })),
      options: [
        { value: '', label: 'All statuses' },
        { value: 'draft', label: 'Draft' },
        { value: 'accepted', label: 'Accepted' },
        { value: 'void', label: 'Void' },
      ],
    },
    {
      key: 'currency',
      label: 'Currency',
      value: typeof currencyFilter === 'string' ? currencyFilter : '',
      onChange: (v) => setFilterValues((prev) => ({ ...prev, currency: v })),
      options: [{ value: '', label: 'All currencies' }, ...currencies.map((c) => ({ value: c, label: c }))],
    },
  ];

  // Header click cycles desc -> asc -> default (same behaviour as before).
  const handleSortChange = (key: string) => {
    if (sortKey === key) {
      if (sortDir === 'desc') setSortDir('asc');
      else if (sortDir === 'asc') { setSortKey(null); setSortDir(null); }
      else setSortDir('desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  // Sort dropdown (works on narrow layouts where there are no column headers).
  const sortOptions = [
    { value: '', label: 'Default order' },
    { value: 'created_at:desc', label: 'Newest first' },
    { value: 'created_at:asc', label: 'Oldest first' },
    { value: 'total_cents:desc', label: 'Highest total' },
    { value: 'total_cents:asc', label: 'Lowest total' },
  ];
  const sortSelectValue = sortKey && sortDir ? `${sortKey}:${sortDir}` : '';
  const handleSortSelect = (value: string) => {
    if (!value) { setSortKey(null); setSortDir(null); return; }
    const [key, dir] = value.split(':');
    setSortKey(key);
    setSortDir(dir === 'asc' ? 'asc' : 'desc');
  };

  const columns: GridColumn<Quote>[] = [
    {
      key: 'title',
      header: 'Quote',
      track: 'minmax(0, 2.6fr)',
      role: 'primary',
      render: (row) => {
        const lead = row.lead_id ? leadLookup[row.lead_id] : null;
        const summary = row.line_items.map((l) => l.description).join(' · ');
        return (
          <div className="min-w-0">
            <div className="line-clamp-2 break-words font-semibold text-semantic-text">{row.title}</div>
            {summary && <div className="mt-0.5 line-clamp-1 text-xs text-semantic-text-muted">{summary}</div>}
            {lead && (
              <Link
                to="/crm"
                onClick={(e) => e.stopPropagation()}
                className="mt-1.5 inline-flex max-w-full items-center gap-1 text-xs font-medium text-semantic-accent hover:underline"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span className="truncate">{lead.title}</span>
              </Link>
            )}
          </div>
        );
      },
    },
    {
      key: 'created_at',
      header: 'Created',
      track: 'minmax(0, 1fr)',
      sortKey: 'created_at',
      render: (row) => (
        <div className="min-w-0 text-sm">
          <div className="inline-flex items-center gap-1.5 text-semantic-text">
            <Calendar className="h-3.5 w-3.5 shrink-0 text-semantic-text-muted" />
            <span>{formatDate(row.created_at) ?? '—'}</span>
          </div>
          {row.status === 'accepted' && row.accepted_at && (
            <div className="mt-1 flex items-center gap-1 text-xs font-medium text-semantic-success">
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              <span>Accepted {formatDate(row.accepted_at)}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'total_cents',
      header: 'Total',
      track: 'minmax(0, 1fr)',
      align: 'right',
      sortKey: 'total_cents',
      render: (row) => (
        <div className="rgrid-end">
          <span className="font-bold tabular-nums text-semantic-text">{formatCurrency(row.total_cents, row.currency)}</span>
          <Badge variant={statusBadgeVariant(row.status)}>{row.status}</Badge>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      track: '204px',
      role: 'actions',
      align: 'right',
      render: (row) => (
        <div className="rgrid-actions" onClick={(e) => e.stopPropagation()}>
          {row.status === 'draft' && (
            <Button variant="ghost" size="sm" onClick={() => void editQuote(row.id)}>
              <Edit3 className="w-3.5 h-3.5" /> Edit
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void showPdf(row.id)}>
            <FileText className="w-3.5 h-3.5" /> PDF
          </Button>
          {row.status !== 'accepted' && (
            <Button variant="outline" size="sm" onClick={() => void copyAcceptance(row)}>
              Accept link
            </Button>
          )}
          {row.status !== 'accepted' && (
            <Button variant="ghost" size="sm" aria-label="Delete quote" onClick={() => void remove(row.id)}>
              <Trash2 className="w-3.5 h-3.5 text-semantic-danger" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const aiDraftPreview = aiPreview ? (
    <Card className="quote-pop !bg-semantic-accent-soft dark:!bg-indigo-950/30 !border-semantic-accent/40">
      <CardHeader className="!border-semantic-accent/20">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-semantic-accent" />
          <span className="font-bold text-sm text-semantic-text">
            AI draft — review before saving. Nothing saved yet.
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-semantic-text-muted font-semibold mb-1">Title</div>
            <div className="text-sm font-semibold text-semantic-text">{aiPreview.quote.title}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-semantic-text-muted font-semibold mb-1">Currency</div>
            <div className="text-sm text-semantic-text">{aiPreview.quote.currency}</div>
          </div>
          {aiPreview.quote.description && (
            <div className="sm:col-span-2">
              <div className="text-[11px] uppercase tracking-wider text-semantic-text-muted font-semibold mb-1">Description</div>
              <div className="text-sm text-semantic-text whitespace-pre-wrap">{aiPreview.quote.description}</div>
            </div>
          )}
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wider text-semantic-text-muted font-semibold mb-2">Line items</div>
          <div className="rounded-ui-xl border border-semantic-accent/20 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-semantic-surface-muted/60 text-[11px] uppercase tracking-wider text-semantic-text-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Description</th>
                  <th className="px-3 py-2 text-right font-semibold">Qty</th>
                  <th className="px-3 py-2 text-right font-semibold">Unit price</th>
                  <th className="px-3 py-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-semantic-accent/10">
                {aiPreview.quote.line_items.map((l, i) => {
                  const amt = l.quantity * l.unit_price_cents;
                  return (
                    <tr key={i} className="transition-colors hover:bg-semantic-surface/50">
                      <td className="px-3 py-2 text-semantic-text">{l.description}</td>
                      <td className="px-3 py-2 text-right text-semantic-text">{l.quantity}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-semantic-text">{formatCurrency(l.unit_price_cents, aiPreview.quote.currency)}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-semantic-text">{formatCurrency(amt, aiPreview.quote.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-semantic-text-muted font-semibold mb-1">Discount</div>
            <div className="text-sm text-semantic-text">{(aiPreview.quote.discount_bps / 100).toFixed(2)}%</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-semantic-text-muted font-semibold mb-1">Tax</div>
            <div className="text-sm text-semantic-text">{(aiPreview.quote.tax_bps / 100).toFixed(2)}%</div>
          </div>
        </div>

        {aiPreview.quote.terms && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-semantic-text-muted font-semibold mb-1">Terms</div>
            <div className="text-sm text-semantic-text whitespace-pre-wrap">{aiPreview.quote.terms}</div>
          </div>
        )}

        {aiPreview.assumptions.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-semantic-text-muted font-semibold mb-2">Assumptions</div>
            <ul className="list-disc pl-5 space-y-1 text-sm text-semantic-text">
              {aiPreview.assumptions.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </div>
        )}
      </CardContent>
      <CardFooter className="!border-semantic-accent/20">
        <span className="text-xs text-semantic-text-muted">
          This is a preview only. Click below to populate the editor or discard.
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAiPreview(null)}>Discard</Button>
          <Button variant="primary" size="sm" onClick={applyAiPreview}>Use this draft →</Button>
        </div>
      </CardFooter>
    </Card>
  ) : null;

  const agentResultBanner = agentStatus ? (
    <div className="space-y-2">
      <p className="text-sm text-semantic-text font-medium">{agentStatus}</p>
      {agentStatus.includes('Approvals Inbox') && (
        <Button variant="primary" size="sm" onClick={() => navigate('/approvals')}>
          Review approval
        </Button>
      )}
    </div>
  ) : null;

  return (
    <div className="page-shell space-y-6">
      <style>{quoteStyles}</style>

      <PageHeader
        eyebrow="Sales workspace"
        title="Quotes & Proposals"
        description="Build a quote from your pipeline, use AI to prepare a reviewable draft, then preview and share it when you're ready."
        primaryAction={
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={scrollToEditor}>
              <Plus className="h-4 w-4" /> New quote
            </Button>
            <Button variant="outline" size="sm" onClick={openRateCards}>
              <CreditCard className="h-4 w-4" /> Rate cards
            </Button>
          </div>
        }
        statChips={[
          { label: 'Saved quotes', value: quotes.length, tone: 'accent' },
          { label: 'Rate cards', value: cards.length, tone: 'accent' },
          { label: 'AI drafts stay in your control', value: 'Human-reviewed only', tone: 'muted' },
        ]}
      />

      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      {agentStatus && !agentBusy && (
        <Alert variant="success">
          <div className="flex flex-wrap items-center justify-between gap-3 w-full">
            <span>{agentStatus}</span>
            {agentStatus.includes('Approvals Inbox') && (
              <Button variant="primary" size="sm" onClick={() => navigate('/approvals')}>
                Review approval
              </Button>
            )}
          </div>
        </Alert>
      )}

      {/* Editor (scroll target for Edit / empty-state "Create quote") */}
      <div
        id="quote-editor-form"
        ref={editorRef}
        className={cn('quote-rise quote-cq scroll-mt-4 rounded-ui-2xl', editorFlash && 'quote-flash')}
      >
        <Card className="relative overflow-hidden">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 opacity-80"
          />
          <CardHeader>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[.16em] text-semantic-accent">Quote editor</p>
              <h2 className="mt-1 text-lg font-bold text-semantic-text">
                {editingId ? 'Review AI draft' : 'Create a quote'}
              </h2>
              <p className="mt-1 text-sm text-semantic-text-muted">
                Enter the proposal details and line items. Prices are entered per unit.
              </p>
            </div>
            <Badge variant="muted">Draft</Badge>
          </CardHeader>

          {(showAiProgress || showAgentProgress || aiGatewayStatus !== 'idle') && (
            <div className="px-5 sm:px-6 pt-4 pb-2 space-y-4">
              {aiGatewayStatus !== 'idle' && (
                <AIGatewayBanner
                  status={aiGatewayStatus}
                  attempt={aiAttempt}
                  providerName={aiProvider}
                  modelName={aiModel}
                  errorMessage={aiError}
                  onRetry={() => void draftWithAI()}
                />
              )}
              {showAiProgress && (
                <AIProgress
                  steps={aiSteps}
                  status={aiBusy ? 'running' : aiPreview ? 'success' : 'error'}
                  title={aiBusy ? 'Drafting with AI…' : aiPreview ? 'AI draft ready for review' : 'Draft failed'}
                  autoAdvanceMs={7000}
                  errorMessage={aiError || undefined}
                  onRetry={aiError ? () => void draftWithAI() : undefined}
                  resultPreview={aiDraftPreview}
                />
              )}
              {showAgentProgress && (
                <AIProgress
                  steps={agentSteps}
                  status={agentBusy ? 'running' : agentError ? 'error' : 'success'}
                  title={agentBusy ? 'Quote agent running…' : agentError ? 'Quote agent failed' : 'Quote agent complete'}
                  autoAdvanceMs={7000}
                  errorMessage={agentError || undefined}
                  onRetry={agentError ? () => void runQuoteAgent() : undefined}
                  resultPreview={agentResultBanner}
                />
              )}
            </div>
          )}

          <CardContent>
            {assumptions.length > 0 && (
              <div className="quote-pop mb-5 rounded-ui-xl border border-semantic-warning/30 bg-semantic-warning-soft p-4 text-sm text-semantic-warning">
                <p className="font-semibold">AI assumptions — review before saving</p>
                <ul className="mt-2 list-disc pl-5 space-y-0.5">
                  {assumptions.map((item, index) => <li key={index}>{item}</li>)}
                </ul>
              </div>
            )}

            <RequiredForm onSubmit={(e) => void submit(e)} className="quote-form-grid">
              <label className="text-xs font-semibold text-semantic-text-muted">
                Proposal title
                <input
                  required
                  className={`${field} mt-1.5`}
                  placeholder="e.g. Website implementation"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="text-xs font-semibold text-semantic-text-muted quote-span-2">
                Proposal description
                <textarea
                  className={`${field} mt-1.5`}
                  rows={2}
                  placeholder="Describe the requested outcome and scope"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <label className="text-xs font-semibold text-semantic-text-muted">
                Link to lead
                <select
                  className={`${field} mt-1.5`}
                  value={leadId}
                  onChange={(e) => setLeadId(e.target.value)}
                >
                  <option value="">Choose a lead (optional)</option>
                  {quoteableLeads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}{l.status && l.status !== 'open' ? ` · ${l.status}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-semantic-text-muted">
                <span className="flex items-center justify-between gap-2">
                  <span>Rate card</span>
                  <button
                    type="button"
                    onClick={openRateCards}
                    className="font-semibold text-semantic-accent hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-border"
                  >
                    Manage rate cards
                  </button>
                </span>
                <select
                  className={`${field} mt-1.5`}
                  value={cardId}
                  onChange={(e) => chooseCard(e.target.value)}
                >
                  <option value="">No rate card</option>
                  {cards.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.currency}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-semantic-text-muted">
                Currency
                <select
                  className={`${field} mt-1.5`}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option>USD</option>
                  <option>EUR</option>
                  <option>INR</option>
                  <option>GBP</option>
                </select>
              </label>
              <div className="space-y-3 quote-span-2">
                <p className="text-xs font-bold uppercase tracking-wider text-semantic-text-muted">Line items</p>
                {lineItems.map((line, index) => (
                  <div
                    key={index}
                    className="quote-pop grid items-end gap-3 rounded-ui-xl border border-semantic-border bg-semantic-surface-muted/40 p-3 transition-all duration-200 hover:border-semantic-accent/40 hover:bg-semantic-surface-muted/70 focus-within:border-semantic-accent/50 focus-within:shadow-ui-sm quote-line-grid"
                  >
                    <label className="text-xs font-semibold text-semantic-text-muted">
                      Description
                      <input
                        required
                        className={`${field} mt-1.5`}
                        placeholder="What are you quoting?"
                        value={line.description}
                        onChange={(e) =>
                          setLineItems((items) =>
                            items.map((item, i) =>
                              i === index ? { ...item, description: e.target.value } : item
                            )
                          )
                        }
                      />
                    </label>
                    <label className="text-xs font-semibold text-semantic-text-muted">
                      Quantity
                      <input
                        required
                        min="1"
                        type="number"
                        className={`${field} mt-1.5`}
                        aria-label={`Quantity for item ${index + 1}`}
                        value={line.quantity}
                        onChange={(e) =>
                          setLineItems((items) =>
                            items.map((item, i) =>
                              i === index ? { ...item, quantity: e.target.value } : item
                            )
                          )
                        }
                      />
                    </label>
                    <label className="text-xs font-semibold text-semantic-text-muted">
                      Unit price ({currency})
                      <input
                        required
                        min="0"
                        step="0.01"
                        type="number"
                        className={`${field} mt-1.5`}
                        placeholder="0.00"
                        value={line.price}
                        onChange={(e) =>
                          setLineItems((items) =>
                            items.map((item, i) =>
                              i === index ? { ...item, price: e.target.value } : item
                            )
                          )
                        }
                      />
                    </label>
                    {lineItems.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove item ${index + 1}`}
                        className="text-semantic-danger hover:bg-semantic-danger-soft hover:text-semantic-danger"
                        onClick={() =>
                          setLineItems((items) => items.filter((_, i) => i !== index))
                        }
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-semantic-accent hover:bg-semantic-accent-soft"
                    onClick={() =>
                      setLineItems((items) => [...items, { description: '', quantity: '1', price: '' }])
                    }
                  >
                    + Add line item
                  </Button>
                </div>
              </div>
              <label className="text-xs text-semantic-text-muted">
                Discount (%)
                <input
                  min="0"
                  max="100"
                  step="0.01"
                  type="number"
                  className={`${field} mt-1`}
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </label>
              <label className="text-xs text-semantic-text-muted">
                Tax (%)
                <input
                  min="0"
                  max="100"
                  step="0.01"
                  type="number"
                  className={`${field} mt-1`}
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                />
              </label>
              <label className="text-xs font-semibold text-semantic-text-muted quote-span-2">
                Terms and notes
                <textarea
                  className={`${field} mt-1.5`}
                  rows={3}
                  placeholder="Add payment terms or scope notes"
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-semantic-border pt-4 quote-span-2">
                <span className="text-xs text-semantic-text-muted">
                  Prices are saved in cents. AI output always requires human review.
                </span>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    loading={aiBusy}
                    disabled={busy || agentBusy || !leadId}
                    onClick={() => void draftWithAI()}
                  >
                    {aiBusy ? 'Drafting…' : 'Draft with AI'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    loading={agentBusy}
                    disabled={!leadId || aiBusy || busy}
                    onClick={() => void runQuoteAgent()}
                  >
                    <Sparkles className="w-4 h-4" />
                    {agentBusy ? 'Reviewing…' : 'Run quote agent'}
                  </Button>
                  {editingId && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={resetEditor}
                    >
                      Cancel review
                    </Button>
                  )}
                  <Button type="submit" variant="primary" loading={busy}>
                    {busy ? 'Saving…' : editingId ? 'Save reviewed draft' : 'Create quote'}
                  </Button>
                </div>
              </div>
            </RequiredForm>
          </CardContent>
        </Card>
      </div>

      {/* Saved quotes + Rate cards. Tabs keep rate cards one click away instead of buried at the bottom. */}
      <div ref={listRef} className="quote-rise scroll-mt-4 space-y-4" style={{ animationDelay: '80ms' }}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-semantic-text">
              {view === 'quotes' ? 'Saved quotes' : 'Rate cards'}
            </h2>
            <p className="mt-0.5 text-xs text-semantic-text-muted">
              {view === 'quotes'
                ? `${quotes.length} proposals in this workspace`
                : `${cards.length} rate cards available when building quotes`}
            </p>
          </div>
          <div
            role="tablist"
            aria-label="Quotes sections"
            className="inline-flex rounded-ui-xl border border-semantic-border bg-semantic-surface-muted/60 p-1"
          >
            {([
              ['quotes', 'Saved quotes', quotes.length],
              ['rates', 'Rate cards', cards.length],
            ] as const).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={view === id}
                onClick={() => setView(id)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-ui-lg px-3.5 py-1.5 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-border',
                  view === id
                    ? 'bg-semantic-surface text-semantic-text shadow-ui-sm'
                    : 'text-semantic-text-muted hover:text-semantic-text'
                )}
              >
                {label}
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] tabular-nums',
                    view === id
                      ? 'bg-semantic-accent-soft text-semantic-accent'
                      : 'bg-semantic-surface text-semantic-text-muted'
                  )}
                >
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {view === 'quotes' ? (
          <ResponsiveGrid<Quote>
            columns={columns}
            rows={filteredQuotes}
            rowKey={(r) => r.id}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSortChange}
            toolbar={
              <GridToolbar
                search={search}
                onSearch={setSearch}
                searchPlaceholder="Search by title or client…"
                filters={toolbarFilters}
                sortValue={sortSelectValue}
                sortOptions={sortOptions}
                onSortChange={handleSortSelect}
              />
            }
            footer={`Showing ${filteredQuotes.length} of ${quotes.length} quotes`}
            emptyState={
              <EmptyState
                title="No quotes yet"
                description="Create your first proposal above."
                action={
                  <Button variant="primary" onClick={scrollToForm}>Create quote</Button>
                }
              />
            }
          />
        ) : (
          <RateCardForm cards={cards} onCreated={async () => { await load(); }} />
        )}
      </div>

      {/* PDF preview: auto-scrolled into view when opened */}
      {pdfUrl && (
        <div ref={pdfRef} className="quote-rise scroll-mt-4">
          <Card className="overflow-hidden shadow-ui-lg ring-1 ring-semantic-accent/20">
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-semantic-accent" />
                <h2 className="font-semibold text-semantic-text">PDF preview</h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={closePdf}
              >
                Close preview
              </Button>
            </CardHeader>
            <div className="px-0 pb-0">
              <iframe
                title="Quote PDF preview"
                src={pdfUrl}
                className="h-[70vh] min-h-[480px] w-full border-t border-semantic-border bg-semantic-surface-muted"
              />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export function QuoteAcceptance() {
  const { token } = useParams();
  const toast = useToast();
  const [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState('Review this proposal, then confirm below to accept it.');
  const [busy, setBusy] = useState(false);
  const accept = async () => {
    if (!token) {
      setMessage('This acceptance link is invalid.');
      return;
    }
    setBusy(true);
    try {
      const result = await apiRequest<{ status: string }>('/quotes/accept/' + encodeURIComponent(token));
      setAccepted(result.status === 'accepted');
      setMessage(result.status === 'accepted' ? 'Quote accepted. Thank you.' : `Quote status: ${result.status}`);
      if (result.status === 'accepted') toast.success('Quote accepted. Thank you.');
      else toast.warning(`Quote was not accepted; current status is ${result.status}.`);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'This quote could not be accepted.';
      setMessage(errorMessage);
      toast.error(errorMessage);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-semantic-surface-muted via-semantic-surface to-semantic-accent-soft p-6">
      <style>{quoteStyles}</style>
      <Card className="quote-rise w-full max-w-lg text-center shadow-ui-lg">
        <CardContent className="pt-8">
          <div
            className={cn(
              'quote-pop mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-xl ring-8 transition-colors',
              accepted
                ? 'bg-semantic-success-soft text-semantic-success ring-semantic-success-soft/50'
                : 'bg-semantic-info-soft text-semantic-info ring-semantic-info-soft/50'
            )}
          >
            {accepted ? <CheckCircle2 className="w-6 h-6" /> : <ExternalLink className="w-6 h-6" />}
          </div>
          <PageHeader
            title={accepted ? 'Acceptance complete' : 'Quote acceptance'}
            description={message}
          />
          {!accepted && (
            <div className="mt-6 flex justify-center">
              <Button
                variant="primary"
                size="lg"
                loading={busy}
                disabled={busy || !token}
                onClick={() => void accept()}
              >
                {busy ? 'Accepting…' : 'Accept this quote'}
              </Button>
            </div>
          )}
          <div className="mt-6">
            <a
              className="inline-block text-sm font-semibold text-semantic-accent hover:underline"
              href="/"
            >
              Return to OpsPilot
            </a>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function RateCardForm({ cards, onCreated }: { cards: RateCard[]; onCreated: () => Promise<void> }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [rate, setRate] = useState('');
  const [cardDescription, setCardDescription] = useState('');
  const [editingId, setEditingId] = useState('');
  const clear = () => {
    setEditingId('');
    setName('');
    setRate('');
    setCurrency('USD');
    setCardDescription('');
  };
  const remove = async (id: string) => {
    if (!window.confirm('Delete this rate card? Rate cards used by quotes are protected.')) return;
    try {
      await apiRequest(`/quotes/rate-cards/${id}`, { method: 'DELETE' });
      await onCreated();
      toast.success('Rate card deleted.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to delete rate card');
    }
  };
  const rcColumns: GridColumn<RateCard>[] = [
    {
      key: 'name',
      header: 'Name',
      track: 'minmax(0, 2.4fr)',
      role: 'primary',
      render: (r) => (
        <div className="min-w-0">
          <div className="break-words text-sm font-semibold text-semantic-text">{r.name}</div>
          {r.description && (
            <div className="mt-0.5 line-clamp-2 text-xs text-semantic-text-muted">{r.description}</div>
          )}
        </div>
      ),
    },
    {
      key: 'currency',
      header: 'Currency',
      track: 'minmax(0, 0.8fr)',
      render: (r) => <span className="text-sm text-semantic-text">{r.currency}</span>,
    },
    {
      key: 'default_rate_cents',
      header: 'Default hourly rate',
      track: 'minmax(0, 1.3fr)',
      align: 'right',
      render: (r) => (
        <span className="text-sm font-semibold tabular-nums text-semantic-text">
          {r.currency} {(r.default_rate_cents / 100).toFixed(2)} / hr
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      track: '190px',
      role: 'actions',
      align: 'right',
      render: (r) => (
        <div className="rgrid-actions">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditingId(r.id);
              setName(r.name);
              setCurrency(r.currency);
              setRate((r.default_rate_cents / 100).toFixed(2));
              setCardDescription(r.description || '');
            }}
          >
            <Edit3 className="w-3.5 h-3.5" /> Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void remove(r.id)}>
            <Trash2 className="w-3.5 h-3.5 text-semantic-danger" /> Delete
          </Button>
        </div>
      ),
    },
  ];
  return (
    <Card className="quote-cq">
      <CardContent className="space-y-5">
        <RequiredForm
          className="quote-rate-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const isEditing = Boolean(editingId);
              await apiRequest(
                editingId ? `/quotes/rate-cards/${editingId}` : '/quotes/rate-cards',
                {
                  method: editingId ? 'PUT' : 'POST',
                  body: JSON.stringify({
                    name,
                    currency,
                    default_rate_cents: Math.round(Number(rate || 0) * 100),
                    description: cardDescription || null,
                  }),
                }
              );
              clear();
              await onCreated();
              toast.success(isEditing ? 'Rate card updated.' : 'Rate card created.');
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Unable to save rate card');
            }
          }}
        >
          <label className="text-xs font-semibold text-semantic-text-muted">
            Rate card name
            <input
              className={`${field} mt-1.5`}
              required
              placeholder="Standard services"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="text-xs font-semibold text-semantic-text-muted">
            Currency
            <select
              className={`${field} mt-1.5`}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option>USD</option>
              <option>EUR</option>
              <option>INR</option>
              <option>GBP</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-semantic-text-muted">
            Default hourly rate
            <input
              className={`${field} mt-1.5`}
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </label>
          <label className="text-xs font-semibold text-semantic-text-muted quote-span-all">
            Description
            <textarea
              className={`${field} mt-1.5`}
              rows={2}
              placeholder="What this rate card covers or is intended for"
              value={cardDescription}
              onChange={(e) => setCardDescription(e.target.value)}
            />
          </label>
          <div className="quote-span-all flex flex-wrap items-center justify-end gap-2">
            <Button type="submit" variant="primary">
              {editingId ? 'Save changes' : 'Add rate card'}
            </Button>
            {editingId && (
              <Button type="button" variant="outline" onClick={clear}>
                Cancel
              </Button>
            )}
          </div>
        </RequiredForm>
        <ResponsiveGrid<RateCard>
          columns={rcColumns}
          rows={cards}
          rowKey={(r) => r.id}
          footer={`${cards.length} rate card${cards.length === 1 ? '' : 's'}`}
          emptyState={
            <EmptyState
              title="No rate cards yet"
              description="Create your first rate card above to use when building quotes."
            />
          }
        />
      </CardContent>
    </Card>
  );
}