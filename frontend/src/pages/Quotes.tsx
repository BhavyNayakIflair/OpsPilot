import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Sparkles, FileText, Calendar, CheckCircle2, Trash2, ExternalLink, Edit3 } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { Card, CardHeader, CardContent, CardFooter } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Alert } from '../components/ui/Alert';
import { EmptyState } from '../components/ui/EmptyState';
import { DataTable, type DataTableColumn, type DataTableFilterDef } from '../components/ui/DataTable';
import AIProgress from '../components/ui/AIProgress';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Lead = { id: string; title: string };
type RateCard = { id: string; name: string; currency: string; default_rate_cents: number; description?: string | null };
type Quote = { id: string; title: string; status: string; currency: string; subtotal_cents: number; total_cents: number; accept_token: string; lead_id?: string | null; created_at?: string; accepted_at?: string | null; line_items: { id: string; description: string; quantity: number; amount_cents: number }[] };
type QuoteDraft = { quote: { id: string; title: string; description?: string | null; lead_id: string; rate_card_id?: string; currency: string; discount_bps: number; tax_bps: number; terms?: string | null; line_items: { description: string; quantity: number; unit_price_cents: number }[] }; assumptions: string[] };
type QuoteAgentRun = { id: string; status: string; result_data: { quote_id?: string; flags?: string[]; error?: string }; steps: { node_name: string; model: string; latency_ms: number; result_summary: string }[] };
const field = 'field-control';

