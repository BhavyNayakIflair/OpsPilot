import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FileText,
  FolderKanban,
  Clock,
  Receipt,
  CreditCard,
  Contact,
  BookOpen,
  ArrowLeftRight,
  Bot,
  CheckCircle2,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../lib/api';
import { useTranslation, type TranslationKey } from '../../i18n';
import { Badge } from '../ui/Badge';
import type { RoleType } from '../../types/auth';

interface NavItem {
  name: TranslationKey;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: TranslationKey;
  isAi?: boolean;
}

const navSections: { label: TranslationKey; items: NavItem[] }[] = [
  {
    label: 'workspace',
    items: [
      { name: 'dashboard', path: '/dashboard', icon: LayoutDashboard },
      { name: 'crmLeads', path: '/crm', icon: Users },
      { name: 'quotesProposals', path: '/quotes', icon: FileText },
    ],
  },
  {
    label: 'delivery',
    items: [
      { name: 'projectsTasks', path: '/projects', icon: FolderKanban },
      { name: 'timesheets', path: '/timesheets', icon: Clock },
    ],
  },
  {
    label: 'finance',
    items: [
      { name: 'invoicesBilling', path: '/invoicing', icon: Receipt },
      { name: 'expensesBills', path: '/expenses', icon: CreditCard },
    ],
  },
  {
    label: 'team',
    items: [
      { name: 'peopleTeam', path: '/people', icon: Contact },
      { name: 'documentsSows', path: '/documents', icon: BookOpen },
      { name: 'odooMigration', path: '/migration', icon: ArrowLeftRight, badge: 'new' },
    ],
  },
  {
    label: 'automation',
    items: [
      { name: 'agentWorkflows', path: '/workflows', icon: Bot, isAi: true },
      { name: 'approvalsInbox', path: '/approvals', icon: CheckCircle2 },
    ],
  },
  {
    label: 'admin',
    items: [
      { name: 'settings', path: '/settings', icon: Settings },
    ],
  },
];

const roleLabels: Record<RoleType, TranslationKey> = {
  owner: 'owner',
  sales: 'sales',
  project_manager: 'projectManager',
  finance: 'financeRole',
  employee: 'employee',
  approver: 'approver',
};

export const Sidebar: React.FC<{ onNavigate?: () => void }> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [approvalCount, setApprovalCount] = React.useState(0);

  // Tracks whether the nav list is scrolled to its edges so the soft fade
  // hints only appear when there is more content in that direction.
  const navRef = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState({ top: true, bottom: true });

  const updateEdges = React.useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    setEdges({
      top: el.scrollTop <= 2,
      bottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 2,
    });
  }, []);

  React.useEffect(() => {
    let active = true;
    void apiRequest<{ id: string }[]>('/workflows/approvals').then((items) => {
      if (active) setApprovalCount(items.length);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  React.useEffect(() => {
    updateEdges();
    window.addEventListener('resize', updateEdges);
    return () => window.removeEventListener('resize', updateEdges);
  }, [updateEdges]);

  return (
    <aside
      className="relative flex h-screen max-h-screen w-[280px] select-none flex-col border-r border-white/5 bg-gradient-to-b from-[#0b1220] via-[#0f172a] to-[#0b1220] text-slate-300 shadow-2xl md:w-[260px]"
    >
      {/* Brand */}
      <div className="flex h-14 shrink-0 items-center gap-3 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 via-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/25 ring-1 ring-white/10">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[17px] font-semibold tracking-tight text-white">OpsPilot</span>
          <span className="rounded-md border border-sky-400/25 bg-sky-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-sky-300">
            AI SaaS
          </span>
        </div>
      </div>

      {/* Workspace card */}
      <div className="shrink-0 px-3 pb-3">
        <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5 ring-1 ring-inset ring-white/[0.02]">
          <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            {t('workspace')}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="truncate text-sm font-semibold text-white">
              {user?.org_name || t('myOrganization')}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[11px] font-medium capitalize text-sky-400">
              {t('role')}: {t(user ? roleLabels[user.role] : 'employee')}
            </span>
            <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">v0.1</span>
          </div>
        </div>
      </div>

      {/* Navigation: scrolls when needed, but the scrollbar itself is hidden */}
      <nav aria-label="Main navigation" className="relative min-h-0 flex-1">
        <div
          ref={navRef}
          onScroll={updateEdges}
          className="h-full space-y-3 overflow-y-auto px-3 pb-4 pt-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {navSections.map((section) => (
            <div key={section.label}>
              <div className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                {t(section.label)}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        `group relative flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-sky-500/60 ${
                          isActive
                            ? 'bg-gradient-to-r from-sky-500/15 to-transparent text-white'
                            : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-100'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.7)]" />
                          )}
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${
                                isActive
                                  ? 'bg-sky-500/20 text-sky-300'
                                  : 'text-slate-500 group-hover:text-slate-200'
                              }`}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="truncate">{t(item.name)}</span>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {item.isAi && (
                              <Badge variant="ai">AI</Badge>
                            )}
                            {item.path === '/approvals' && approvalCount > 0 && (
                              <Badge variant="count">{approvalCount}</Badge>
                            )}
                            {item.badge && item.path !== '/approvals' && (
                              <Badge variant="new">{t(item.badge)}</Badge>
                            )}
                          </div>
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Soft fades replace the scrollbar as the "more content" hint */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-[#0f172a] to-transparent transition-opacity duration-200 ${
            edges.top ? 'opacity-0' : 'opacity-100'
          }`}
        />
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#0b1220] to-transparent transition-opacity duration-200 ${
            edges.bottom ? 'opacity-0' : 'opacity-100'
          }`}
        />
      </nav>

      {/* User footer */}
      <div className="shrink-0 border-t border-white/5 bg-black/20 p-3">
        <div className="flex items-center gap-3 overflow-hidden rounded-xl px-2 py-1.5">
          <div className="relative shrink-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-800 text-xs font-bold uppercase text-white ring-1 ring-white/10">
              {user?.full_name?.charAt(0) || 'U'}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0b1220] bg-emerald-400" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-white">{user?.full_name || t('user')}</div>
            <div className="truncate text-xs text-slate-500">{user?.email || ''}</div>
          </div>
        </div>
      </div>
    </aside>
  );
};