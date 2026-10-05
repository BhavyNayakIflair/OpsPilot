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
  React.useEffect(() => {
    let active = true;
    void apiRequest<{ id: string }[]>('/workflows/approvals').then((items) => {
      if (active) setApprovalCount(items.length);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  return (
    <aside className="flex h-screen w-[280px] select-none flex-col border-r border-slate-800 bg-[#111827] text-slate-300 shadow-2xl md:w-[260px]">
      <div className="h-16 flex items-center px-6 gap-3 border-b border-slate-800">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
          <Sparkles className="w-4 h-4" />
        </div>
        <div>
          <span className="font-bold text-white text-lg tracking-tight">OpsPilot</span>
          <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 font-semibold border border-sky-500/30">
            AI SaaS
          </span>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-slate-800/80 bg-slate-950/40">
        <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{t('workspace')}</div>
        <div className="text-sm font-semibold text-white truncate flex items-center gap-1.5 mt-0.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          {user?.org_name || t('myOrganization')}
        </div>
        <div className="text-xs text-slate-400 flex items-center justify-between mt-1">
          <span className="capitalize text-[11px] text-sky-400 font-medium">{t('role')}: {t(user ? roleLabels[user.role] : 'employee')}</span>
          <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">v0.1</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
        {navSections.map((section) => (
          <div key={section.label}>
            <div className="px-3 pt-4 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-semantic-text-subtle">
              {t(section.label)}
            </div>
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${isActive
                        ? 'bg-sky-600/20 text-sky-400 border border-sky-500/40 shadow-md shadow-sky-500/10'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                      }`
                    }
                    onClick={onNavigate}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{t(item.name)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
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
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/20">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-xs text-white uppercase">
            {user?.full_name?.charAt(0) || 'U'}
          </div>
          <div className="overflow-hidden">
            <div className="text-sm font-medium text-white truncate">{user?.full_name || t('user')}</div>
            <div className="text-xs text-slate-400 truncate">{user?.email || ''}</div>
          </div>
        </div>
      </div>
    </aside>
  );
};
