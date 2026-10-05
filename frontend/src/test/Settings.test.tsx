import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Settings } from '../pages/Settings';

const { mockApiRequest, mockRefreshUser, mockUser } = vi.hoisted(() => ({
  mockApiRequest: vi.fn(),
  mockRefreshUser: vi.fn(),
  mockUser: {
    id: 'user-1',
    email: 'user@example.com',
    full_name: 'Test User',
    role: 'owner' as const,
    org_id: 'org-1',
    org_name: 'Test Workspace',
    locale: 'en' as const,
    is_active: true,
  },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, refreshUser: mockRefreshUser }),
}));

vi.mock('../lib/api', () => ({
  apiRequest: mockApiRequest,
}));

describe('Settings language preference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiRequest.mockImplementation(async (path: string) => {
      if (path === '/organizations/current') {
        return {
          id: 'org-1',
          name: 'Test Workspace',
          slug: 'test-workspace',
          currency: 'USD',
          plan: 'Team',
          monthly_spend_cap_cents: 5000,
          ai_spend_cents: 0,
          settings: {},
        };
      }
      if (path === '/organizations/members') return [];
      return {};
    });
  });

  it('saves the selected language as a personal profile preference', async () => {
    render(<Settings />);

    fireEvent.change(await screen.findByLabelText('Language'), { target: { value: 'fr' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith('/users/profile', {
        method: 'PUT',
        body: JSON.stringify({ full_name: 'Test User', locale: 'fr' }),
      });
    });
    expect(mockRefreshUser).toHaveBeenCalled();
  });
});
