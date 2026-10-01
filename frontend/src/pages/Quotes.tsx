import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../lib/api';

type Lead = { id: string; title: string };
type RateCard = { id: string; name: string; currency: string; default_rate_cents: number };
type Quote = { id: string; title: string; status: string; currency: string; subtotal_cents: number; total_cents: number; accept_token: string; line_items: { id: string; description: string; quantity: number; amount_cents: number }[] };
type QuoteDraft = { quote: { id: string; title: string; lead_id: string; rate_card_id?: string; currency: string; discount_bps: number; tax_bps: number; terms?: string | null; line_items: { description: string; quantity: number; unit_price_cents: number }[] }; assumptions: string[] };
type QuoteAgentRun = { id: string; status: string; result_data: { quote_id?: string; flags?: string[]; error?: string }; steps: { node_name: string; model: string; latency_ms: number; result_summary: string }[] };
const field = 'field-control';
const action = 'primary-button';

export function Quotes() {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [cards, setCards] = useState<RateCard[]>([]);
  const [title, setTitle] = useState('');
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
  const [editingId, setEditingId] = useState('');
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentStatus, setAgentStatus] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      const [q, l, c] = await Promise.all([apiRequest<Quote[]>('/quotes'), apiRequest<Lead[]>('/crm/leads'), apiRequest<RateCard[]>('/quotes/rate-cards')]);
      setQuotes(q); setLeads(l); setCards(c);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load quotes'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);
  const chooseCard = (id: string) => { setCardId(id); const card = cards.find((item) => item.id === id); if (card) { setCurrency(card.currency); setLineItems((items) => items.map((item, index) => index === 0 && !item.price ? { ...item, price: (card.default_rate_cents / 100).toFixed(2) } : item)); } };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await apiRequest(editingId ? `/quotes/${editingId}` : '/quotes', { method: editingId ? 'PUT' : 'POST', body: JSON.stringify({ title, lead_id: leadId || null, rate_card_id: cardId || null, currency, discount_bps: Math.round(Number(discount) * 100), tax_bps: Math.round(Number(tax) * 100), terms: terms || null, line_items: lineItems.map((line) => ({ description: line.description, quantity: Number(line.quantity), unit_price_cents: Math.round(Number(line.price) * 100), rate_card_id: cardId || null })) }) });
      resetEditor(); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not create quote'); }
    finally { setBusy(false); }
  };
  const resetEditor = () => { setEditingId(''); setAssumptions([]); setTitle(''); setLeadId(''); setCardId(''); setLineItems([{ description: '', quantity: '1', price: '' }]); setTerms(''); setDiscount('0'); setTax('0'); };
  const draftWithAI = async () => {
    if (!leadId) { setError('Choose a lead before drafting a quote with AI.'); return; }
    setAiBusy(true); setError('');
    try {
      const result = await apiRequest<QuoteDraft>('/quotes/draft', { method: 'POST', body: JSON.stringify({ lead_id: leadId, rate_card_id: cardId || null }) });
      const quote = result.quote;
      setEditingId(quote.id); setTitle(quote.title); setLeadId(quote.lead_id); setCardId(quote.rate_card_id || ''); setCurrency(quote.currency);
      setDiscount(String(quote.discount_bps / 100)); setTax(String(quote.tax_bps / 100)); setTerms(quote.terms || '');
      setLineItems(quote.line_items.map((line) => ({ description: line.description, quantity: String(line.quantity), price: (line.unit_price_cents / 100).toFixed(2) })));
      setAssumptions(result.assumptions); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not draft quote with AI'); }
    finally { setAiBusy(false); }
  };
  const runQuoteAgent = async () => {
    if (!leadId) { setError('Choose a lead before starting the quote agent.'); return; }
    setAgentBusy(true); setError(''); setAgentStatus('');
    try {
      const run = await apiRequest<QuoteAgentRun>('/workflows/quote-agent/run', {
        method: 'POST', body: JSON.stringify({ lead_id: leadId, rate_card_id: cardId || null }),
      });
      if (run.status === 'completed') {
        setAgentStatus(`Agent completed its review and saved a draft quote (${run.steps.length} steps).`);
        await load();
      } else if (run.status === 'paused_for_approval') {
        setAgentStatus('The agent flagged this quote. It is waiting in the Approvals Inbox; no quote was saved yet.');
      } else {
        throw new Error(run.result_data.error || `Quote agent ended with status: ${run.status}`);
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Quote agent could not complete'); }
    finally { setAgentBusy(false); }
  };
  const showPdf = async (id: string) => {
    setError('');
    try {
      const token = localStorage.getItem('opspilot_token'); const orgId = localStorage.getItem('opspilot_org_id');
      const response = await fetch(`/api/v1/quotes/${id}/pdf`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(orgId ? { 'X-Org-ID': orgId } : {}) } });
      if (!response.ok) throw new Error('Unable to create quote PDF');
      const next = URL.createObjectURL(await response.blob()); setPdfUrl((old) => { if (old) URL.revokeObjectURL(old); return next; });
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to open PDF'); }
  };
  const copyAcceptance = async (quote: Quote) => {
    const url = `${window.location.origin}/quote-accept/${quote.accept_token}`;
    try { await navigator.clipboard.writeText(url); setError('Acceptance link copied to clipboard.'); }
    catch { setError(url); }
  };
  const editQuote = async (id: string) => {
    setError('');
    try {
      const quote = await apiRequest<QuoteDraft['quote']>(`/quotes/${id}`);
      setEditingId(id); setTitle(quote.title); setLeadId(quote.lead_id || ''); setCardId(quote.rate_card_id || '');
      setCurrency(quote.currency); setDiscount(String(quote.discount_bps / 100)); setTax(String(quote.tax_bps / 100));
      setTerms(quote.terms || ''); setAssumptions([]);
      setLineItems(quote.line_items.map((line) => ({ description: line.description, quantity: String(line.quantity), price: (line.unit_price_cents / 100).toFixed(2) })));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load quote for editing'); }
  };
  const remove = async (id: string) => { if (!window.confirm('Delete this quote? This cannot be undone.')) return; try { await apiRequest(`/quotes/${id}`, { method: 'DELETE' }); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete quote'); } };
  return <div className="page-shell">
    <header className="page-heading"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.16em] text-indigo-600">Sales workspace</p><h1 className="page-title">Quotes & Proposals</h1><p className="page-description">Build a quote from your pipeline, use AI to prepare a reviewable draft, then preview and share it when you’re ready.</p></div><div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs font-medium text-indigo-800"><span className="font-bold">AI drafts stay in your control</span><br />Every quote is saved as a draft for review.</div></header>
    {error && <div role="alert" className="break-all rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">{error}</div>}
    <section className="panel p-5 sm:p-6"><div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Quote editor</p><h2 className="mt-1 text-lg font-bold text-slate-900">{editingId ? 'Review AI draft' : 'Create a quote'}</h2><p className="mt-1 text-sm text-slate-500">Enter the proposal details and line items. Prices are entered per unit.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Draft</span></div>{assumptions.length > 0 && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-semibold">AI assumptions — review before saving</p><ul className="mt-1 list-disc pl-5">{assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}<form onSubmit={(e) => void submit(e)} className="grid gap-4 md:grid-cols-2">
      <label className="text-xs font-semibold text-slate-600">Proposal title<input required className={`${field} mt-1.5`} placeholder="e.g. Website implementation" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="text-xs font-semibold text-slate-600">Link to lead<select className={`${field} mt-1.5`} value={leadId} onChange={(e) => setLeadId(e.target.value)}><option value="">Choose a lead (optional)</option>{leads.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-600">Rate card<select className={`${field} mt-1.5`} value={cardId} onChange={(e) => chooseCard(e.target.value)}><option value="">No rate card</option>{cards.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.currency}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-600">Currency<select className={`${field} mt-1.5`} value={currency} onChange={(e) => setCurrency(e.target.value)}><option>USD</option><option>EUR</option><option>INR</option><option>GBP</option></select></label>
      <div className="space-y-3 md:col-span-2"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Line items</p>{lineItems.map((line, index) => <div key={index} className="grid items-end gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:grid-cols-[2fr_120px_1fr_auto]"><label className="text-xs font-semibold text-slate-600">Description<input required className={`${field} mt-1.5`} placeholder="What are you quoting?" value={line.description} onChange={(e) => setLineItems((items) => items.map((item, i) => i === index ? { ...item, description: e.target.value } : item))} /></label><label className="text-xs font-semibold text-slate-600">Quantity<input required min="1" type="number" className={`${field} mt-1.5`} aria-label={`Quantity for item ${index + 1}`} value={line.quantity} onChange={(e) => setLineItems((items) => items.map((item, i) => i === index ? { ...item, quantity: e.target.value } : item))} /></label><label className="text-xs font-semibold text-slate-600">Unit price ({currency})<input required min="0" step="0.01" type="number" className={`${field} mt-1.5`} placeholder="0.00" value={line.price} onChange={(e) => setLineItems((items) => items.map((item, i) => i === index ? { ...item, price: e.target.value } : item))} /></label>{lineItems.length > 1 && <button type="button" aria-label={`Remove item ${index + 1}`} className="px-2 py-2 text-sm font-semibold text-rose-600" onClick={() => setLineItems((items) => items.filter((_, i) => i !== index))}>Remove</button>}</div>)}<button type="button" className="text-sm font-semibold text-indigo-700 hover:underline" onClick={() => setLineItems((items) => [...items, { description: '', quantity: '1', price: '' }])}>+ Add line item</button></div>
      <label className="text-xs text-slate-500">Discount (%)<input min="0" max="100" step="0.01" type="number" className={`${field} mt-1`} value={discount} onChange={(e) => setDiscount(e.target.value)} /></label>
      <label className="text-xs text-slate-500">Tax (%)<input min="0" max="100" step="0.01" type="number" className={`${field} mt-1`} value={tax} onChange={(e) => setTax(e.target.value)} /></label>
      <label className="text-xs font-semibold text-slate-600 md:col-span-2">Terms and notes<textarea className={`${field} mt-1.5`} rows={3} placeholder="Add payment terms or scope notes" value={terms} onChange={(e) => setTerms(e.target.value)} /></label>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 md:col-span-2"><span className="text-xs text-slate-500">Prices are saved in cents. AI output always requires human review.</span><div className="flex flex-wrap gap-2"><button type="button" disabled={aiBusy || busy || agentBusy || !leadId} onClick={() => void draftWithAI()} className={action}>{aiBusy ? 'Drafting…' : 'Draft with AI'}</button><button type="button" disabled={agentBusy || aiBusy || busy || !leadId} onClick={() => void runQuoteAgent()} className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50">{agentBusy ? 'Reviewing…' : 'Run quote agent'}</button>{editingId && <button type="button" disabled={busy} onClick={resetEditor} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Cancel review</button>}<button disabled={busy} className={action}>{busy ? 'Saving…' : editingId ? 'Save reviewed draft' : 'Create quote'}</button></div></div>
    </form></section>
    {agentStatus && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><span>{agentStatus}</span>{agentStatus.includes('Approvals Inbox') && <button className="font-bold underline" onClick={() => navigate('/approvals')}>Review approval</button>}</div>}
    <section className="panel overflow-hidden"><div className="panel-heading flex items-center justify-between"><div><h2 className="font-bold text-slate-900">Saved quotes</h2><p className="mt-1 text-xs text-slate-500">{quotes.length} proposals in this workspace</p></div></div><div className="divide-y divide-slate-100">{quotes.map((quote) => <article key={quote.id} className="flex flex-col gap-3 px-5 py-4 transition hover:bg-slate-50/70 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><h3 className="font-semibold text-slate-900">{quote.title}</h3><p className="mt-1 truncate text-xs text-slate-500">{quote.line_items.map((line) => `${line.description} · ${quote.currency} ${(line.amount_cents / 100).toFixed(2)}`).join(' | ')}</p></div><div className="flex flex-wrap items-center gap-2"><span className="mr-1 font-bold text-slate-900">{quote.currency} {(quote.total_cents / 100).toFixed(2)}</span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${quote.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{quote.status}</span>{quote.status === 'draft' && <button className="text-sm font-semibold text-indigo-700 hover:underline" onClick={() => void editQuote(quote.id)}>Edit</button>}<button className="text-sm font-semibold text-sky-700 hover:underline" onClick={() => void showPdf(quote.id)}>PDF</button>{quote.status !== 'accepted' && <button className="text-sm font-semibold text-sky-700 hover:underline" onClick={() => void copyAcceptance(quote)}>Accept link</button>}{quote.status !== 'accepted' && <button className="text-sm font-semibold text-rose-600 hover:underline" onClick={() => void remove(quote.id)}>Delete</button>}</div></article>)}{!quotes.length && <p className="p-8 text-center text-sm text-slate-500">No quotes yet. Create your first proposal above.</p>}</div></section>
    {pdfUrl && <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex items-center justify-between px-4 py-3"><h2 className="font-semibold">PDF preview</h2><button className="text-sm text-slate-500 hover:text-slate-900" onClick={() => { URL.revokeObjectURL(pdfUrl); setPdfUrl(''); }}>Close preview</button></div><iframe title="Quote PDF preview" src={pdfUrl} className="h-[640px] w-full border-t border-slate-100" /></section>}
    <details className="panel p-5"><summary className="cursor-pointer text-sm font-semibold text-slate-800">Manage rate cards <span className="ml-2 text-xs font-normal text-slate-500">{cards.length} available</span></summary><RateCardForm cards={cards} onCreated={async () => { await load(); }} /></details>
  </div>;
}

export function QuoteAcceptance() {
  const { token } = useParams();
  const [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState('Review this proposal, then confirm below to accept it.');
  const [busy, setBusy] = useState(false);
  const accept = async () => {
    if (!token) { setMessage('This acceptance link is invalid.'); return; }
    setBusy(true);
    try {
      const result = await apiRequest<{ status: string }>('/quotes/accept/' + encodeURIComponent(token));
      setAccepted(result.status === 'accepted');
      setMessage(result.status === 'accepted' ? 'Quote accepted. Thank you.' : `Quote status: ${result.status}`);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'This quote could not be accepted.'); }
    finally { setBusy(false); }
  };
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-xl ${accepted ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'}`}>{accepted ? '✓' : '↗'}</div><h1 className="text-xl font-bold text-slate-900">{accepted ? 'Acceptance complete' : 'Quote acceptance'}</h1><p role="status" className="mt-2 text-sm text-slate-600">{message}</p>{!accepted && <button disabled={busy || !token} onClick={() => void accept()} className={`${action} mt-5`}>{busy ? 'Accepting…' : 'Accept this quote'}</button>}<div><a className="mt-5 inline-block text-sm font-semibold text-sky-700 hover:underline" href="/">Return to OpsPilot</a></div></section></main>;
}

function RateCardForm({ cards, onCreated }: { cards: RateCard[]; onCreated: () => Promise<void> }) {
  const [name, setName] = useState(''); const [currency, setCurrency] = useState('USD'); const [rate, setRate] = useState(''); const [message, setMessage] = useState(''); const [editingId, setEditingId] = useState('');
  const clear = () => { setEditingId(''); setName(''); setRate(''); setCurrency('USD'); };
  const remove = async (id: string) => { if (!window.confirm('Delete this rate card? Rate cards used by quotes are protected.')) return; try { await apiRequest(`/quotes/rate-cards/${id}`, { method: 'DELETE' }); setMessage('Rate card deleted.'); await onCreated(); } catch (err) { setMessage(err instanceof Error ? err.message : 'Unable to delete rate card'); } };
  return <div className="mt-4 space-y-4"><form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]" onSubmit={async (e) => { e.preventDefault(); try { await apiRequest(editingId ? `/quotes/rate-cards/${editingId}` : '/quotes/rate-cards', { method: editingId ? 'PUT' : 'POST', body: JSON.stringify({ name, currency, default_rate_cents: Math.round(Number(rate || 0) * 100) }) }); clear(); setMessage('Rate card saved.'); await onCreated(); } catch (err) { setMessage(err instanceof Error ? err.message : 'Unable to save rate card'); } }}><label className="text-xs font-semibold text-slate-600">Rate card name<input className={`${field} mt-1.5`} required placeholder="Standard services" value={name} onChange={(e) => setName(e.target.value)} /></label><label className="text-xs font-semibold text-slate-600">Currency<select className={`${field} mt-1.5`} value={currency} onChange={(e) => setCurrency(e.target.value)}><option>USD</option><option>EUR</option><option>INR</option><option>GBP</option></select></label><label className="text-xs font-semibold text-slate-600">Default hourly rate<input className={`${field} mt-1.5`} type="number" min="0" step="0.01" placeholder="0.00" value={rate} onChange={(e) => setRate(e.target.value)} /></label><div className="flex items-end gap-2"><button className={action}>{editingId ? 'Save changes' : 'Add rate card'}</button>{editingId && <button type="button" className="secondary-button" onClick={clear}>Cancel</button>}</div></form>{message && <p role="status" className="text-sm text-slate-600">{message}</p>}<ul className="divide-y divide-slate-100">{cards.map((card) => <li key={card.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><span><strong className="text-sm text-slate-800">{card.name}</strong><span className="ml-2 text-xs text-slate-500">{card.currency} {(card.default_rate_cents / 100).toFixed(2)} / hour</span></span><span className="flex gap-3"><button className="text-sm font-semibold text-indigo-700" onClick={() => { setEditingId(card.id); setName(card.name); setCurrency(card.currency); setRate((card.default_rate_cents / 100).toFixed(2)); }}>Edit</button><button className="text-sm font-semibold text-rose-600" onClick={() => void remove(card.id)}>Delete</button></span></li>)}</ul></div>;
}
