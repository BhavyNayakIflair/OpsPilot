import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Command, LogOut, Menu, Moon, Search, Sun, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation, type TranslationKey } from '../../i18n';
import type { RoleType } from '../../types/auth';

const destinations: [TranslationKey, string][] = [
  ['dashboard', '/dashboard'], ['crmLeads', '/crm'], ['quotesProposals', '/quotes'],
  ['projectsTasks', '/projects'], ['timesheets', '/timesheets'], ['invoicesBilling', '/invoicing'],
  ['expensesBills', '/expenses'], ['peopleTeam', '/people'], ['documentsKnowledge', '/documents'],
  ['agentWorkflows', '/workflows'], ['approvalsInbox', '/approvals'], ['workspaceSettings', '/settings'],
];

const roleLabels: Record<RoleType, TranslationKey> = {
  owner: 'owner',
  sales: 'sales',
  project_manager: 'projectManager',
  finance: 'financeRole',
  employee: 'employee',
  approver: 'approver',
};

export const Navbar: React.FC<{ onMenu?: () => void }> = ({ onMenu }) => {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (event.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtered = destinations.filter(([key]) => t(key).toLowerCase().includes(query.toLowerCase()));
  const openDestination = (path: string) => {
    setPaletteOpen(false);
    setQuery('');
    navigate(path);
  };

  return (
    <>
      <header className="z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-semantic-border bg-semantic-surface/80 px-4 backdrop-blur-xl sm:px-6">
        {/* Left: mobile menu + search trigger */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            className="rounded-ui-xl p-2 text-semantic-text-muted transition hover:bg-semantic-surface-muted hover:text-semantic-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-border md:hidden"
            aria-label={t('openNavigation')}
            onClick={onMenu}
          >
            <Menu className="h-5 w-5" />
          </button>

          <button
            onClick={() => setPaletteOpen(true)}
            className="group flex w-full max-w-[460px] items-center justify-between gap-3 rounded-ui-xl border border-semantic-border bg-semantic-surface-muted/70 px-3.5 py-2 text-left text-sm text-semantic-text-muted transition hover:border-semantic-accent/50 hover:bg-semantic-surface focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-accent-ring"
          >
            <span className="flex items-center gap-2.5">
              <Search className="h-4 w-4 transition-colors group-hover:text-semantic-accent" />
              <span className="hidden sm:inline">{t('jumpToPage')}</span>
              <span className="sm:hidden">{t('searchPages')}</span>
            </span>
            <kbd className="hidden items-center gap-1 rounded-ui-md border border-semantic-border bg-semantic-surface px-1.5 py-0.5 text-[10px] font-medium text-semantic-text-subtle shadow-sm sm:inline-flex">
              <Command className="h-3 w-3" /> K
            </kbd>
          </button>
        </div>

        {/* Right: theme, user, sign out */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <button
            onClick={() => setIsDark((value) => !value)}
            title={isDark ? t('useLightTheme') : t('useDarkTheme')}
            aria-label={isDark ? t('useLightTheme') : t('useDarkTheme')}
            className="rounded-ui-xl p-2.5 text-semantic-text-muted transition hover:bg-semantic-surface-muted hover:text-semantic-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-border"
          >
            {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </button>

          <div className="mx-1 hidden h-7 w-px bg-semantic-border sm:block" />

          <div className="hidden items-center gap-2.5 sm:flex">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-xs font-bold uppercase text-white shadow-sm ring-2 ring-semantic-surface">
              {user?.full_name?.charAt(0) || 'U'}
            </div>
            <div className="text-left leading-tight">
              <p className="text-xs font-semibold text-semantic-text">{user?.full_name}</p>
              <p className="mt-0.5 text-[11px] capitalize text-semantic-text-muted">
                {user ? t(roleLabels[user.role]) : ''} · {user?.org_name}
              </p>
            </div>
          </div>

          <button
            onClick={logout}
            title={t('signOut')}
            className="ml-1 flex items-center gap-2 rounded-ui-xl border border-semantic-border px-3 py-2 text-xs font-semibold text-semantic-text-muted transition hover:border-semantic-danger/40 hover:bg-semantic-danger-soft hover:text-semantic-danger focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-danger-ring"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden lg:inline">{t('signOut')}</span>
          </button>
        </div>
      </header>

      {/* Command palette */}
      {paletteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/40 px-4 pt-[12vh] backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPaletteOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={t('navigateOpsPilot')}
            className="w-full max-w-xl overflow-hidden rounded-ui-2xl border border-semantic-border bg-semantic-surface shadow-ui-xl"
          >
            <div className="flex items-center gap-3 border-b border-semantic-border px-4">
              <Search className="h-4 w-4 shrink-0 text-semantic-text-subtle" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('findPage')}
                className="h-14 min-w-0 flex-1 bg-transparent text-sm text-semantic-text outline-none placeholder:text-semantic-text-subtle"
              />
              <button
                onClick={() => setPaletteOpen(false)}
                aria-label={t('closeNavigation')}
                className="rounded-ui-lg p-1.5 text-semantic-text-subtle transition hover:bg-semantic-surface-muted hover:text-semantic-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[55vh] overflow-y-auto p-2 [scrollbar-width:thin]">
              {filtered.map(([key, path]) => (
                <button
                  key={path}
                  onClick={() => openDestination(path)}
                  className="group flex w-full items-center justify-between rounded-ui-xl px-3 py-2.5 text-left text-sm font-medium text-semantic-text transition hover:bg-semantic-accent-soft hover:text-semantic-accent focus-visible:bg-semantic-accent-soft focus-visible:outline-none"
                >
                  <span>{t(key)}</span>
                  <span className="text-[11px] text-semantic-text-subtle transition group-hover:text-semantic-accent">
                    {t('open')}
                  </span>
                </button>
              ))}
              {!filtered.length && (
                <p className="p-7 text-center text-sm text-semantic-text-muted">{t('noPagesMatch', { query })}</p>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-semantic-border bg-semantic-surface-muted/50 px-4 py-2.5 text-[11px] text-semantic-text-subtle">
              <span className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5" />
                {t('quickNavigation')}
              </span>
              <kbd className="rounded-ui-md border border-semantic-border bg-semantic-surface px-1.5 py-0.5 text-[10px] font-medium">
                Esc
              </kbd>
            </div>
          </section>
        </div>
      )}
    </>
  );
};