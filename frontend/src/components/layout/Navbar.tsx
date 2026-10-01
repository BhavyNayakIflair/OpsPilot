import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Command, LogOut, Menu, Moon, Search, Sun, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const destinations = [
  ['Dashboard', '/dashboard'], ['CRM & Leads', '/crm'], ['Quotes & Proposals', '/quotes'],
  ['Projects & Tasks', '/projects'], ['Timesheets', '/timesheets'], ['Invoices & Billing', '/invoicing'],
  ['Expenses & Bills', '/expenses'], ['People & Team', '/people'], ['Documents & Knowledge', '/documents'],
  ['Agent Workflows', '/workflows'], ['Approvals Inbox', '/approvals'], ['Workspace settings', '/settings'],
];

export const Navbar: React.FC<{ onMenu?: () => void }> = ({ onMenu }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isDark, setIsDark] = React.useState(() => localStorage.getItem('opspilot_theme') === 'dark');
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('opspilot_theme', isDark ? 'dark' : 'light');
  }, [isDark]);
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen((open) => !open); }
      if (event.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const filtered = destinations.filter(([label]) => label.toLowerCase().includes(query.toLowerCase()));
  const openDestination = (path: string) => { setPaletteOpen(false); setQuery(''); navigate(path); };

  return <>
    <header className="z-20 flex h-[68px] shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Open navigation" onClick={onMenu}><Menu className="h-5 w-5" /></button>
        <button onClick={() => setPaletteOpen(true)} className="flex w-full max-w-[520px] items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-sm text-slate-500 transition hover:border-indigo-300 hover:bg-white">
          <span className="flex items-center gap-2.5"><Search className="h-4 w-4" /><span className="hidden sm:inline">Jump to a page or workspace</span><span className="sm:hidden">Search pages</span></span>
          <kbd className="hidden items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400 sm:inline-flex"><Command className="h-3 w-3" /> K</kbd>
        </button>
      </div>
      <div className="ml-3 flex items-center gap-1 sm:gap-2">
        <button onClick={() => setIsDark((value) => !value)} title={isDark ? 'Use light theme' : 'Use dark theme'} className="rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800">{isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}</button>
        <div className="mx-1 hidden h-7 w-px bg-slate-200 sm:block" />
        <div className="hidden text-right sm:block"><p className="text-xs font-semibold text-slate-800">{user?.full_name}</p><p className="mt-0.5 text-[11px] capitalize text-slate-500">{user?.role} · {user?.org_name}</p></div>
        <button onClick={logout} title="Sign out" className="ml-1 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"><LogOut className="h-4 w-4" /><span className="hidden lg:inline">Sign out</span></button>
      </div>
    </header>
    {paletteOpen && <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/35 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) setPaletteOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-label="Navigate OpsPilot" className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4"><Search className="h-4 w-4 text-slate-400" /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a page…" className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" /><button onClick={() => setPaletteOpen(false)} aria-label="Close search" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
        <div className="max-h-[55vh] overflow-y-auto p-2">{filtered.map(([label, path]) => <button key={path} onClick={() => openDestination(path)} className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700"><span>{label}</span><span className="text-[11px] text-slate-400">Open</span></button>)}{!filtered.length && <p className="p-7 text-center text-sm text-slate-500">No pages match “{query}”.</p>}</div>
        <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3 text-[11px] text-slate-400"><Check className="h-3.5 w-3.5" />Quick navigation · AI drafting is available inside Quotes</div>
      </section>
    </div>}
  </>;
};
