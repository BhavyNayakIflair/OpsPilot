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
  const { user, refreshUser } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<RoleType>('employee');
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [loading, setLoading] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [fullName, setFullName] = useState(user?.full_name || '');

  const fetchOrgData = async () => {
    try {
      const orgData = await apiRequest<Organization>('/organizations/current');
      setOrg(orgData);
      setOrgName(orgData.name); setCurrency(orgData.currency);
      const membersData = await apiRequest<Member[]>('/organizations/members');
      setMembers(membersData);
    } catch (err: any) {
      console.error('Failed to load org details:', err);
    }
  };

  useEffect(() => {
    fetchOrgData();
  }, []);

  useEffect(() => { if (user?.full_name) setFullName(user.full_name); }, [user?.full_name]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setMsg(null);
    try { await apiRequest('/users/profile', { method: 'PUT', body: JSON.stringify({ full_name: fullName }) }); await refreshUser(); setMsg({ text: 'Your profile has been updated.', type: 'success' }); }
    catch (err) { setMsg({ text: err instanceof Error ? err.message : 'Could not update profile.', type: 'error' }); }
    finally { setLoading(false); }
  };

  const saveOrganization = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setMsg(null);
    try { const updated = await apiRequest<Organization>('/organizations/current', { method: 'PUT', body: JSON.stringify({ name: orgName, currency }) }); setOrg(updated); setMsg({ text: 'Workspace settings have been updated.', type: 'success' }); await refreshUser(); }
    catch (err) { setMsg({ text: err instanceof Error ? err.message : 'Could not update workspace.', type: 'error' }); }
    finally { setLoading(false); }
  };

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

  const removeMember = async (member: Member) => {
    if (!window.confirm(`Remove ${member.full_name} from this workspace?`)) return;
    try { await apiRequest(`/organizations/members/${member.id}`, { method: 'DELETE' }); setMsg({ text: `${member.full_name} no longer has workspace access.`, type: 'success' }); await fetchOrgData(); }
    catch (err) { setMsg({ text: err instanceof Error ? err.message : 'Could not remove workspace member.', type: 'error' }); }
  };

  return (
    <div className="page-shell max-w-6xl">
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
        <h1 className="page-title">
          Workspace settings
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Organization Info */}
        <form onSubmit={(e) => void saveOrganization(e)} className="panel space-y-4 p-5 lg:col-span-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Shield className="w-4 h-4 text-sky-500" />
            <span>Organization Profile</span>
          </div>

          <label className="block text-xs font-semibold text-slate-600">Workspace name<input className="field-control mt-1.5" required value={orgName} onChange={(e) => setOrgName(e.target.value)} /></label>

          <div>
            <div className="text-xs text-slate-400">Workspace Identifier (Slug)</div>
            <div className="text-xs font-mono font-medium text-slate-700 dark:text-slate-300 mt-0.5 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded inline-block">
              {org?.slug || 'northwind'}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400">Operating Currency</div>
            <label className="mt-1 block text-xs font-semibold text-slate-600">Default currency<select className="field-control mt-1.5" value={currency} onChange={(e) => setCurrency(e.target.value)}><option>USD</option><option>EUR</option><option>INR</option><option>GBP</option></select></label>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">AI spend cap</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                ${((org?.monthly_spend_cap_cents ?? 5000) / 100).toFixed(2)}
              </span>
            </div>
            <div className="mt-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-sky-500 h-1.5 rounded-full"
                style={{
                  width: `${Math.min(
                    100,
                    (((org?.ai_spend_cents ?? 0) / (org?.monthly_spend_cap_cents ?? 5000)) * 100)
                  )}%`,
                }}
              ></div>
            </div>
          </div>
          {user?.role === 'owner' && <button disabled={loading} className="primary-button w-full">{loading ? 'Saving…' : 'Save workspace'}</button>}
        </form>

        {/* Members & RBAC */}
        <div className="space-y-6 lg:col-span-2">
          <form onSubmit={(e) => void saveProfile(e)} className="panel space-y-4 p-5">
            <div><h2 className="font-bold text-slate-900">Your profile</h2><p className="mt-1 text-sm text-slate-500">Update the name shown to your workspace.</p></div>
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Full name<input className="field-control mt-1.5" required value={fullName} onChange={(e) => setFullName(e.target.value)} /></label><label className="text-xs font-semibold text-slate-600">Email address<input className="field-control mt-1.5 bg-slate-50" readOnly value={user?.email || ''} /></label></div>
            <button disabled={loading} className="primary-button">{loading ? 'Saving…' : 'Save profile'}</button>
          </form>
          {/* Member List */}
          <div className="panel p-5">
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
                    {user?.role === 'owner' && <th className="pb-2 font-medium">Change role</th>}
                    {user?.role === 'owner' && <th className="pb-2 font-medium">Access</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {members.map((m) => (
                    <tr key={m.id} className="text-slate-700 dark:text-slate-300">
                      <td className="py-2.5">
                        <div className="font-medium text-slate-900 dark:text-white">{m.full_name}</div>
                        <div className="text-[11px] text-slate-400">{m.email}</div>
                      </td>
                      {user?.role === 'owner' && <td className="py-2.5"><select aria-label={`Role for ${m.full_name}`} className="field-control min-w-36" value={m.role} onChange={async (e) => { const role = e.target.value as RoleType; setLoading(true); try { await apiRequest('/organizations/members', { method: 'POST', body: JSON.stringify({ email: m.email, role }) }); setMsg({ text: `Updated ${m.full_name} to ${role}.`, type: 'success' }); await fetchOrgData(); } catch (err) { setMsg({ text: err instanceof Error ? err.message : 'Could not update member role.', type: 'error' }); } finally { setLoading(false); } }}><option value="employee">Employee</option><option value="sales">Sales</option><option value="project_manager">Project manager</option><option value="finance">Finance</option><option value="approver">Approver</option><option value="owner">Owner</option></select></td>}
                      {user?.role === 'owner' && <td className="py-2.5">{m.user_id !== user.id && <button className="font-semibold text-rose-600 hover:underline" onClick={() => void removeMember(m)}>Remove</button>}</td>}
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
              <form onSubmit={handleInvite} className="mt-6 space-y-3 border-t border-slate-100 pt-4">
                <div className="text-xs font-bold text-slate-900 dark:text-white mb-2">
                  Add / Invite Team Member
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <label className="text-xs font-semibold text-slate-600">Member email
                  <input
                    type="email"
                    required
                    placeholder="teammate@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="field-control mt-1.5"
                  />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">Workspace role
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as RoleType)}
                    className="field-control mt-1.5"
                  >
                    <option value="employee">Employee</option>
                    <option value="sales">Sales</option>
                    <option value="project_manager">Project Manager</option>
                    <option value="finance">Finance</option>
                    <option value="approver">Approver</option>
                    <option value="owner">Owner</option>
                  </select>
                  </label>
                  <button
                    type="submit"
                    disabled={loading}
                    className="primary-button self-end"
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
