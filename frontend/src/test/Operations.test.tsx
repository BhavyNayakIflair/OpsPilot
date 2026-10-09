import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import { ApprovalsPage, ProjectsPage, TimesheetsPage, PeoplePage } from '../pages/Operations';

vi.mock('../lib/api', () => ({ apiRequest: vi.fn() }));

const mockUser = {
  id: 'user-1',
  email: 'owner@test.com',
  full_name: 'Test Owner',
  role: 'owner',
  org_id: 'org-1',
  locale: 'en' as const,
  is_active: true,
};

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, refreshUser: vi.fn() }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const approvals = [
  { id: 't1', entity_type: 'timesheet', label: 'Homepage design work', created_at: '2026-01-01T10:00:00Z' },
  { id: 'e1', entity_type: 'expense', label: 'AWS: monthly hosting', amount_cents: 4200, currency: 'USD', created_at: '2026-01-02T10:00:00Z' },
  {
    id: 'q1',
    entity_type: 'quote_agent',
    label: 'Quote draft review · Portal rebuild',
    reason: 'Discount above threshold',
    created_at: '2026-01-03T10:00:00Z',
    quote_preview: { title: 'Portal rebuild', currency: 'USD', total_cents: 100000, line_items: [{ description: 'Build', quantity: 1, unit_price_cents: 100000 }] },
  },
];

const renderWithRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('ApprovalsPage', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    vi.mocked(apiRequest).mockImplementation(async (endpoint: string) => {
      if (endpoint === '/workflows/approvals') return approvals as never;
      return [] as never;
    });
  });

  it('lists every approval type returned by the API', async () => {
    renderWithRouter(<ApprovalsPage />);
    expect(await screen.findByText('Homepage design work')).toBeInTheDocument();
    expect(screen.getByText('AWS: monthly hosting')).toBeInTheDocument();
    expect(screen.getByText('Quote draft review · Portal rebuild')).toBeInTheDocument();
  });

  it('filters the queue by entity type using the API entity_type values', async () => {
    renderWithRouter(<ApprovalsPage />);
    await screen.findByText('Homepage design work');
    fireEvent.click(screen.getByRole('button', { name: 'Quote drafts' }));
    expect(screen.queryByText('Homepage design work')).not.toBeInTheDocument();
    expect(screen.queryByText('AWS: monthly hosting')).not.toBeInTheDocument();
    expect(screen.getByText('Quote draft review · Portal rebuild')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Time entries' }));
    expect(screen.getByText('Homepage design work')).toBeInTheDocument();
    expect(screen.queryByText('Quote draft review · Portal rebuild')).not.toBeInTheDocument();
  });

  it('posts the decision to the matching entity endpoint', async () => {
    renderWithRouter(<ApprovalsPage />);
    await screen.findByText('AWS: monthly hosting');
    const approveButtons = screen.getAllByRole('button', { name: 'Approve' });
    expect(approveButtons).toHaveLength(3);
    fireEvent.click(approveButtons[1]);
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        '/workflows/approvals/expense/e1',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ decision: 'approved' }) })
      )
    );
  });
});

describe('ProjectsPage (Characterization)', () => {
  const mockProjects = [
    {
      id: 'proj-1',
      org_id: 'org-1',
      name: 'Client Portal',
      description: 'Customer facing dashboard',
      status: 'active',
      budget_minutes: 6000,
      budget_amount_cents: 500000,
      currency: 'USD',
      created_at: '2026-01-01T10:00:00Z',
      updated_at: '2026-01-01T10:00:00Z',
    },
  ];

  const mockTasks = [
    {
      id: 'task-1',
      org_id: 'org-1',
      project_id: 'proj-1',
      title: 'Auth Setup',
      status: 'todo',
      estimate_minutes: 300,
      created_at: '2026-01-01T11:00:00Z',
      updated_at: '2026-01-01T11:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    window.confirm = vi.fn(() => true);
    window.prompt = vi.fn(() => 'Renamed Task');
  });

  it('renders projects and calculates budget burn', async () => {
    vi.mocked(apiRequest).mockImplementation(async (endpoint: string) => {
      if (endpoint === '/operations/projects') return mockProjects as never;
      if (endpoint === '/operations/timesheets') return [{ id: 'te-1', project_id: 'proj-1', minutes: 120 }] as never;
      return [] as never;
    });

    renderWithRouter(<ProjectsPage />);
    expect(await screen.findByText('Client Portal')).toBeInTheDocument();
    expect(screen.getByText(/100\.0h · \$5,000(\.00)? budget/i)).toBeInTheDocument();
  });

  it('creates a project when form submitted', async () => {
    vi.mocked(apiRequest).mockImplementation(async (endpoint: string, options?: RequestInit) => {
      if (endpoint === '/operations/projects' && options?.method === 'POST') {
        return { id: 'proj-2', name: 'Mobile App', budget_minutes: 3000, budget_amount_cents: 200000, status: 'active' } as never;
      }
      if (endpoint === '/operations/projects') return mockProjects as never;
      if (endpoint === '/operations/timesheets') return [] as never;
      return [] as never;
    });

    renderWithRouter(<ProjectsPage />);
    await screen.findByText('Client Portal');

    fireEvent.change(screen.getByPlaceholderText('e.g. Client portal rollout'), { target: { value: 'Mobile App' } });
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        '/operations/projects',
        expect.objectContaining({ method: 'POST' })
      )
    );
  });

  it('shows error state when project loading fails', async () => {
    vi.mocked(apiRequest).mockImplementation(async (endpoint: string) => {
      if (endpoint === '/operations/projects') throw new Error('Network error loading projects');
      return [] as never;
    });
    renderWithRouter(<ProjectsPage />);
    expect(await screen.findByText('Network error loading projects')).toBeInTheDocument();
  });

  it('expands project and displays tasks', async () => {
    vi.mocked(apiRequest).mockImplementation(async (endpoint: string) => {
      if (endpoint === '/operations/projects') return mockProjects as never;
      if (endpoint === '/operations/timesheets') return [] as never;
      if (endpoint === '/operations/projects/proj-1/tasks') return mockTasks as never;
      return [] as never;
    });

    renderWithRouter(<ProjectsPage />);
    const projTitle = await screen.findByText('Client Portal');
    fireEvent.click(projTitle);

    expect(await screen.findByText('Auth Setup')).toBeInTheDocument();
  });
});

