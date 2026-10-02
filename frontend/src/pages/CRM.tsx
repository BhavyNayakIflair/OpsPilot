import { useCallback, useEffect, useMemo, useState } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import { Alert } from '../components/ui/Alert';
import { EmptyState } from '../components/ui/EmptyState';
import { DataTable } from '../components/ui/DataTable';
import type { DataTableColumn, DataTableFilterDef } from '../components/ui/DataTable';
import { Card } from '../components/ui/Card';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const fieldControl = 'w-full rounded-ui-xl border border-semantic-border bg-semantic-surface px-3.5 py-2.5 text-sm text-semantic-text outline-none transition placeholder:text-semantic-text-muted hover:border-semantic-border/80 focus:border-semantic-accent focus:ring-4 focus:ring-semantic-accent/20';

type Company = {
  id: string;
  name: string;
  website?: string;
  industry?: string;
  notes?: string;
  created_at: string;
};
type Contact = {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  title?: string;
  company_id?: string;
  created_at: string;
};
type Stage = {
  id: string;
  name: string;
  position: number;
  probability: number;
  is_won: boolean;
  is_lost: boolean;
};
type Lead = {
  id: string;
  title: string;
  company_id?: string;
  contact_id?: string;
  stage_id?: string;
  status: string;
  value_cents: number;
  currency: string;
  source: string;
  notes?: string;
  created_at: string;
};
type Activity = {
  id: string;
  lead_id: string;
  kind: string;
  subject: string;
  body?: string;
  user_id?: string;
  created_at: string;
};
type Tab = 'Pipeline' | 'Leads' | 'Companies' | 'Contacts' | 'Activities';

