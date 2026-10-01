import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiRequest } from '../lib/api';

type Lead = { id: string; title: string };
type RateCard = { id: string; name: string; currency: string; default_rate_cents: number };
type Quote = { id: string; title: string; status: string; currency: string; subtotal_cents: number; total_cents: number; accept_token: string; line_items: { id: string; description: string; quantity: number; amount_cents: number }[] };
const field = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500';
const action = 'rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50';

export function Quotes() {
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
      await apiRequest('/quotes', { method: 'POST', body: JSON.stringify({ title, lead_id: leadId || null, rate_card_id: cardId || null, currency, discount_bps: Math.round(Number(discount) * 100), tax_bps: Math.round(Number(tax) * 100), terms: terms || null, line_items: lineItems.map((line) => ({ description: line.description, quantity: Number(line.quantity), unit_price_cents: Math.round(Number(line.price) * 100), rate_card_id: cardId || null })) }) });
      setTitle(''); setLineItems([{ description: '', quantity: '1', price: '' }]); setTerms(''); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not create quote'); }
    finally { setBusy(false); }
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
  const remove = async (id: string) => { try { await apiRequest(`/quotes/${id}`, { method: 'DELETE' }); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete quote'); } };
  return <div className="mx-auto max-w-7xl space-y-6">
    <header><h1 className="text-2xl font-bold text-slate-900">Quotes & Proposals</h1><p className="mt-1 text-sm text-slate-500">Build priced proposals from your pipeline, preview a PDF, and share an acceptance link.</p></header>
    {error && <div role="alert" className="break-all rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">{error}</div>}
    <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="mb-4 text-base font-bold text-slate-900">New quote</h2><form onSubmit={(e) => void submit(e)} className="grid gap-3 md:grid-cols-2">
      <input required className={field} placeholder="Proposal title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <select className={field} value={leadId} onChange={(e) => setLeadId(e.target.value)}><option value="">No linked lead</option>{leads.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}</select>
      <select className={field} value={cardId} onChange={(e) => chooseCard(e.target.value)}><option value="">No rate card</option>{cards.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.currency}</option>)}</select>
      <select className={field} value={currency} onChange={(e) => setCurrency(e.target.value)}><option>USD</option><option>EUR</option><option>INR</option><option>GBP</option></select>
      <div className="space-y-2 md:col-span-2">{lineItems.map((line, index) => <div key={index} className="grid gap-2 sm:grid-cols-[2fr_100px_1fr_auto]"><input required className={field} placeholder="Line item description" value={line.description} onChange={(e) => setLineItems((items) => items.map((item, i) => i === index ? { ...item, description: e.target.value } : item))} /><input required min="1" type="number" className={field} aria-label={`Quantity for item ${index + 1}`} value={line.quantity} onChange={(e) => setLineItems((items) => items.map((item, i) => i === index ? { ...item, quantity: e.target.value } : item))} /><input required min="0" step="0.01" type="number" className={field} placeholder="Unit price" value={line.price} onChange={(e) => setLineItems((items) => items.map((item, i) => i === index ? { ...item, price: e.target.value } : item))} />{lineItems.length > 1 && <button type="button" aria-label={`Remove item ${index + 1}`} className="px-2 text-sm font-semibold text-rose-600" onClick={() => setLineItems((items) => items.filter((_, i) => i !== index))}>Remove</button>}</div>)}<button type="button" className="text-sm font-semibold text-sky-700 hover:underline" onClick={() => setLineItems((items) => [...items, { description: '', quantity: '1', price: '' }])}>+ Add line item</button></div>
      <label className="text-xs text-slate-500">Discount (%)<input min="0" max="100" step="0.01" type="number" className={`${field} mt-1`} value={discount} onChange={(e) => setDiscount(e.target.value)} /></label>
      <label className="text-xs text-slate-500">Tax (%)<input min="0" max="100" step="0.01" type="number" className={`${field} mt-1`} value={tax} onChange={(e) => setTax(e.target.value)} /></label>
      <textarea className={`${field} md:col-span-2`} rows={2} placeholder="Terms and notes" value={terms} onChange={(e) => setTerms(e.target.value)} />
      <div className="flex items-center justify-between md:col-span-2"><span className="text-sm text-slate-500">Currency amounts are saved in minor units.</span><button disabled={busy} className={action}>{busy ? 'Saving…' : 'Create quote'}</button></div>
    </form></section>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-900">Quotes</h2></div><div className="divide-y divide-slate-100">{quotes.map((quote) => <article key={quote.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold text-slate-900">{quote.title}</h3><p className="mt-1 text-xs text-slate-500">{quote.line_items.map((line) => `${line.description} · ${quote.currency} ${(line.amount_cents / 100).toFixed(2)}`).join(' | ')}</p></div><div className="flex flex-wrap items-center gap-3"><span className="font-bold text-slate-900">{quote.currency} {(quote.total_cents / 100).toFixed(2)}</span><span className={`rounded-full px-2 py-1 text-xs font-semibold ${quote.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{quote.status}</span><button className="text-sm font-semibold text-sky-700 hover:underline" onClick={() => void showPdf(quote.id)}>Preview PDF</button><button className="text-sm font-semibold text-sky-700 hover:underline" onClick={() => void copyAcceptance(quote)}>Copy accept link</button>{quote.status !== 'accepted' && <button className="text-sm font-semibold text-rose-600 hover:underline" onClick={() => void remove(quote.id)}>Delete</button>}</div></article>)}{!quotes.length && <p className="p-8 text-center text-sm text-slate-500">No quotes yet. Create your first proposal above.</p>}</div></section>
    {pdfUrl && <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex items-center justify-between px-4 py-3"><h2 className="font-semibold">PDF preview</h2><button className="text-sm text-slate-500 hover:text-slate-900" onClick={() => { URL.revokeObjectURL(pdfUrl); setPdfUrl(''); }}>Close preview</button></div><iframe title="Quote PDF preview" src={pdfUrl} className="h-[640px] w-full border-t border-slate-100" /></section>}
    <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-700">Add a rate card</summary><RateCardForm onCreated={async () => { await load(); }} /></details>
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

function RateCardForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState(''); const [currency, setCurrency] = useState('USD'); const [rate, setRate] = useState(''); const [message, setMessage] = useState('');
  return <form className="mt-3 flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); try { await apiRequest('/quotes/rate-cards', { method: 'POST', body: JSON.stringify({ name, currency, default_rate_cents: Math.round(Number(rate || 0) * 100) }) }); setName(''); setRate(''); setMessage('Rate card added.'); await onCreated(); } catch (err) { setMessage(err instanceof Error ? err.message : 'Unable to add rate card'); } }}><input className={field} required placeholder="Rate card name" value={name} onChange={(e) => setName(e.target.value)} /><select className={field} value={currency} onChange={(e) => setCurrency(e.target.value)}><option>USD</option><option>EUR</option><option>INR</option><option>GBP</option></select><input className={field} type="number" min="0" step="0.01" placeholder="Default hourly rate" value={rate} onChange={(e) => setRate(e.target.value)} /><button className={action}>Save rate card</button>{message && <span className="self-center text-sm text-slate-500">{message}</span>}</form>;
}
