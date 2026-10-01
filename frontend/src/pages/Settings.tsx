import React, { useEffect, useState } from 'react';
import { Shield, Users, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import type { Organization, RoleType } from '../types/auth';

interface Member {
  id: string;
  user_id: string;
  org_id: string;
  role: RoleType;
  email: string;
  full_name: string;
  created_at: string;
}

export const Settings: React.FC = () => {
  const { user } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<RoleType>('employee');
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchOrgData = async () => {
    try {
      const orgData = await apiRequest<Organization>('/organizations/current');
      setOrg(orgData);
      const membersData = await apiRequest<Member[]>('/organizations/members');
      setMembers(membersData);
    } catch (err: any) {
      console.error('Failed to load org details:', err);
    }
  };

  useEffect(() => {
    fetchOrgData();
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      await apiRequest('/organizations/members', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      setMsg({ text: `Invited/updated ${inviteEmail} as ${inviteRole}`, type: 'success' });
      setInviteEmail('');
      await fetchOrgData();
    } catch (err: any) {
      setMsg({ text: err.message || 'Failed to invite member', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Workspace Settings & RBAC
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Manage organization profile, team members, roles, and plan limits.
        </p>
      </div>

      {msg && (
        <div
          className={`p-3.5 rounded-xl border flex items-center gap-2 text-xs font-medium ${
            msg.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{msg.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Organization Info */}
        <div className="lg:col-span-1 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Shield className="w-4 h-4 text-sky-500" />
            <span>Organization Profile</span>
          </div>

          <div>
            <div className="text-xs text-slate-400">Company Name</div>
            <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
              {org?.name || user?.org_name}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400">Workspace Identifier (Slug)</div>
            <div className="text-xs font-mono font-medium text-slate-700 dark:text-slate-300 mt-0.5 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded inline-block">
              {org?.slug || 'northwind'}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400">Operating Currency</div>
            <div className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
              {org?.currency || 'USD'}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Monthly AI Budget</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                ${((org?.monthly_spend_cap_cents || 5000) / 100).toFixed(2)}
              </span>
            </div>
            <div className="mt-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-sky-500 h-1.5 rounded-full"
                style={{
                  width: `${Math.min(
                    100,
                    (((org?.ai_spend_cents || 482) / (org?.monthly_spend_cap_cents || 5000)) * 100)
                  )}%`,
                }}
              ></div>
            </div>
          </div>
        </div>

        {/* Members & RBAC */}
        <div className="lg:col-span-2 space-y-6">
          {/* Member List */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                <Users className="w-4 h-4 text-sky-500" />
                <span>Team Members ({members.length})</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400">
                    <th className="pb-2 font-medium">User</th>
                    <th className="pb-2 font-medium">Role</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {members.map((m) => (
                    <tr key={m.id} className="text-slate-700 dark:text-slate-300">
                      <td className="py-2.5">
                        <div className="font-medium text-slate-900 dark:text-white">{m.full_name}</div>
                        <div className="text-[11px] text-slate-400">{m.email}</div>
                      </td>
                      <td className="py-2.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {m.role}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Active
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Invite Form */}
            {user?.role === 'owner' && (
              <form onSubmit={handleInvite} className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="text-xs font-bold text-slate-900 dark:text-white mb-2">
                  Add / Invite Team Member
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="email"
                    required
                    placeholder="teammate@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as RoleType)}
                    className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="employee">Employee</option>
                    <option value="sales">Sales</option>
                    <option value="project_manager">Project Manager</option>
                    <option value="finance">Finance</option>
                    <option value="approver">Approver</option>
                    <option value="owner">Owner</option>
                  </select>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-all disabled:opacity-50"
                  >
                    {loading ? 'Adding...' : 'Add Member'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
