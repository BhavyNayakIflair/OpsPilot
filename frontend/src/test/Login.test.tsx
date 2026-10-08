import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Login } from '../pages/Login';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import * as apiModule from '../lib/api';

vi.mock('lottie-react', () => ({
  useLottie: () => ({ View: <div data-testid="login-animation" /> }),
}));

describe('Login & Forgot Password Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders "Forgot password?" link on login form and transitions to forgot password view', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </BrowserRouter>
    );

    const forgotBtn = screen.getByRole('button', { name: /Forgot password\?/i });
    expect(forgotBtn).toBeInTheDocument();

    fireEvent.click(forgotBtn);

    expect(screen.getByRole('heading', { name: /Forgot Password/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/name@company.com/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send Reset Link/i })).toBeInTheDocument();
  });

  it('can navigate back to Sign In from forgot password view', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Forgot password\?/i }));
    expect(screen.getByRole('heading', { name: /Forgot Password/i })).toBeInTheDocument();

    const backBtn = screen.getByRole('button', { name: /Back to Sign In/i });
    fireEvent.click(backBtn);

    expect(screen.getByRole('button', { name: /Sign In to Workspace/i })).toBeInTheDocument();
  });

  it('submits forgot password request and displays generated reset actions', async () => {
    const apiSpy = vi.spyOn(apiModule, 'apiRequest').mockResolvedValueOnce({
      message: 'Password reset link generated',
      reset_token: 'test-token-1234567890',
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Forgot password\?/i }));

    const emailInput = screen.getByPlaceholderText(/name@company.com/i);
    fireEvent.change(emailInput, { target: { value: 'alice@northwind.io' } });

    const submitBtn = screen.getByRole('button', { name: /Send Reset Link/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Password Reset Link Ready/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Reset Now/i })).toBeInTheDocument();
    });

    expect(apiSpy).toHaveBeenCalledWith(
      '/auth/forgot-password',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });
});