describe('TimesheetsPage (Characterization)', () => {
  const mockTimesheets = [
    {
      id: 'entry-1',
      org_id: 'org-1',
      project_id: 'proj-1',
      user_id: 'user-1',
      entry_date: '2026-10-01',
      minutes: 180,
      description: 'Developed API auth endpoints',
      is_billable: true,
      approval_status: 'pending',
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-01T10:00:00Z',
    },
  ];

  const mockProjects = [
    { id: 'proj-1', name: 'Client Portal', status: 'active' },
  ];

  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    window.confirm = vi.fn(() => true);
  });

  it('renders timesheets list and handles entry creation', async () => {
    vi.mocked(apiRequest).mockImplementation(async (endpoint: string, options?: RequestInit) => {
      if (endpoint === '/operations/projects') return mockProjects as never;
      if (endpoint === '/operations/timesheets' && options?.method === 'POST') {
        return { id: 'entry-2', project_id: 'proj-1', minutes: 120, description: 'Added tests', is_billable: true, approval_status: 'pending' } as never;
      }
      if (endpoint === '/operations/timesheets') return mockTimesheets as never;
      return [] as never;
    });

    renderWithRouter(<TimesheetsPage />);
    expect(await screen.findByText('Developed API auth endpoints')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Project/i), { target: { value: 'proj-1' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 2.5'), { target: { value: '2' } });
    fireEvent.change(screen.getByPlaceholderText('What work did you complete?'), { target: { value: 'Added tests' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Log time' }).closest('form')!);

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        '/operations/timesheets',
        expect.objectContaining({ method: 'POST' })
      )
    );
  });

  it('allows owner to approve a pending entry', async () => {
    vi.mocked(apiRequest).mockImplementation(async (endpoint: string) => {
      if (endpoint === '/operations/projects') return mockProjects as never;
      if (endpoint === '/operations/timesheets') return mockTimesheets as never;
      return [] as never;
    });

    renderWithRouter(<TimesheetsPage />);
    await screen.findByText('Developed API auth endpoints');

    const approveBtn = screen.getByRole('button', { name: 'Approve' });
    fireEvent.click(approveBtn);

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        '/operations/timesheets/entry-1/approval',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'approved' }) })
      )
    );
  });

  it('shows error state when timesheets loading fails', async () => {
    vi.mocked(apiRequest).mockImplementation(async (endpoint: string) => {
      if (endpoint === '/operations/timesheets') throw new Error('Failed to load timesheet entries');
      return [] as never;
    });
    renderWithRouter(<TimesheetsPage />);
    expect(await screen.findByText('Failed to load timesheet entries')).toBeInTheDocument();
  });
});

describe('PeoplePage & LeaveWidget (Characterization)', () => {
  const mockEmployees = [
    {
      id: 'emp-1',
      org_id: 'org-1',
      full_name: 'John Doe',
      title: 'Staff Architect',
      email: 'john@example.com',
      billing_rate_cents: 15000,
      cost_rate_cents: 8000,
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];

  const mockLeaves = [
    {
      id: 'leave-1',
      org_id: 'org-1',
      employee_id: 'emp-1',
      start_date: '2026-10-15',
      end_date: '2026-10-18',
      reason: 'Personal travel',
      status: 'pending',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    window.confirm = vi.fn(() => true);
  });

  it('renders employees list and LeaveWidget', async () => {
    vi.mocked(apiRequest).mockImplementation(async (endpoint: string) => {
      if (endpoint === '/operations/people') return mockEmployees as never;
      if (endpoint === '/operations/leave-requests') return mockLeaves as never;
      return [] as never;
    });

    renderWithRouter(<PeoplePage />);
    const matches = await screen.findAllByText('John Doe');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Staff Architect')[0]).toBeInTheDocument();
    expect(await screen.findByText(/Personal travel/i)).toBeInTheDocument();
  });

  it('creates new employee on form submission', async () => {
    vi.mocked(apiRequest).mockImplementation(async (endpoint: string, options?: RequestInit) => {
      if (endpoint === '/operations/people' && options?.method === 'POST') {
        return { id: 'emp-2', full_name: 'Jane Smith', is_active: true } as never;
      }
      if (endpoint === '/operations/people') return mockEmployees as never;
      if (endpoint === '/operations/leave-requests') return [] as never;
      return [] as never;
    });

    renderWithRouter(<PeoplePage />);
    const matches = await screen.findAllByText('John Doe');
    expect(matches.length).toBeGreaterThanOrEqual(1);

    fireEvent.change(screen.getByPlaceholderText('Team member name'), { target: { value: 'Jane Smith' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Designer'), { target: { value: 'Frontend Dev' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add teammate' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        '/operations/people',
        expect.objectContaining({ method: 'POST' })
      )
    );
  });

  it('shows error when employee loading fails', async () => {
    vi.mocked(apiRequest).mockImplementation(async (endpoint: string) => {
      if (endpoint === '/operations/people') throw new Error('Permission denied on /people');
      return [] as never;
    });
    renderWithRouter(<PeoplePage />);
    expect(await screen.findByText('Permission denied on /people')).toBeInTheDocument();
  });
});