export function Quotes() {
  const navigate = useNavigate();
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
  const [aiBusy, setAiBusy] = useState(false);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentStatus, setAgentStatus] = useState('');
  const [aiPreview, setAiPreview] = useState<{ quote: QuoteDraft['quote']; assumptions: string[] } | null>(null);
  const [agentError, setAgentError] = useState('');
  const [aiError, setAiError] = useState('');

  const [search, setSearch] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string | string[]>>({ status: '', currency: '' });
  const [sortKey, setSortKey] = useState<string | null>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>('desc');

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
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create quote');
    } finally {
      setBusy(false);
    }
  };

  const resetEditor = () => {
    setEditingId('');
    setAssumptions([]);
    setAiPreview(null);
    setTitle('');
    setDescription('');
    setLeadId('');
    setCardId('');
    setLineItems([{ description: '', quantity: '1', price: '' }]);
    setTerms('');
    setDiscount('0');
    setTax('0');
  };

  const applyAiPreview = () => {
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
    setAiPreview(null);
    void load();
  };

  const draftWithAI = async () => {
    if (!leadId) {
      setError('Choose a lead before drafting a quote with AI.');
      return;
    }
    setAiBusy(true);
    setAiError('');
    setAiPreview(null);
    setError('');
    try {
      const result = await apiRequest<QuoteDraft>('/quotes/draft', {
        method: 'POST',
        body: JSON.stringify({
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
        }),
      });
      setAiPreview({ quote: result.quote, assumptions: result.assumptions });
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Could not draft quote with AI');
      setError(err instanceof Error ? err.message : 'Could not draft quote with AI');
    } finally {
      setAiBusy(false);
    }
  };

  const runQuoteAgent = async () => {
    if (!leadId) {
      setError('Choose a lead before starting the quote agent.');
      return;
    }
    setAgentBusy(true);
    setAgentError('');
    setError('');
    setAgentStatus('');
    try {
      const run = await apiRequest<QuoteAgentRun>('/workflows/quote-agent/run', {
        method: 'POST',
        body: JSON.stringify({
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
        }),
      });
      if (run.status === 'completed') {
        setAgentStatus(`Agent completed its review and saved a draft quote (${run.steps.length} steps).`);
        await load();
      } else if (run.status === 'paused_for_approval') {
        setAgentStatus('The agent flagged this quote. It is waiting in the Approvals Inbox; no quote was saved yet.');
      } else {
        throw new Error(run.result_data.error || `Quote agent ended with status: ${run.status}`);
      }
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : 'Quote agent could not complete');
      setError(err instanceof Error ? err.message : 'Quote agent could not complete');
    } finally {
      setAgentBusy(false);
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
      setError(err instanceof Error ? err.message : 'Unable to open PDF');
    }
  };

  const copyAcceptance = async (quote: Quote) => {
    const url = `${window.location.origin}/quote-accept/${quote.accept_token}`;
    try {
      await navigator.clipboard.writeText(url);
      setError('Acceptance link copied to clipboard.');
    } catch {
      setError(url);
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
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load quote for editing');
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this quote? This cannot be undone.')) return;
    try {
      await apiRequest(`/quotes/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete quote');
    }
  };

  const scrollToForm = () => {
    document.getElementById('quote-editor-form')?.scrollIntoView({ behavior: 'smooth' });
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

  const filters: DataTableFilterDef[] = [
    {
      key: 'status',
      label: 'Status',
      type: 'dropdown',
      options: [
        { value: 'draft', label: 'Draft' },
        { value: 'accepted', label: 'Accepted' },
        { value: 'void', label: 'Void' },
      ],
      placeholder: 'All statuses',
    },
    {
      key: 'currency',
      label: 'Currency',
      type: 'dropdown',
      options: currencies.map((c) => ({ value: c, label: c })),
      placeholder: 'All currencies',
    },
  ];

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

  const columns: DataTableColumn<Quote>[] = [
    {
      key: 'title',
      header: 'Title',
      sortable: false,
      widthClass: 'min-w-[240px]',
      render: (row) => (
        <div className="min-w-0">
          <div className="font-semibold text-semantic-text truncate">{row.title}</div>
          <div className="mt-0.5 text-xs text-semantic-text-muted truncate">
            {row.line_items.map((l) => `${l.description}`).join(' · ')}
          </div>
        </div>
      ),
    },
    {
      key: 'lead_id',
      header: 'Linked Lead',
      sortable: false,
      widthClass: 'min-w-[180px]',
      render: (row) => {
        const lead = row.lead_id ? leadLookup[row.lead_id] : null;
        if (!lead) return <span className="text-semantic-text-muted text-xs">—</span>;
        return (
          <Link
            to="/crm"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-semantic-accent hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="truncate">{lead.title}</span>
          </Link>
        );
      },
    },
    {
      key: 'created_at',
      header: 'Created',
      sortable: true,
      widthClass: 'min-w-[120px]',
      render: (row) => (
        <div className="inline-flex items-center gap-1.5 text-sm">
          <Calendar className="w-3.5 h-3.5 text-semantic-text-muted" />
          <span className="text-semantic-text">{formatDate(row.created_at) ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'accepted_at',
      header: 'Accepted',
      sortable: false,
      widthClass: 'min-w-[140px]',
      render: (row) => {
        if (row.status === 'accepted' && row.accepted_at) {
          return (
            <div className="flex flex-col gap-1">
              <Badge variant="success">Accepted</Badge>
              <span className="text-xs text-semantic-text-muted">{formatDate(row.accepted_at)}</span>
            </div>
          );
        }
        return <span className="text-semantic-text-muted text-xs">—</span>;
      },
    },
    {
      key: 'total_cents',
      header: 'Total',
      sortable: true,
      align: 'right',
      widthClass: 'min-w-[140px]',
      render: (row) => (
        <div className="flex flex-col items-end gap-1">
          <span className="font-bold text-semantic-text">{formatCurrency(row.total_cents, row.currency)}</span>
          <Badge variant={statusBadgeVariant(row.status)}>{row.status}</Badge>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      sortable: false,
      align: 'right',
      widthClass: 'min-w-[260px]',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
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
            <Button variant="ghost" size="sm" onClick={() => void remove(row.id)}>
              <Trash2 className="w-3.5 h-3.5 text-semantic-danger" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const aiDraftPreview = aiPreview ? (
    <Card className="!bg-semantic-accent-soft dark:!bg-indigo-950/30 !border-semantic-accent/40">
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
          <div className="rounded-ui-xl border border-semantic-accent/20 overflow-hidden">
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
                    <tr key={i}>
                      <td className="px-3 py-2 text-semantic-text">{l.description}</td>
                      <td className="px-3 py-2 text-right text-semantic-text">{l.quantity}</td>
                      <td className="px-3 py-2 text-right text-semantic-text">{formatCurrency(l.unit_price_cents, aiPreview.quote.currency)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-semantic-text">{formatCurrency(amt, aiPreview.quote.currency)}</td>
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
      <PageHeader
        eyebrow="Sales workspace"
        title="Quotes & Proposals"
        description="Build a quote from your pipeline, use AI to prepare a reviewable draft, then preview and share it when you're ready."
        statChips={[
          { label: 'Saved quotes', value: quotes.length, tone: 'accent' },
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

      <Card id="quote-editor-form">
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

        {(showAiProgress || showAgentProgress) && (
          <div className="px-5 sm:px-6 pt-4 pb-2 space-y-4">
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
            <div className="mb-5 rounded-ui-xl border border-semantic-warning/30 bg-semantic-warning-soft p-4 text-sm text-semantic-warning">
              <p className="font-semibold">AI assumptions — review before saving</p>
              <ul className="mt-2 list-disc pl-5 space-y-0.5">
                {assumptions.map((item, index) => <li key={index}>{item}</li>)}
              </ul>
            </div>
          )}

          <form onSubmit={(e) => void submit(e)} className="grid gap-4 md:grid-cols-2">
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
            <label className="text-xs font-semibold text-semantic-text-muted md:col-span-2">
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
                {leads.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-semantic-text-muted">
              Rate card
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
            <div className="space-y-3 md:col-span-2">
              <p className="text-xs font-bold uppercase tracking-wider text-semantic-text-muted">Line items</p>
              {lineItems.map((line, index) => (
                <div
                  key={index}
                  className="grid items-end gap-3 rounded-ui-xl border border-semantic-border bg-semantic-surface-muted/40 p-3 sm:grid-cols-[2fr_120px_1fr_auto]"
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
            <label className="text-xs font-semibold text-semantic-text-muted md:col-span-2">
              Terms and notes
              <textarea
                className={`${field} mt-1.5`}
                rows={3}
                placeholder="Add payment terms or scope notes"
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-semantic-border pt-4 md:col-span-2">
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
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-bold text-semantic-text">Saved quotes</h2>
            <p className="text-xs text-semantic-text-muted mt-0.5">
              {quotes.length} proposals in this workspace
            </p>
          </div>
        </div>

        <DataTable<Quote>
          columns={columns}
          rows={filteredQuotes}
          rowKey={(r) => r.id}
          searchable
          searchPlaceholder="Search by title or client…"
          searchValue={search}
          onSearchChange={setSearch}
          filters={filters}
          filterValues={filterValues}
          onFilterChange={(k, v) => setFilterValues((prev) => ({ ...prev, [k]: v }))}
          sortable
          sortKey={sortKey}
          sortDir={sortDir}
          onSortChange={handleSortChange}
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
      </div>

      {pdfUrl && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-semantic-text">PDF preview</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                URL.revokeObjectURL(pdfUrl);
                setPdfUrl('');
              }}
            >
              Close preview
            </Button>
          </CardHeader>
          <div className="px-0 pb-0">
            <iframe
              title="Quote PDF preview"
              src={pdfUrl}
              className="h-[640px] w-full border-t border-semantic-border"
            />
          </div>
        </Card>
      )}

      <details className="group">
        <summary className="cursor-pointer list-none rounded-ui-2xl border border-semantic-border bg-semantic-surface px-5 py-4 text-sm font-semibold text-semantic-text flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>Manage rate cards</span>
            <span className="text-xs font-normal text-semantic-text-muted">
              {cards.length} available
            </span>
          </div>
          <span className="text-xs text-semantic-text-muted group-open:rotate-180 transition-transform">
            ▾
          </span>
        </summary>
        <div className="mt-2">
          <RateCardForm cards={cards} onCreated={async () => { await load(); }} />
        </div>
      </details>
    </div>
  );
}

export function QuoteAcceptance() {
  const { token } = useParams();
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
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'This quote could not be accepted.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="flex min-h-screen items-center justify-center bg-semantic-surface-muted p-6">
      <Card className="w-full max-w-lg text-center">
        <CardContent className="pt-8">
          <div
            className={cn(
              'mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-xl',
              accepted
                ? 'bg-semantic-success-soft text-semantic-success'
                : 'bg-semantic-info-soft text-semantic-info'
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
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [rate, setRate] = useState('');
  const [cardDescription, setCardDescription] = useState('');
  const [message, setMessage] = useState('');
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
      setMessage('Rate card deleted.');
      await onCreated();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to delete rate card');
    }
  };
  const rcColumns: DataTableColumn<RateCard>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: false,
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-sm text-semantic-text">{r.name}</span>
          {r.description && (
            <span className="text-xs text-semantic-text-muted line-clamp-1">{r.description}</span>
          )}
        </div>
      ),
    },
    {
      key: 'currency',
      header: 'Currency',
      sortable: false,
      render: (r) => <span className="text-sm text-semantic-text">{r.currency}</span>,
    },
    {
      key: 'default_rate_cents',
      header: 'Default hourly rate',
      sortable: false,
      align: 'right',
      render: (r) => (
        <span className="text-sm font-semibold text-semantic-text">
          {r.currency} {(r.default_rate_cents / 100).toFixed(2)} / hr
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      sortable: false,
      align: 'right',
      render: (r) => (
        <div className="flex items-center gap-1 justify-end">
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
    <Card>
      <CardContent className="space-y-5">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
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
              setMessage('Rate card saved.');
              await onCreated();
            } catch (err) {
              setMessage(err instanceof Error ? err.message : 'Unable to save rate card');
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
          <label className="text-xs font-semibold text-semantic-text-muted sm:col-span-2 lg:col-span-4">
            Description
            <textarea
              className={`${field} mt-1.5`}
              rows={2}
              placeholder="What this rate card covers or is intended for"
              value={cardDescription}
              onChange={(e) => setCardDescription(e.target.value)}
            />
          </label>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4 lg:justify-end">
            <Button type="submit" variant="primary">
              {editingId ? 'Save changes' : 'Add rate card'}
            </Button>
            {editingId && (
              <Button type="button" variant="outline" onClick={clear}>
                Cancel
              </Button>
            )}
          </div>
        </form>
        {message && (
          <Alert variant="info" dismissible onDismiss={() => setMessage('')}>
            {message}
          </Alert>
        )}
        <DataTable<RateCard>
          columns={rcColumns}
          rows={cards}
          rowKey={(r) => r.id}
          sortable={false}
          searchable={false}
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
