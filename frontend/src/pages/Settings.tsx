import React, { useEffect, useState, useMemo } from 'react';
import { Shield, Users } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Card, CardHeader, CardContent, PageHeader, Button, Badge, Alert } from '../components/ui/';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import type { Organization, RoleType } from '../types/auth';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
      setOrgName(orgData.name);
      setCurrency(orgData.currency);
      const membersData = await apiRequest<Member[]>('/organizations/members');
      setMembers(membersData);
    } catch (err: any) {
      console.error('Failed to load org details:', err);
    }
  };

  useEffect(() => {
    fetchOrgData();
  }, []);

  useEffect(() => {
    if (user?.full_name) setFullName(user.full_name);
  }, [user?.full_name]);

  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [members]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      await apiRequest('/users/profile', {
        method: 'PUT',
        body: JSON.stringify({ full_name: fullName }),
      });
      await refreshUser();
      setMsg({ text: 'Your profile has been updated.', type: 'success' });
    } catch (err) {
      setMsg({
        text: err instanceof Error ? err.message : 'Could not update profile.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const saveOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const updated = await apiRequest<Organization>('/organizations/current', {
        method: 'PUT',
        body: JSON.stringify({ name: orgName, currency }),
      });
      setOrg(updated);
      setMsg({ text: 'Workspace settings have been updated.', type: 'success' });
      await refreshUser();
    } catch (err) {
      setMsg({
        text: err instanceof Error ? err.message : 'Could not update workspace.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
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
    try {
      await apiRequest(`/organizations/members/${member.id}`, { method: 'DELETE' });
      setMsg({ text: `${member.full_name} no longer has workspace access.`, type: 'success' });
      await fetchOrgData();
    } catch (err) {
      setMsg({
        text: err instanceof Error ? err.message : 'Could not remove workspace member.',
        type: 'error',
      });
    }
  };

  const fieldControlClass = cn(
    'mt-1.5 w-full rounded-ui-xl border border-semantic-border bg-semantic-surface',
    'px-3.5 py-2.5 text-sm text-semantic-text',
    'placeholder:text-semantic-text-muted/60',
    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-accent-ring focus-visible:border-semantic-accent',
    'disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-180ms'
  );

  return (
    <div className="page-shell max-w-6xl space-y-6">
      <PageHeader
        title="Workspace settings"
        description="Manage organization profile, team members, roles, and plan limits."
      />

      {msg && (
        <Alert
          variant={msg.type === 'success' ? 'success' : 'danger'}
          dismissible
          onDismiss={() => setMsg(null)}
        >
          {msg.text}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent>
            <form onSubmit={(e) => void saveOrganization(e)} className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-semantic-text-muted">
                <Shield className="w-4 h-4 text-semantic-accent" />
                <span>Organization Profile</span>
              </div>

              <label className="block text-xs font-semibold text-semantic-text">
                Workspace name
                <input
                  className={fieldControlClass}
                  required
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                />
              </label>

              <div>
                <div className="text-xs font-semibold text-semantic-text">
                  Workspace Identifier (Slug)
                </div>
                <div
                  className={cn(
                    'mt-1.5 inline-block rounded-ui-lg px-2.5 py-1.5',
                    'text-xs font-mono font-medium text-semantic-text',
                    'bg-semantic-surface-muted border border-semantic-border'
                  )}
                >
                  {org?.slug || 'northwind'}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-semantic-text">
                  Operating Currency
                  <select
                    className={fieldControlClass}
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    <option>USD</option>
                    <option>EUR</option>
                    <option>INR</option>
                    <option>GBP</option>
                  </select>
                </label>
              </div>

              <div className="pt-4 border-t border-semantic-border">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-semantic-text-muted">AI spend cap</span>
                  <span className="font-semibold text-semantic-text">
                    ${((org?.monthly_spend_cap_cents ?? 5000) / 100).toFixed(2)}
                  </span>
                </div>
                <div className="mt-2 w-full bg-semantic-surface-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-semantic-accent h-1.5 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(
                        100,
                        (((org?.ai_spend_cents ?? 0) / (org?.monthly_spend_cap_cents ?? 5000)) * 100)
                      )}%`,
                    }}
                  />
                </div>
              </div>
              {user?.role === 'owner' && (
                <Button type="submit" loading={loading} className="w-full">
                  {loading ? 'Saving&hellip;' : 'Save workspace'}
                </Button>
              )}
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent>
              <form onSubmit={(e) => void saveProfile(e)} className="space-y-4">
                <div>
                  <h2 className="font-bold text-semantic-text">Your profile</h2>
                  <p className="mt-1 text-sm text-semantic-text-muted">
                    Update the name shown to your workspace.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-semantic-text">
                    Full name
                    <input
                      className={fieldControlClass}
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </label>
                  <label className="text-xs font-semibold text-semantic-text">
                    Email address
                    <input
                      className={cn(fieldControlClass, 'bg-semantic-surface-muted')}
                      readOnly
                      value={user?.email || ''}
                    />
                  </label>
                </div>
                <Button type="submit" loading={loading}>
                  {loading ? 'Saving&hellip;' : 'Save profile'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-semantic-text-muted">
                <Users className="w-4 h-4 text-semantic-accent" />
                <span>Team Members ({sortedMembers.length})</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-semantic-border text-semantic-text-muted">
                      <th className="pb-2 font-medium">User</th>
                      {user?.role === 'owner' && (
                        <th className="pb-2 font-medium">Change role</th>
                      )}
                      {user?.role === 'owner' && (
                        <th className="pb-2 font-medium">Access</th>
                      )}
                      <th className="pb-2 font-medium">Role</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-semantic-border/60">
                    {sortedMembers.map((m) => (
                      <tr key={m.id} className="text-semantic-text-muted">
                        <td className="py-2.5">
                          <div className="font-medium text-semantic-text">
                            {m.full_name}
                          </div>
                          <div className="text-[11px] text-semantic-text-muted">
                            {m.email}
                          </div>
                        </td>
                        {user?.role === 'owner' && (
                          <td className="py-2.5">
                            <select
                              aria-label={`Role for ${m.full_name}`}
                              className={cn(fieldControlClass, 'min-w-36')}
                              value={m.role}
                              onChange={async (e) => {
                                const role = e.target.value as RoleType;
                                setLoading(true);
                                try {
                                  await apiRequest('/organizations/members', {
                                    method: 'POST',
                                    body: JSON.stringify({ email: m.email, role }),
                                  });
                                  setMsg({
                                    text: `Updated ${m.full_name} to ${role}.`,
                                    type: 'success',
                                  });
                                  await fetchOrgData();
                                } catch (err) {
                                  setMsg({
                                    text:
                                      err instanceof Error
                                        ? err.message
                                        : 'Could not update member role.',
                                    type: 'error',
                                  });
                                } finally {
                                  setLoading(false);
                                }
                              }}
                            >
                              <option value="employee">Employee</option>
                              <option value="sales">Sales</option>
                              <option value="project_manager">Project manager</option>
                              <option value="finance">Finance</option>
                              <option value="approver">Approver</option>
                              <option value="owner">Owner</option>
                            </select>
                          </td>
                        )}
                        {user?.role === 'owner' && (
                          <td className="py-2.5">
                            {m.user_id !== user.id && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-semantic-danger hover:bg-semantic-danger-soft hover:text-semantic-danger"
                                onClick={() => void removeMember(m)}
                              >
                                Remove
                              </Button>
                            )}
                          </td>
                        )}
                        <td className="py-2.5">
                          <Badge variant="muted">{m.role}</Badge>
                        </td>
                        <td className="py-2.5">
                          <span className="inline-flex items-center gap-1 text-[11px] text-semantic-success font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-semantic-success" />
                            Active
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {user?.role === 'owner' && (
                <form onSubmit={handleInvite} className="space-y-3 border-t border-semantic-border pt-4">
                  <div className="text-xs font-bold text-semantic-text mb-2">
                    Add / Invite Team Member
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                    <label className="text-xs font-semibold text-semantic-text">
                      Member email
                      <input
                        type="email"
                        required
                        placeholder="teammate@company.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className={fieldControlClass}
                      />
                    </label>
                    <label className="text-xs font-semibold text-semantic-text">
                      Workspace role
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value as RoleType)}
                        className={fieldControlClass}
                      >
                        <option value="employee">Employee</option>
                        <option value="sales">Sales</option>
                        <option value="project_manager">Project Manager</option>
                        <option value="finance">Finance</option>
                        <option value="approver">Approver</option>
                        <option value="owner">Owner</option>
                      </select>
                    </label>
                    <Button type="submit" loading={loading} className="self-end">
                      {loading ? 'Adding...' : 'Add Member'}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
