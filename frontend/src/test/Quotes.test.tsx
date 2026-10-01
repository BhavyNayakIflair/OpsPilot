import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { apiRequest } from '../lib/api';
import { Quotes } from '../pages/Quotes';

vi.mock('../lib/api', () => ({ apiRequest: vi.fn() }));

describe('Quotes', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    vi.mocked(apiRequest).mockImplementation(async (endpoint: string) => {
      if (endpoint === '/quotes' || endpoint === '/crm/leads' || endpoint === '/quotes/rate-cards') return [] as never;
      return {} as never;
    });
  });

  it('submits quote line items and percentage adjustments', async () => {
    render(<Quotes />);
    fireEvent.change(await screen.findByPlaceholderText('Proposal title'), { target: { value: 'New website' } });
    fireEvent.change(screen.getByPlaceholderText('Line item description'), { target: { value: 'Design sprint' } });
    fireEvent.change(screen.getByPlaceholderText('Unit price'), { target: { value: '1250.50' } });
    fireEvent.change(screen.getByLabelText('Tax (%)'), { target: { value: '10' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create quote' }).closest('form')!);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/quotes', expect.objectContaining({ method: 'POST' })));
    const request = vi.mocked(apiRequest).mock.calls.find(([path, options]) => path === '/quotes' && options?.method === 'POST');
    const payload = JSON.parse(String(request?.[1]?.body));
    expect(payload.title).toBe('New website');
    expect(payload.tax_bps).toBe(1000);
    expect(payload.line_items).toEqual([{ description: 'Design sprint', quantity: 1, unit_price_cents: 125050, rate_card_id: null }]);
  });

  it('supports adding another proposal line', async () => {
    render(<Quotes />);
    fireEvent.click(await screen.findByRole('button', { name: '+ Add line item' }));
    expect(screen.getAllByPlaceholderText('Line item description')).toHaveLength(2);
    expect(screen.getAllByPlaceholderText('Unit price')).toHaveLength(2);
    expect(screen.getByLabelText('Quantity for item 2')).toBeInTheDocument();
  });
});
