import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, ApiError } from '../lib/api';
import { TasksPage, LeaveManagementPage } from '../pages/OperationsManagement';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockUser = {
  id: 'user-1',
  email: 'owner@example.com',
  full_name: 'Workspace Owner',
  role: 'owner',
  org_id: 'org-1',
  locale: 'en' as const,
  is_active: true,
};

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

const renderPage = (page: ReactElement) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{page}</MemoryRouter>
    </QueryClientProvider>
  );
};

const task = {
  id: 'task-1',
  project_id: 'project-1',
  title: 'Prepare release',
  status: 'todo',
  priority: 'high',
  estimate_minutes: 240,
  needs_reassignment: false,
  assignees: [],
};
const teammate = {
  id: 'person-1',
  user_id: 'user-2',
  full_name: 'Jane Doe',
  email: 'jane@example.com',
  is_active: true,
  weekly_capacity_hours: 40,
};
const project = { id: 'project-1', name: 'Launch project', status: 'active' };

describe('task assignment workflows', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    vi.mocked(apiRequest).mockImplementation(async (endpoint: string) => {
      if (endpoint === '/operations/tasks') return [task] as never;
      if (endpoint === '/operations/people/directory') return [teammate] as never;
      if (endpoint === '/operations/projects') return [project] as never;
      if (endpoint === '/operations/projects/project-1/members') return [{
        id: 'member-1',
        project_id: 'project-1',
        person_id: 'person-1',
        person_name: 'Jane Doe',
        role: 'contributor',
        allocation_percent: 100,
        hours_per_week: 40,
      }] as never;
      if (endpoint === '/assignments/tasks/task-1/suggestions') return [] as never;
      return undefined as never;
    });
  });

  it('supports assigning multiple project members with a role', async () => {
    renderPage(<TasksPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Manage assignees' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Assign Jane Doe' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Role for Jane Doe' }), { target: { value: 'owner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save assignments' }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      '/assignments/tasks/task-1/assignees',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ person_id: 'person-1', role: 'owner', override_leave_conflict: false }),
      })
    ));
  });

  it('requires an explicit override for leave conflict warnings', async () => {
    let firstAssignment = true;
    vi.mocked(apiRequest).mockImplementation(async (endpoint: string, options?: RequestInit) => {
      if (endpoint === '/operations/tasks') return [task] as never;
      if (endpoint === '/operations/people/directory') return [teammate] as never;
      if (endpoint === '/operations/projects') return [project] as never;
      if (endpoint === '/operations/projects/project-1/members') return [{
        id: 'member-1', project_id: 'project-1', person_id: 'person-1', person_name: 'Jane Doe',
        role: 'contributor', allocation_percent: 100, hours_per_week: 40,
      }] as never;
      if (endpoint === '/assignments/tasks/task-1/suggestions') return [] as never;
      if (endpoint === '/assignments/tasks/task-1/assignees' && options?.method === 'POST' && firstAssignment) {
        firstAssignment = false;
        throw new ApiError(409, 'Approved leave overlaps the task.', { detail: { code: 'LEAVE_CONFLICT', message: 'Approved leave overlaps the task.' } });
      }
      return undefined as never;
    });

    renderPage(<TasksPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Manage assignees' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Assign Jane Doe' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save assignments' }));
    expect(await screen.findByRole('dialog', { name: 'Leave conflict' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Assign anyway' }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      '/assignments/tasks/task-1/assignees',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ person_id: 'person-1', role: 'contributor', override_leave_conflict: true }),
      })
    ));
  });

  it('warns before assigning a teammate who is over capacity', async () => {
    vi.mocked(apiRequest).mockImplementation(async (endpoint: string) => {
      if (endpoint === '/operations/tasks') return [task] as never;
      if (endpoint === '/operations/people/directory') return [teammate] as never;
      if (endpoint === '/operations/projects') return [project] as never;
      if (endpoint === '/operations/projects/project-1/members') return [{
        id: 'member-1', project_id: 'project-1', person_id: 'person-1', person_name: 'Jane Doe',
        role: 'contributor', allocation_percent: 100, hours_per_week: 40,
      }] as never;
      if (endpoint === '/assignments/tasks/task-1/suggestions') return [{
        person_id: 'person-1', person_name: 'Jane Doe', load_percent: 125, open_tasks_count: 8,
        open_estimated_hours: 50, has_leave_conflict: false, is_recommended: false,
      }] as never;
      return undefined as never;
    });

    renderPage(<TasksPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Manage assignees' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Assign Jane Doe' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save assignments' }));
    expect(await screen.findByRole('dialog', { name: 'Workload warning' })).toHaveTextContent('125%');
    expect(apiRequest).not.toHaveBeenCalledWith('/assignments/tasks/task-1/assignees', expect.anything());
    fireEvent.click(screen.getByRole('button', { name: 'Assign anyway' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      '/assignments/tasks/task-1/assignees',
      expect.objectContaining({ method: 'POST' })
    ));
  });
});

describe('leave management', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    vi.mocked(apiRequest).mockImplementation(async (endpoint: string) => {
      if (endpoint === '/operations/me') return teammate as never;
      if (endpoint === '/operations/people/directory') return [teammate] as never;
      if (endpoint === '/operations/leave-types') return [{
        id: 'leave-type-1', name: 'Annual leave', code: 'annual', default_days_per_year: 20, is_paid: true, is_active: true,
      }] as never;
      if (endpoint === '/operations/leave-balances?employee_id=person-1') return [{
        id: 'balance-1', person_id: 'person-1', leave_type_id: 'leave-type-1', leave_type_name: 'Annual leave',
        year: 2026, allocated_days: 20, used_days: 4, remaining_days: 16,
      }] as never;
      if (endpoint === '/operations/leave-requests?employee_id=person-1') return [] as never;
      return [] as never;
    });
  });

  it('shows the live leave day count and current balance', async () => {
    renderPage(<LeaveManagementPage />);
    fireEvent.change(await screen.findByLabelText('First day'), { target: { value: '2026-10-19' } });
    fireEvent.change(screen.getByLabelText('Last day'), { target: { value: '2026-10-19' } });
    expect(await screen.findByText(/1 working day requested · 16 Annual leave days remaining/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Half-day request'));
    expect(screen.getByText(/0.5 working days requested · 16 Annual leave days remaining/)).toBeInTheDocument();
  });
});
