import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import { Quotes } from '../pages/Quotes';

vi.mock('../lib/api', () => ({ apiRequest: vi.fn() }));

const renderQuotes = () => render(
  <MemoryRouter>
    <Quotes />
  </MemoryRouter>
);

// The quote editor form (the page also renders a rate-card form and an
// empty-state "Create quote" action when no quotes exist).
const editorForm = async () => {
  const buttons = await screen.findAllByRole('button', { name: 'Create quote' });
  const submitButton = buttons.find((b) => b.getAttribute('type') === 'submit');
  const form = submitButton?.closest('form');
  if (!form) throw new Error('Quote editor form not found');
  return within(form);
};

describe('Quotes', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    vi.mocked(apiRequest).mockImplementation(async (endpoint: string) => {
      if (endpoint === '/quotes' || endpoint === '/crm/leads' || endpoint === '/quotes/rate-cards') return [] as never;
      return {} as never;
    });
  });

  it('submits quote line items and percentage adjustments', async () => {
    renderQuotes();
    const form = await editorForm();
    fireEvent.change(form.getByPlaceholderText('e.g. Website implementation'), { target: { value: 'New website' } });
    fireEvent.change(form.getByPlaceholderText('What are you quoting?'), { target: { value: 'Design sprint' } });
    fireEvent.change(form.getByPlaceholderText('0.00'), { target: { value: '1250.50' } });
    fireEvent.change(form.getByLabelText('Tax (%)'), { target: { value: '10' } });
    fireEvent.submit(form.getByRole('button', { name: 'Create quote' }).closest('form')!);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/quotes', expect.objectContaining({ method: 'POST' })));
    const request = vi.mocked(apiRequest).mock.calls.find(([path, options]) => path === '/quotes' && options?.method === 'POST');
    const payload = JSON.parse(String(request?.[1]?.body));
    expect(payload.title).toBe('New website');
    expect(payload.tax_bps).toBe(1000);
    expect(payload.line_items).toEqual([{ description: 'Design sprint', quantity: 1, unit_price_cents: 125050, rate_card_id: null }]);
  });

  it('supports adding another proposal line', async () => {
    renderQuotes();
    const form = await editorForm();
    fireEvent.click(form.getByRole('button', { name: '+ Add line item' }));
    expect(form.getAllByPlaceholderText('What are you quoting?')).toHaveLength(2);
    expect(form.getAllByPlaceholderText('0.00')).toHaveLength(2);
    expect(form.getByLabelText('Quantity for item 2')).toBeInTheDocument();
  });
});