export function CRM() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('Pipeline');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [companyIndustry, setCompanyIndustry] = useState('');
  const [companyNotes, setCompanyNotes] = useState('');
  const [contactFirst, setContactFirst] = useState('');
  const [contactLast, setContactLast] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactTitle, setContactTitle] = useState('');
  const [contactCompany, setContactCompany] = useState('');
  const [leadTitle, setLeadTitle] = useState('');
  const [leadCompany, setLeadCompany] = useState('');
  const [leadValue, setLeadValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [activityLead, setActivityLead] = useState('');
  const [activityKind, setActivityKind] = useState('note');
  const [activitySubject, setActivitySubject] = useState('');
  const [activityBody, setActivityBody] = useState('');
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [leadSearch, setLeadSearch] = useState('');
  const [leadFilters, setLeadFilters] = useState<Record<string, string>>({});
  const [leadSortKey, setLeadSortKey] = useState<string>('created_at');
  const [leadSortDir, setLeadSortDir] = useState<'asc' | 'desc'>('desc');
  const [companySearch, setCompanySearch] = useState('');
  const [companySortKey, setCompanySortKey] = useState<string>('created_at');
  const [companySortDir, setCompanySortDir] = useState<'asc' | 'desc'>('desc');
  const [contactSearch, setContactSearch] = useState('');
  const [contactSortKey, setContactSortKey] = useState<string>('last_name');
  const [contactSortDir, setContactSortDir] = useState<'asc' | 'desc'>('asc');
  const [activityKindFilter, setActivityKindFilter] = useState('');
  const [activityLeadFilter, setActivityLeadFilter] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [co, ct, st, ld, ac] = await Promise.all([
        apiRequest<Company[]>('/crm/companies'),
        apiRequest<Contact[]>('/crm/contacts'),
        apiRequest<Stage[]>('/crm/stages'),
        apiRequest<Lead[]>('/crm/leads'),
        apiRequest<Activity[]>('/crm/activities'),
      ]);
      setCompanies(co);
      setContacts(ct);
      setStages(st);
      setLeads(ld);
      setActivities(ac);
      if (!activityLead && ld[0]) setActivityLead(ld[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load CRM data');
    } finally {
      setLoading(false);
    }
  }, [activityLead]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const companyNameById = useMemo(
    () => new Map(companies.map((c) => [c.id, c.name])),
    [companies]
  );
  const contactById = useMemo(
    () => new Map(contacts.map((c) => [c.id, c])),
    [contacts]
  );
  const stageById = useMemo(
    () => new Map(stages.map((s) => [s.id, s])),
    [stages]
  );
  const leadById = useMemo(
    () => new Map(leads.map((l) => [l.id, l])),
    [leads]
  );
  const stageLeads = (stage: Stage) =>
    leads.filter((lead) => lead.stage_id === stage.id);

  const moveLead = async (leadId: string, stageId: string) => {
    const before = leads;
    setLeads((rows) =>
      rows.map((l) => (l.id === leadId ? { ...l, stage_id: stageId } : l))
    );
    try {
      await apiRequest(`/crm/leads/${leadId}`, {
        method: 'PATCH',
        body: JSON.stringify({ stage_id: stageId }),
      });
    } catch (e) {
      setLeads(before);
      setError(e instanceof Error ? e.message : 'Could not move lead');
    }
  };

  const removeRecord = async (path: string, label: string) => {
    if (!window.confirm(`Delete this ${label}? This cannot be undone.`)) return;
    try {
      await apiRequest(path, { method: 'DELETE' });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not delete ${label}`);
    }
  };

  const saveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const payload = {
      title: leadTitle,
      company_id: leadCompany || null,
      value_cents: Math.round(Number(leadValue || 0) * 100),
    };
    try {
      await apiRequest(
        editingLead ? `/crm/leads/${editingLead.id}` : '/crm/leads',
        {
          method: editingLead ? 'PATCH' : 'POST',
          body: JSON.stringify(
            editingLead
              ? payload
              : {
                  ...payload,
                  stage_id: stages[0]?.id || null,
                  currency: 'USD',
                }
          ),
        }
      );
      setEditingLead(null);
      setLeadTitle('');
      setLeadCompany('');
      setLeadValue('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save lead');
    } finally {
      setSaving(false);
    }
  };

  const saveActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiRequest(
        editingActivity ? `/crm/activities/${editingActivity.id}` : '/crm/activities',
        {
          method: editingActivity ? 'PATCH' : 'POST',
          body: JSON.stringify({
            lead_id: activityLead,
            kind: activityKind,
            subject: activitySubject,
            body: activityBody || null,
          }),
        }
      );
      setEditingActivity(null);
      setActivitySubject('');
      setActivityBody('');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save activity');
    } finally {
      setSaving(false);
    }
  };

  const saveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiRequest(
        editingCompany ? `/crm/companies/${editingCompany.id}` : '/crm/companies',
        {
          method: editingCompany ? 'PATCH' : 'POST',
          body: JSON.stringify({
            name: companyName,
            website: companyWebsite || null,
            industry: companyIndustry || null,
            notes: companyNotes || null,
          }),
        }
      );
      setCompanyName('');
      setCompanyWebsite('');
      setCompanyIndustry('');
      setCompanyNotes('');
      setEditingCompany(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save company');
    } finally {
      setSaving(false);
    }
  };

  const saveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiRequest(
        editingContact ? `/crm/contacts/${editingContact.id}` : '/crm/contacts',
        {
          method: editingContact ? 'PATCH' : 'POST',
          body: JSON.stringify({
            first_name: contactFirst,
            last_name: contactLast,
            email: contactEmail || null,
            phone: contactPhone || null,
            title: contactTitle || null,
            company_id: contactCompany || null,
          }),
        }
      );
      setContactFirst('');
      setContactLast('');
      setContactEmail('');
      setContactPhone('');
      setContactTitle('');
      setContactCompany('');
      setEditingContact(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save contact');
    } finally {
      setSaving(false);
    }
  };

  const filteredLeads = useMemo(() => {
    let rows = [...leads];
    if (leadSearch.trim()) {
      const q = leadSearch.toLowerCase();
      rows = rows.filter((l) => {
        const companyName = companyNameById.get(l.company_id || '') || '';
        return (
          l.title.toLowerCase().includes(q) ||
          companyName.toLowerCase().includes(q) ||
          (l.source || '').toLowerCase().includes(q)
        );
      });
    }
    if (leadFilters.stage_id) {
      rows = rows.filter((l) => l.stage_id === leadFilters.stage_id);
    }
    if (leadFilters.source) {
      rows = rows.filter((l) => l.source === leadFilters.source);
    }
    if (leadFilters.status) {
      const s = leadFilters.status;
      if (s === 'won') rows = rows.filter((l) => stageById.get(l.stage_id || '')?.is_won);
      else if (s === 'lost') rows = rows.filter((l) => stageById.get(l.stage_id || '')?.is_lost);
      else if (s === 'closed') rows = rows.filter((l) => stageById.get(l.stage_id || '')?.is_won || stageById.get(l.stage_id || '')?.is_lost);
      else rows = rows.filter((l) => !(stageById.get(l.stage_id || '')?.is_won || stageById.get(l.stage_id || '')?.is_lost));
    }
    rows.sort((a, b) => {
      let av: unknown = (a as Record<string, unknown>)[leadSortKey];
      let bv: unknown = (b as Record<string, unknown>)[leadSortKey];
      if (leadSortKey === 'created_at') {
        av = new Date(av as string).getTime();
        bv = new Date(bv as string).getTime();
      }
      if (leadSortKey === 'value_cents') {
        av = Number(av);
        bv = Number(bv);
      }
      if (typeof av === 'string' && typeof bv === 'string') {
        return leadSortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = Number(av);
      const bn = Number(bv);
      return leadSortDir === 'asc' ? an - bn : bn - an;
    });
    return rows;
  }, [leads, leadSearch, leadFilters, leadSortKey, leadSortDir, companyNameById, stageById]);

  const filteredCompanies = useMemo(() => {
    let rows = [...companies];
    if (companySearch.trim()) {
      const q = companySearch.toLowerCase();
      rows = rows.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.website || '').toLowerCase().includes(q)
      );
    }
    rows.sort((a, b) => {
      let av: unknown = (a as Record<string, unknown>)[companySortKey];
      let bv: unknown = (b as Record<string, unknown>)[companySortKey];
      if (companySortKey === 'created_at') {
        av = new Date(av as string).getTime();
        bv = new Date(bv as string).getTime();
      }
      if (typeof av === 'string' && typeof bv === 'string') {
        return companySortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = Number(av);
      const bn = Number(bv);
      return companySortDir === 'asc' ? an - bn : bn - an;
    });
    return rows;
  }, [companies, companySearch, companySortKey, companySortDir]);

  const filteredContacts = useMemo(() => {
    let rows = [...contacts];
    if (contactSearch.trim()) {
      const q = contactSearch.toLowerCase();
      rows = rows.filter(
        (c) =>
          (c.first_name + ' ' + c.last_name).toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q)
      );
    }
    rows.sort((a, b) => {
      let av: unknown = (a as Record<string, unknown>)[contactSortKey];
      let bv: unknown = (b as Record<string, unknown>)[contactSortKey];
      if (contactSortKey === 'created_at') {
        av = new Date(av as string).getTime();
        bv = new Date(bv as string).getTime();
      }
      if (typeof av === 'string' && typeof bv === 'string') {
        return contactSortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = Number(av);
      const bn = Number(bv);
      return contactSortDir === 'asc' ? an - bn : bn - an;
    });
    return rows;
  }, [contacts, contactSearch, contactSortKey, contactSortDir]);

  const filteredActivities = useMemo(() => {
    let rows = [...activities];
    if (activityKindFilter) {
      rows = rows.filter((a) => a.kind === activityKindFilter);
    }
    if (activityLeadFilter) {
      rows = rows.filter((a) => a.lead_id === activityLeadFilter);
    }
    rows.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return rows;
  }, [activities, activityKindFilter, activityLeadFilter]);

  const leadSourceOptions = useMemo(() => {
    const set = new Set(leads.map((l) => l.source));
    return Array.from(set).map((s) => ({ value: s, label: s }));
  }, [leads]);

  const handleLeadSort = (key: string) => {
    if (leadSortKey === key) {
      setLeadSortDir(leadSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setLeadSortKey(key);
      setLeadSortDir('desc');
    }
  };

  const handleCompanySort = (key: string) => {
    if (companySortKey === key) {
      setCompanySortDir(companySortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setCompanySortKey(key);
      setCompanySortDir('desc');
    }
  };

  const handleContactSort = (key: string) => {
    if (contactSortKey === key) {
      setContactSortDir(contactSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setContactSortKey(key);
      setContactSortDir('desc');
    }
  };

  const scrollToForm = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const tabs: Tab[] = ['Pipeline', 'Leads', 'Companies', 'Contacts', 'Activities'];

  const leadColumns: DataTableColumn<Lead>[] = [
    {
      key: 'title',
      header: 'Opportunity',
      sortable: true,
      render: (l) => (
        <div>
          <div className="font-bold text-semantic-text">{l.title}</div>
          <div className="mt-0.5 text-xs text-semantic-text-muted">{l.source}</div>
        </div>
      ),
    },
    {
      key: 'company_id',
      header: 'Company',
      sortable: true,
      render: (l) => (
        <span className="text-semantic-text">
          {companyNameById.get(l.company_id || '') || '\u2014'}
        </span>
      ),
    },
    {
      key: 'stage_id',
      header: 'Stage',
      sortable: true,
      render: (l) => (
        <select
          aria-label={`Stage for ${l.title}`}
          className="rounded-ui-lg border border-semantic-border bg-semantic-surface text-semantic-text text-sm px-2 py-1.5 min-w-[130px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-border"
          value={l.stage_id || ''}
          onChange={(e) => void moveLead(l.id, e.target.value)}
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: 'contact_id',
      header: 'Contact',
      sortable: true,
      render: (l) => {
        const c = contactById.get(l.contact_id || '');
        return (
          <span className="text-semantic-text">
            {c ? `${c.first_name} ${c.last_name}` : '\u2014'}
          </span>
        );
      },
    },
    {
      key: 'value_cents',
      header: 'Value',
      sortable: true,
      align: 'right',
      render: (l) => (
        <span className="font-semibold text-semantic-text">
          {l.currency}{' '}
          {(l.value_cents / 100).toLocaleString(undefined, {
            minimumFractionDigits: 2,
          })}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      sortable: true,
      render: (l) => (
        <span className="text-semantic-text-muted text-xs">
          {new Date(l.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (l) => (
        <div className="flex gap-2 justify-end whitespace-nowrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditingLead(l);
              setLeadTitle(l.title);
              setLeadCompany(l.company_id || '');
              setLeadValue((l.value_cents / 100).toFixed(2));
            }}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void removeRecord(`/crm/leads/${l.id}`, 'lead')}
            className="text-semantic-danger hover:text-semantic-danger"
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  const companyColumns: DataTableColumn<Company>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (c) => (
        <div>
          <div className="font-bold text-semantic-text">{c.name}</div>
          {c.website ? (
            <a
              href={c.website.startsWith('http') ? c.website : `https://${c.website}`}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 text-xs text-semantic-accent hover:underline"
            >
              {c.website}
            </a>
          ) : (
            <div className="mt-0.5 text-xs text-semantic-text-muted">\u2014</div>
          )}
        </div>
      ),
    },
    {
      key: 'industry',
      header: 'Industry',
      sortable: true,
      render: (c) => (
        <span className="text-semantic-text">{c.industry || '\u2014'}</span>
      ),
    },
    {
      key: 'activities',
      header: 'Leads',
      align: 'center',
      render: (c) => {
        const count = leads.filter((l) => l.company_id === c.id).length;
        return <Badge variant="count">{count}</Badge>;
      },
    },
    {
      key: 'created_at',
      header: 'Created',
      sortable: true,
      render: (c) => (
        <span className="text-semantic-text-muted text-xs">
          {new Date(c.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (c) => (
        <div className="flex gap-2 justify-end whitespace-nowrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditingCompany(c);
              setCompanyName(c.name);
              setCompanyWebsite(c.website || '');
              setCompanyIndustry(c.industry || '');
              setCompanyNotes(c.notes || '');
            }}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void removeRecord(`/crm/companies/${c.id}`, 'company')}
            className="text-semantic-danger hover:text-semantic-danger"
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  const contactColumns: DataTableColumn<Contact>[] = [
    {
      key: 'last_name',
      header: 'Name',
      sortable: true,
      render: (c) => (
        <div>
          <div className="font-bold text-semantic-text">
            {c.first_name} {c.last_name}
          </div>
          {c.title && (
            <div className="mt-0.5 text-xs text-semantic-text-muted">{c.title}</div>
          )}
        </div>
      ),
    },
    {
      key: 'company_id',
      header: 'Company',
      sortable: true,
      render: (c) => (
        <span className="text-semantic-text">
          {companyNameById.get(c.company_id || '') || '\u2014'}
        </span>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      sortable: true,
      render: (c) =>
        c.email ? (
          <a
            href={`mailto:${c.email}`}
            className="text-semantic-accent hover:underline"
          >
            {c.email}
          </a>
        ) : (
          <span className="text-semantic-text-muted">\u2014</span>
        ),
    },
    {
      key: 'phone',
      header: 'Phone',
      sortable: true,
      render: (c) => (
        <span className="text-semantic-text">{c.phone || '\u2014'}</span>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      sortable: true,
      render: (c) => (
        <span className="text-semantic-text-muted text-xs">
          {new Date(c.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (c) => (
        <div className="flex gap-2 justify-end whitespace-nowrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditingContact(c);
              setContactFirst(c.first_name);
              setContactLast(c.last_name);
              setContactEmail(c.email || '');
              setContactPhone(c.phone || '');
              setContactTitle(c.title || '');
              setContactCompany(c.company_id || '');
            }}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void removeRecord(`/crm/contacts/${c.id}`, 'contact')}
            className="text-semantic-danger hover:text-semantic-danger"
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  const leadFiltersDef: DataTableFilterDef[] = [
    {
      key: 'stage_id',
      label: 'Stage',
      type: 'dropdown',
      options: stages.map((s) => ({ value: s.id, label: s.name })),
    },
    {
      key: 'source',
      label: 'Source',
      type: 'dropdown',
      options: leadSourceOptions,
    },
    {
      key: 'status',
      label: 'Status',
      type: 'dropdown',
      options: [
        { value: 'open', label: 'Open' },
        { value: 'closed', label: 'Closed' },
        { value: 'won', label: 'Won' },
        { value: 'lost', label: 'Lost' },
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="CRM"
        title="CRM & Leads"
        description="Manage prospects, contacts, companies, and your sales pipeline."
        statChips={[
          { label: 'Leads', value: leads.length, tone: 'accent' },
          { label: 'Companies', value: companies.length, tone: 'default' },
          { label: 'Contacts', value: contacts.length, tone: 'success' },
        ]}
      />

      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton variant="stat-tile" />
            <Skeleton variant="stat-tile" />
            <Skeleton variant="stat-tile" />
          </div>
          <Skeleton variant="card" className="h-96" />
        </div>
      ) : (
        <>
          <div className="flex gap-1 border-b border-semantic-border">
            {tabs.map((name) => (
              <button
                key={name}
                onClick={() => setTab(name)}
                className={cn(
                  'px-4 py-2.5 text-sm font-semibold transition-colors',
                  tab === name
                    ? 'border-b-2 border-semantic-accent text-semantic-accent font-bold'
                    : 'text-semantic-text-muted hover:text-semantic-text'
                )}
              >
                {name}
              </button>
            ))}
          </div>

          {tab === 'Pipeline' && (
            <div className="flex min-h-80 gap-4 overflow-x-auto pb-3">
              {stages.map((stage) => {
                const stageLeadsList = stageLeads(stage);
                return (
                  <section
                    key={stage.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData('text/plain');
                      if (id) void moveLead(id, stage.id);
                    }}
                    className={cn(
                      'min-w-64 flex-1 rounded-ui-2xl border p-3 flex flex-col',
                      stage.is_won
                        ? 'bg-semantic-success-soft/30 border-semantic-success/30'
                        : stage.is_lost
                        ? 'bg-semantic-danger-soft/30 border-semantic-danger/30'
                        : 'bg-semantic-surface-muted/70 border-semantic-border'
                    )}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-sm font-bold text-semantic-text">
                        {stage.name}
                        {stage.is_won && (
                          <Badge variant="success" className="ml-2">
                            Won
                          </Badge>
                        )}
                        {stage.is_lost && (
                          <Badge variant="danger" className="ml-2">
                            Lost
                          </Badge>
                        )}
                      </h2>
                      <span className="rounded-full bg-semantic-surface px-2 py-0.5 text-xs text-semantic-text-muted">
                        {stageLeadsList.length}
                      </span>
                    </div>
                    <div className="space-y-2 flex-1">
                      {stageLeadsList.map((lead) => {
                        const contact = contactById.get(lead.contact_id || '');
                        const contactName = contact
                          ? `${contact.first_name} ${contact.last_name}`
                          : 'No contact';
                        return (
                          <article
                            key={lead.id}
                            draggable
                            onDragStart={(e) =>
                              e.dataTransfer.setData('text/plain', lead.id)
                            }
                            className={cn(
                              'cursor-grab rounded-ui-xl border bg-semantic-surface p-3 shadow-sm active:cursor-grabbing overflow-hidden',
                              stage.is_won
                                ? 'border-t-2 border-t-semantic-success border-semantic-success/30'
                                : stage.is_lost
                                ? 'border-t-2 border-t-semantic-danger border-semantic-danger/30'
                                : 'border-semantic-border border-t-2 border-t-transparent'
                            )}
                          >
                            <div className="font-semibold text-semantic-text">
                              {lead.title}
                            </div>
                            <div className="mt-1 text-xs text-semantic-text-muted">
                              {companyNameById.get(lead.company_id || '') ||
                                'No company'}
                            </div>
                            <div className="mt-1 text-xs text-semantic-text-muted">
                              {contactName}
                            </div>
                            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-semantic-text-subtle">
                              via {lead.source}
                            </div>
                            <div className="mt-2 flex items-center justify-between">
                              <div className="text-xs font-medium text-semantic-accent">
                                {lead.currency}{' '}
                                {(lead.value_cents / 100).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                })}
                              </div>
                              <div className="text-[10px] text-semantic-text-muted">
                                {new Date(lead.created_at).toLocaleDateString()}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                      {!stageLeadsList.length && (
                        <div className="py-6 text-center text-xs text-semantic-text-muted">
                          No leads here
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
              {!stages.length && (
                <EmptyState
                  title="No pipeline stages"
                  description="Define sales stages to start building your pipeline."
                />
              )}
            </div>
          )}

          {tab === 'Leads' && (
            <div className="space-y-4">
              <Card>
                <div className="p-5">
                  <form
                    onSubmit={(e) => void saveLead(e)}
                    className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] items-end"
                  >
                    <label className="text-xs font-semibold text-semantic-text-muted">
                      Opportunity name
                      <input
                        className={cn(fieldControl, 'mt-1.5')}
                        required
                        placeholder="e.g. Customer portal redesign"
                        value={leadTitle}
                        onChange={(e) => setLeadTitle(e.target.value)}
                      />
                    </label>
                    <label className="text-xs font-semibold text-semantic-text-muted">
                      Company
                      <select
                        className={cn(fieldControl, 'mt-1.5')}
                        value={leadCompany}
                        onChange={(e) => setLeadCompany(e.target.value)}
                      >
                        <option value="">No company</option>
                        {companies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-semantic-text-muted">
                      Estimated value (USD)
                      <input
                        className={cn(fieldControl, 'mt-1.5')}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={leadValue}
                        onChange={(e) => setLeadValue(e.target.value)}
                      />
                    </label>
                    <div className="flex items-end gap-2">
                      <Button
                        type="submit"
                        variant="primary"
                        loading={saving}
                      >
                        {saving
                          ? 'Saving\u2026'
                          : editingLead
                          ? 'Save changes'
                          : 'Add lead'}
                      </Button>
                      {editingLead && (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setEditingLead(null);
                            setLeadTitle('');
                            setLeadCompany('');
                            setLeadValue('');
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </form>
                </div>
              </Card>

              <DataTable<Lead>
                columns={leadColumns}
                rows={filteredLeads}
                rowKey={(l) => l.id}
                searchable
                searchPlaceholder="Search leads by title/company/source\u2026"
                searchValue={leadSearch}
                onSearchChange={setLeadSearch}
                filters={leadFiltersDef}
                filterValues={leadFilters}
                onFilterChange={(key, value) =>
                  setLeadFilters((prev) => ({ ...prev, [key]: value as string }))
                }
                sortable
                sortKey={leadSortKey}
                sortDir={leadSortDir}
                onSortChange={handleLeadSort}
                emptyState={
                  <EmptyState
                    title="No leads match your filters"
                    description="Try adjusting your search or filters, or add a new lead above."
                    action={
                      <Button variant="primary" size="sm" onClick={scrollToForm}>
                        Add lead
                      </Button>
                    }
                  />
                }
              />
            </div>
          )}

          {tab === 'Companies' && (
            <div className="space-y-4">
              <Card>
                <div className="p-5">
                  <form
                    onSubmit={(e) => void saveCompany(e)}
                    className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end"
                  >
                    <label className="text-xs font-semibold text-semantic-text-muted">
                      Company name
                      <input
                        className={cn(fieldControl, 'mt-1.5')}
                        required
                        placeholder="e.g. Acme Studio"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                      />
                    </label>
                    <label className="text-xs font-semibold text-semantic-text-muted">
                      Website
                      <input
                        className={cn(fieldControl, 'mt-1.5')}
                        placeholder="acme.com"
                        value={companyWebsite}
                        onChange={(e) => setCompanyWebsite(e.target.value)}
                      />
                    </label>
                    <label className="text-xs font-semibold text-semantic-text-muted">
                      Industry
                      <input
                        className={cn(fieldControl, 'mt-1.5')}
                        placeholder="SaaS, Finance, etc."
                        value={companyIndustry}
                        onChange={(e) => setCompanyIndustry(e.target.value)}
                      />
                    </label>
                    <label className="text-xs font-semibold text-semantic-text-muted sm:col-span-2 lg:col-span-4">
                      Notes
                      <textarea
                        className={cn(fieldControl, 'mt-1.5')}
                        rows={2}
                        placeholder="Additional notes about this company"
                        value={companyNotes}
                        onChange={(e) => setCompanyNotes(e.target.value)}
                      />
                    </label>
                    <div className="sm:col-span-2 lg:col-span-4 flex items-end gap-2">
                      <Button
                        type="submit"
                        variant="primary"
                        loading={saving}
                      >
                        {editingCompany ? 'Save changes' : 'Add company'}
                      </Button>
                      {editingCompany && (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setEditingCompany(null);
                            setCompanyName('');
                            setCompanyWebsite('');
                            setCompanyIndustry('');
                            setCompanyNotes('');
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </form>
                </div>
              </Card>

              <DataTable<Company>
                columns={companyColumns}
                rows={filteredCompanies}
                rowKey={(c) => c.id}
                searchable
                searchPlaceholder="Search companies by name/website\u2026"
                searchValue={companySearch}
                onSearchChange={setCompanySearch}
                sortable
                sortKey={companySortKey}
                sortDir={companySortDir}
                onSortChange={handleCompanySort}
                emptyState={
                  <EmptyState
                    title="No companies yet"
                    description="Add the first company to start tracking prospects."
                    action={
                      <Button variant="primary" size="sm" onClick={scrollToForm}>
                        Add company
                      </Button>
                    }
                  />
                }
              />
            </div>
          )}

          {tab === 'Contacts' && (
            <div className="space-y-4">
              <Card>
                <div className="p-5">
                  <form
                    onSubmit={(e) => void saveContact(e)}
                    className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 items-end"
                  >
                    <label className="text-xs font-semibold text-semantic-text-muted">
                      First name
                      <input
                        className={cn(fieldControl, 'mt-1.5')}
                        required
                        placeholder="First name"
                        value={contactFirst}
                        onChange={(e) => setContactFirst(e.target.value)}
                      />
                    </label>
                    <label className="text-xs font-semibold text-semantic-text-muted">
                      Last name
                      <input
                        className={cn(fieldControl, 'mt-1.5')}
                        required
                        placeholder="Last name"
                        value={contactLast}
                        onChange={(e) => setContactLast(e.target.value)}
                      />
                    </label>
                    <label className="text-xs font-semibold text-semantic-text-muted">
                      Email
                      <input
                        className={cn(fieldControl, 'mt-1.5')}
                        type="email"
                        placeholder="name@company.com"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                      />
                    </label>
                    <label className="text-xs font-semibold text-semantic-text-muted">
                      Phone
                      <input
                        className={cn(fieldControl, 'mt-1.5')}
                        type="tel"
                        placeholder="+1 555 000 0000"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                      />
                    </label>
                    <label className="text-xs font-semibold text-semantic-text-muted">
                      Title
                      <input
                        className={cn(fieldControl, 'mt-1.5')}
                        placeholder="Job role, e.g. VP of Sales"
                        value={contactTitle}
                        onChange={(e) => setContactTitle(e.target.value)}
                      />
                    </label>
                    <label className="text-xs font-semibold text-semantic-text-muted">
                      Company
                      <select
                        className={cn(fieldControl, 'mt-1.5')}
                        value={contactCompany}
                        onChange={(e) => setContactCompany(e.target.value)}
                      >
                        <option value="">No company</option>
                        {companies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="sm:col-span-2 lg:col-span-6 flex items-end gap-2">
                      <Button
                        type="submit"
                        variant="primary"
                        loading={saving}
                      >
                        {editingContact ? 'Save contact' : 'Add contact'}
                      </Button>
                      {editingContact && (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setEditingContact(null);
                            setContactFirst('');
                            setContactLast('');
                            setContactEmail('');
                            setContactPhone('');
                            setContactTitle('');
                            setContactCompany('');
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </form>
                </div>
              </Card>

              <DataTable<Contact>
                columns={contactColumns}
                rows={filteredContacts}
                rowKey={(c) => c.id}
                searchable
                searchPlaceholder="Search contacts by name/email\u2026"
                searchValue={contactSearch}
                onSearchChange={setContactSearch}
                sortable
                sortKey={contactSortKey}
                sortDir={contactSortDir}
                onSortChange={handleContactSort}
                emptyState={
                  <EmptyState
                    title="No contacts yet"
                    description="Add contacts to link them to companies and leads."
                    action={
                      <Button variant="primary" size="sm" onClick={scrollToForm}>
                        Add contact
                      </Button>
                    }
                  />
                }
              />
            </div>
          )}

          {tab === 'Activities' && (
            <div className="space-y-4">
              <Card>
                <div className="p-5">
                  <form
                    onSubmit={(e) => void saveActivity(e)}
                    className="grid gap-3 sm:grid-cols-2"
                  >
                    <label className="text-xs font-semibold text-semantic-text-muted">
                      Related lead
                      <select
                        className={cn(fieldControl, 'mt-1.5')}
                        required
                        value={activityLead}
                        onChange={(e) => setActivityLead(e.target.value)}
                      >
                        {leads.map((lead) => (
                          <option key={lead.id} value={lead.id}>
                            {lead.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-semantic-text-muted">
                      Activity type
                      <select
                        className={cn(fieldControl, 'mt-1.5')}
                        value={activityKind}
                        onChange={(e) => setActivityKind(e.target.value)}
                      >
                        <option value="note">Note</option>
                        <option value="call">Call</option>
                        <option value="email">Email</option>
                        <option value="meeting">Meeting</option>
                        <option value="task">Task</option>
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-semantic-text-muted sm:col-span-2">
                      Subject
                      <input
                        className={cn(fieldControl, 'mt-1.5')}
                        required
                        placeholder="e.g. Follow up on proposal"
                        value={activitySubject}
                        onChange={(e) => setActivitySubject(e.target.value)}
                      />
                    </label>
                    <label className="text-xs font-semibold text-semantic-text-muted sm:col-span-2">
                      Details
                      <textarea
                        className={cn(fieldControl, 'mt-1.5')}
                        rows={3}
                        placeholder="Add notes from this interaction"
                        value={activityBody}
                        onChange={(e) => setActivityBody(e.target.value)}
                      />
                    </label>
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <Button
                        type="submit"
                        variant="primary"
                        loading={saving}
                        disabled={!leads.length}
                      >
                        {editingActivity ? 'Save changes' : 'Add activity'}
                      </Button>
                      {editingActivity && (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setEditingActivity(null);
                            setActivitySubject('');
                            setActivityBody('');
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </form>
                </div>
              </Card>

              <Card>
                <div className="p-5">
                  <div className="flex flex-wrap items-end gap-3 mb-4 pb-4 border-b border-semantic-border/60">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] uppercase tracking-wider text-semantic-text-muted font-medium">
                        Kind
                      </label>
                      <select
                        value={activityKindFilter}
                        onChange={(e) => setActivityKindFilter(e.target.value)}
                        className="appearance-none rounded-ui-lg border border-semantic-border bg-semantic-surface text-semantic-text text-sm px-3 py-1.5 pr-8 min-w-[140px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-border"
                      >
                        <option value="">All</option>
                        <option value="note">Note</option>
                        <option value="call">Call</option>
                        <option value="email">Email</option>
                        <option value="meeting">Meeting</option>
                        <option value="task">Task</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] uppercase tracking-wider text-semantic-text-muted font-medium">
                        Lead
                      </label>
                      <select
                        value={activityLeadFilter}
                        onChange={(e) => setActivityLeadFilter(e.target.value)}
                        className="appearance-none rounded-ui-lg border border-semantic-border bg-semantic-surface text-semantic-text text-sm px-3 py-1.5 pr-8 min-w-[180px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-border"
                      >
                        <option value="">All leads</option>
                        {leads.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {filteredActivities.length === 0 ? (
                    <EmptyState
                      title="No activities recorded yet."
                      description="Log calls, meetings, emails, and notes to track interactions."
                    />
                  ) : (
                    <div className="space-y-3">
                      {filteredActivities.map((activity) => {
                        const lead = leadById.get(activity.lead_id);
                        const isCurrentUser = user && activity.user_id === user.id;
                        return (
                          <Card
                            key={activity.id}
                            className="shadow-ui-sm"
                          >
                            <div className="p-5">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="default" className="uppercase tracking-wider">
                                      {activity.kind}
                                    </Badge>
                                    {activity.user_id &&
                                      (isCurrentUser ? (
                                        <Badge variant="ai">You</Badge>
                                      ) : (
                                        <Badge variant="muted">
                                          User {activity.user_id.slice(0, 6)}
                                          {'\u2026'}
                                        </Badge>
                                      ))}
                                  </div>
                                  <h3 className="mt-2 font-semibold text-semantic-text">
                                    {activity.subject}
                                  </h3>
                                </div>
                                <div className="flex shrink-0 items-center gap-3 text-right">
                                  <div>
                                    <div className="text-xs font-semibold text-semantic-text">
                                      {lead?.title || 'Lead'}
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-semantic-text-muted">
                                      {new Date(
                                        activity.created_at
                                      ).toLocaleString()}
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setEditingActivity(activity);
                                        setActivityLead(activity.lead_id);
                                        setActivityKind(activity.kind);
                                        setActivitySubject(activity.subject);
                                        setActivityBody(activity.body || '');
                                      }}
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        void removeRecord(
                                          `/crm/activities/${activity.id}`,
                                          'activity'
                                        )
                                      }
                                      className="text-semantic-danger hover:text-semantic-danger"
                                    >
                                      Delete
                                    </Button>
                                  </div>
                                </div>
                              </div>
                              {activity.body && (
                                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-semantic-text-muted">
                                  {activity.body}
                                </p>
                              )}
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
