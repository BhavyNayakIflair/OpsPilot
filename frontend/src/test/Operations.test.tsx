import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { apiRequest } from '../lib/api';
import { ApprovalsPage } from '../pages/Operations';

vi.mock('../lib/api', () => ({ apiRequest: vi.fn() }));

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

describe('ApprovalsPage', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    vi.mocked(apiRequest).mockImplementation(async (endpoint: string) => {
      if (endpoint === '/workflows/approvals') return approvals as never;
      return {} as never;
    });
  });

  it('lists every approval type returned by the API', async () => {
    render(<ApprovalsPage />);
    expect(await screen.findByText('Homepage design work')).toBeInTheDocument();
    expect(screen.getByText('AWS: monthly hosting')).toBeInTheDocument();
    expect(screen.getByText('Quote draft review · Portal rebuild')).toBeInTheDocument();
  });

  it('filters the queue by entity type using the API entity_type values', async () => {
    render(<ApprovalsPage />);
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
    render(<ApprovalsPage />);
    await screen.findByText('AWS: monthly hosting');
    // Queue is sorted oldest first: timesheet, expense, quote draft.
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
