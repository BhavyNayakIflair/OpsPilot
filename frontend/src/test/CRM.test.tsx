import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CRM } from '../pages/CRM';
import { apiRequest } from '../lib/api';

vi.mock('../lib/api', () => ({ apiRequest: vi.fn() }));

describe('CRM', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    vi.mocked(apiRequest).mockImplementation(async (endpoint: string) => {
      if (endpoint === '/crm/companies') return [{ id: 'co-1', name: 'Northwind' }] as never;
      if (endpoint === '/crm/contacts') return [] as never;
      if (endpoint === '/crm/stages') return [{ id: 'stage-1', name: 'New', position: 0, probability: 10, is_won: false, is_lost: false }] as never;
      if (endpoint === '/crm/leads') return [{ id: 'lead-1', title: 'Portal rebuild', company_id: 'co-1', stage_id: 'stage-1', status: 'open', value_cents: 200000, currency: 'USD', source: 'manual' }] as never;
      return {} as never;
    });
  });

  it('loads leads and renders them on the pipeline board', async () => {
    render(<CRM />);
    expect(await screen.findByText('Portal rebuild')).toBeInTheDocument();
    expect(screen.getByText('Northwind')).toBeInTheDocument();
  });

  it('sends a stage update after dragging a lead to another stage', async () => {
    vi.mocked(apiRequest).mockImplementation(async (endpoint: string, options?: RequestInit) => {
      if (endpoint === '/crm/companies') return [{ id: 'co-1', name: 'Northwind' }] as never;
      if (endpoint === '/crm/contacts') return [] as never;
      if (endpoint === '/crm/stages') return [{ id: 'stage-1', name: 'New', position: 0, probability: 10, is_won: false, is_lost: false }, { id: 'stage-2', name: 'Qualified', position: 1, probability: 30, is_won: false, is_lost: false }] as never;
      if (endpoint === '/crm/leads') return [{ id: 'lead-1', title: 'Portal rebuild', company_id: 'co-1', stage_id: 'stage-1', status: 'open', value_cents: 200000, currency: 'USD', source: 'manual' }] as never;
      if (endpoint === '/crm/leads/lead-1' && options?.method === 'PATCH') return {} as never;
      return {} as never;
    });
    render(<CRM />);
    await screen.findByText('Portal rebuild');
    const destination = screen.getByText('Qualified').closest('section');
    expect(destination).not.toBeNull();
    const data = { setData: vi.fn(), getData: vi.fn(() => 'lead-1') };
    fireEvent.drop(destination!, { dataTransfer: data });
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/crm/leads/lead-1', expect.objectContaining({ method: 'PATCH' })));
    expect(screen.getByText('Portal rebuild')).toBeInTheDocument();
  });
});
