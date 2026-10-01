import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BriefcaseBusiness, CheckCircle2, Clock3, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';

type Lead = { id: string; title: string; value_cents: number; currency: string; status: string; source: string };
type Project = { id: string; name: string; budget_minutes: number; status: string };
type Entry = { id: string; project_id: string; minutes: number; approval_status: string; is_billable: boolean };
type Approval = { id: string; entity_type: string; label: string };

export const Dashboard = () => {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]); const [projects, setProjects] = useState<Project[]>([]); const [entries, setEntries] = useState<Entry[]>([]); const [approvals, setApprovals] = useState<Approval[]>([]); const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const [leadRows, projectRows, entryRows, approvalRows] = await Promise.all([
        apiRequest<Lead[]>('/crm/leads'), apiRequest<Project[]>('/operations/projects'),
        apiRequest<Entry[]>('/operations/timesheets'), apiRequest<Approval[]>('/workflows/approvals').catch(() => []),
      ]);
      setLeads(leadRows); setProjects(projectRows); setEntries(entryRows); setApprovals(approvalRows); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Dashboard data is unavailable'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const activeLeads = leads.filter((lead) => lead.status === 'open');
  const activeProjects = projects.filter((project) => project.status === 'active');
  const pendingEntries = entries.filter((entry) => entry.approval_status === 'pending');
  const billableHours = entries.filter((entry) => entry.is_billable && entry.approval_status === 'approved').reduce((sum, entry) => sum + entry.minutes, 0) / 60;
  const cards = [
    { name: 'Open leads', value: activeLeads.length, description: `${leads.length} total leads`, icon: Users, color: 'text-sky-600' },
    { name: 'Active projects', value: activeProjects.length, description: `${projects.length} total projects`, icon: BriefcaseBusiness, color: 'text-indigo-600' },
    { name: 'Pending time entries', value: pendingEntries.length, description: `${billableHours.toFixed(1)} approved billable hours`, icon: Clock3, color: 'text-amber-600' },
    { name: 'Approvals needed', value: approvals.length, description: 'Time and expense submissions', icon: CheckCircle2, color: 'text-rose-600' },
  ];
  const projectHours = (project: Project) => entries.filter((entry) => entry.project_id === project.id).reduce((sum, entry) => sum + entry.minutes, 0) / 60;
  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4"><div><h1 className="text-2xl font-bold tracking-tight text-slate-900">Operations Dashboard</h1><p className="mt-1 text-sm text-slate-500">Live activity for <span className="font-semibold text-sky-700">{user?.org_name || 'your workspace'}</span>.</p></div><div className="flex gap-2"><Link to="/crm" className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white">Open CRM <ArrowUpRight className="h-3.5 w-3.5" /></Link><Link to="/approvals" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">Review approvals</Link></div></header>
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => { const Icon = card.icon; return <article key={card.name} className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between text-xs font-semibold text-slate-500">{card.name}<Icon className={`h-4 w-4 ${card.color}`} /></div><div className="mt-3 text-3xl font-bold text-slate-900">{card.value}</div><p className="mt-1 text-xs text-slate-500">{card.description}</p></article>; })}</section>
    <div className="grid gap-6 lg:grid-cols-2"><section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-900">Recent leads</h2><Link to="/crm" className="text-xs font-semibold text-sky-700">View pipeline</Link></div>{activeLeads.slice(0, 6).map((lead) => <div key={lead.id} className="flex items-center justify-between gap-3 border-b border-slate-50 px-5 py-3 last:border-0"><div><p className="text-sm font-semibold text-slate-800">{lead.title}</p><p className="mt-0.5 text-xs text-slate-500">{lead.source}</p></div><span className="text-xs font-semibold text-slate-600">{lead.currency} {(lead.value_cents / 100).toFixed(2)}</span></div>)}{!activeLeads.length && <p className="p-6 text-sm text-slate-500">No open leads.</p>}</section>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-900">Project time</h2><Link to="/projects" className="text-xs font-semibold text-sky-700">Manage projects</Link></div>{activeProjects.slice(0, 6).map((project) => { const used = projectHours(project); const budget = project.budget_minutes / 60; const pct = budget ? Math.min(100, used / budget * 100) : 0; return <div key={project.id} className="border-b border-slate-50 px-5 py-3 last:border-0"><div className="flex justify-between gap-2 text-sm"><span className="font-semibold text-slate-800">{project.name}</span><span className="text-xs text-slate-500">{used.toFixed(1)} / {budget.toFixed(1)}h</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${pct >= 80 ? 'bg-amber-500' : 'bg-sky-500'}`} style={{ width: `${pct}%` }} /></div></div>; })}{!activeProjects.length && <p className="p-6 text-sm text-slate-500">No active projects.</p>}</section></div>
  </div>;
};
