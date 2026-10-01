import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api';

type Company = { id: string; name: string; website?: string };
type Contact = { id: string; first_name: string; last_name: string; email?: string; company_id?: string };
type Stage = { id: string; name: string; position: number; probability: number; is_won: boolean; is_lost: boolean };
type Lead = { id: string; title: string; company_id?: string; contact_id?: string; stage_id?: string; status: string; value_cents: number; currency: string; source: string; notes?: string };
type Tab = 'Pipeline' | 'Leads' | 'Companies' | 'Contacts';
const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500';
const button = 'rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50';

export function CRM() {
  const [tab, setTab] = useState<Tab>('Pipeline');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactFirst, setContactFirst] = useState('');
  const [contactLast, setContactLast] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactCompany, setContactCompany] = useState('');
  const [leadTitle, setLeadTitle] = useState('');
  const [leadCompany, setLeadCompany] = useState('');
  const [leadValue, setLeadValue] = useState('');
  const [saving, setSaving] = useState(false);
  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [co, ct, st, ld] = await Promise.all([
        apiRequest<Company[]>('/crm/companies'), apiRequest<Contact[]>('/crm/contacts'),
        apiRequest<Stage[]>('/crm/stages'), apiRequest<Lead[]>('/crm/leads'),
      ]);
      setCompanies(co); setContacts(ct); setStages(st); setLeads(ld);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load CRM data'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const companyById = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const stageLeads = (stage: Stage) => leads.filter((lead) => lead.stage_id === stage.id);
  const moveLead = async (leadId: string, stageId: string) => {
    const before = leads; setLeads((rows) => rows.map((l) => l.id === leadId ? { ...l, stage_id: stageId } : l));
    try { await apiRequest(`/crm/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify({ stage_id: stageId }) }); }
    catch (e) { setLeads(before); setError(e instanceof Error ? e.message : 'Could not move lead'); }
  };
  const submit = async (path: string, payload: unknown, done: () => void) => {
    setSaving(true); setError('');
    try { await apiRequest(path, { method: 'POST', body: JSON.stringify(payload) }); done(); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save record'); }
    finally { setSaving(false); }
  };
  const tabs: Tab[] = ['Pipeline', 'Leads', 'Companies', 'Contacts'];
  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">CRM & Leads</h1><p className="mt-1 text-sm text-slate-500">Manage prospects, contacts, companies, and your sales pipeline.</p></div><div className="text-sm text-slate-500">{leads.length} leads · {companies.length} companies</div></div>
    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
    <div className="flex gap-1 border-b border-slate-200">{tabs.map((name) => <button key={name} onClick={() => setTab(name)} className={`px-4 py-2.5 text-sm font-semibold ${tab === name ? 'border-b-2 border-sky-600 text-sky-700' : 'text-slate-500 hover:text-slate-800'}`}>{name}</button>)}</div>
    {loading ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading CRM…</div> : <>
      {tab === 'Pipeline' && <div className="flex min-h-80 gap-4 overflow-x-auto pb-3">{stages.map((stage) => <section key={stage.id} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) void moveLead(id, stage.id); }} className="min-w-64 flex-1 rounded-xl border border-slate-200 bg-slate-100/70 p-3"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold text-slate-800">{stage.name}</h2><span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">{stageLeads(stage).length}</span></div><div className="space-y-2">{stageLeads(stage).map((lead) => <article key={lead.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', lead.id)} className="cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm active:cursor-grabbing"><div className="font-semibold text-slate-900">{lead.title}</div><div className="mt-1 text-xs text-slate-500">{companyById.get(lead.company_id || '') || 'No company'}</div><div className="mt-2 text-xs font-medium text-sky-700">{lead.currency} {(lead.value_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></article>)}</div></section>)}</div>}
      {tab === 'Leads' && <div className="space-y-4"><form onSubmit={(e) => { e.preventDefault(); void submit('/crm/leads', { title: leadTitle, company_id: leadCompany || null, stage_id: stages[0]?.id || null, value_cents: Math.round(Number(leadValue || 0) * 100), currency: 'USD' }, () => { setLeadTitle(''); setLeadValue(''); }); }} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[2fr_1fr_1fr_auto]"><input className={input} required placeholder="Lead or opportunity name" value={leadTitle} onChange={(e) => setLeadTitle(e.target.value)} /><select className={input} value={leadCompany} onChange={(e) => setLeadCompany(e.target.value)}><option value="">No company</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><input className={input} type="number" min="0" step="0.01" placeholder="Value (USD)" value={leadValue} onChange={(e) => setLeadValue(e.target.value)} /><button className={button} disabled={saving}>Add lead</button></form><div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Opportunity</th><th className="px-4 py-3">Company</th><th className="px-4 py-3">Stage</th><th className="px-4 py-3">Value</th><th className="px-4 py-3">Source</th></tr></thead><tbody>{leads.map((l) => <tr key={l.id} className="border-t border-slate-100"><td className="px-4 py-3 font-medium text-slate-900">{l.title}</td><td className="px-4 py-3 text-slate-600">{companyById.get(l.company_id || '') || '—'}</td><td className="px-4 py-3"><select aria-label={`Stage for ${l.title}`} className="rounded border border-slate-200 bg-white px-2 py-1" value={l.stage_id || ''} onChange={(e) => void moveLead(l.id, e.target.value)}>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td><td className="px-4 py-3">{l.currency} {(l.value_cents / 100).toFixed(2)}</td><td className="px-4 py-3 text-slate-500">{l.source}</td></tr>)}</tbody></table>{!leads.length && <p className="p-8 text-center text-sm text-slate-500">No leads yet. Add one above.</p>}</div></div>}
      {tab === 'Companies' && <div className="space-y-4"><form onSubmit={(e) => { e.preventDefault(); void submit('/crm/companies', { name: companyName }, () => setCompanyName('')); }} className="flex gap-2 rounded-xl border border-slate-200 bg-white p-4"><input className={input} required placeholder="Company name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} /><button className={button} disabled={saving}>Add company</button></form><div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">{companies.map((c) => <div key={c.id} className="px-4 py-3 font-medium text-slate-800">{c.name}<span className="ml-3 text-xs text-slate-400">{c.website}</span></div>)}{!companies.length && <p className="p-6 text-sm text-slate-500">No companies yet.</p>}</div></div>}
      {tab === 'Contacts' && <div className="space-y-4"><form onSubmit={(e) => { e.preventDefault(); void submit('/crm/contacts', { first_name: contactFirst, last_name: contactLast, email: contactEmail || null, company_id: contactCompany || null }, () => { setContactFirst(''); setContactLast(''); setContactEmail(''); }); }} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5"><input className={input} required placeholder="First name" value={contactFirst} onChange={(e) => setContactFirst(e.target.value)} /><input className={input} required placeholder="Last name" value={contactLast} onChange={(e) => setContactLast(e.target.value)} /><input className={input} type="email" placeholder="Email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} /><select className={input} value={contactCompany} onChange={(e) => setContactCompany(e.target.value)}><option value="">No company</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button className={button} disabled={saving}>Add contact</button></form><div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Company</th><th className="px-4 py-3">Email</th></tr></thead><tbody>{contacts.map((c) => <tr key={c.id} className="border-t border-slate-100"><td className="px-4 py-3 font-medium">{c.first_name} {c.last_name}</td><td className="px-4 py-3">{companyById.get(c.company_id || '') || '—'}</td><td className="px-4 py-3">{c.email || '—'}</td></tr>)}</tbody></table></div></div>}
    </>}
  </div>;
}
