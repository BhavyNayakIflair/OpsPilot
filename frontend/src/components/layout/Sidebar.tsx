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

interface NavItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  isAi?: boolean;
}

const navItems: NavItem[] = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { name: 'CRM & Leads', path: '/crm', icon: Users },
  { name: 'Quotes & Proposals', path: '/quotes', icon: FileText },
  { name: 'Projects & Tasks', path: '/projects', icon: FolderKanban },
  { name: 'Timesheets', path: '/timesheets', icon: Clock },
  { name: 'Invoices & Billing', path: '/invoicing', icon: Receipt },
  { name: 'Expenses & Bills', path: '/expenses', icon: CreditCard },
  { name: 'People & Team', path: '/people', icon: Contact },
  { name: 'Documents & SOWs', path: '/documents', icon: BookOpen },
  { name: 'Odoo Migration', path: '/migration', icon: ArrowLeftRight, badge: 'New' },
  { name: 'Agent Workflows', path: '/workflows', icon: Bot, isAi: true },
  { name: 'Approvals Inbox', path: '/approvals', icon: CheckCircle2, badge: '3' },
  { name: 'Settings', path: '/settings', icon: Settings },
];

export const Sidebar: React.FC = () => {
  const { user } = useAuth();

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col h-screen border-r border-slate-800 select-none">
      {/* Brand Header */}
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

      {/* Tenant Indicator */}
      <div className="px-4 py-3 border-b border-slate-800/80 bg-slate-950/40">
        <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Workspace</div>
        <div className="text-sm font-semibold text-white truncate flex items-center gap-1.5 mt-0.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          {user?.org_name || 'My Organization'}
        </div>
        <div className="text-xs text-slate-400 flex items-center justify-between mt-1">
          <span className="capitalize text-[11px] text-sky-400 font-medium">Role: {user?.role || 'employee'}</span>
          <span className="text-[10px] bg-slate-800 px-1.5 py-0.2 rounded text-slate-300">v0.1</span>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                }`
              }
            >
              <div className="flex items-center gap-3">
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.name}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {item.isAi && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold">
                    AI
                  </span>
                )}
                {item.badge && (
                  <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-sky-500 text-white font-semibold">
                    {item.badge}
                  </span>
                )}
              </div>
            </NavLink>
          );
        })}
      </div>

      {/* Bottom User Bar */}
      <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/20">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-xs text-white uppercase">
            {user?.full_name?.charAt(0) || 'U'}
          </div>
          <div className="overflow-hidden">
            <div className="text-sm font-medium text-white truncate">{user?.full_name || 'User'}</div>
            <div className="text-xs text-slate-400 truncate">{user?.email || ''}</div>
          </div>
        </div>
      </div>
    </aside>
  );
};
