import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Login } from '../pages/Login';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';

describe('Login Component', () => {
  it('renders OpsPilot title and 1-click demo button', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </BrowserRouter>
    );

    expect(screen.getByRole('heading', { name: /OpsPilot/i })).toBeInTheDocument();
    expect(screen.getByText(/1-Click Demo Access/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Owner Demo/i })).toBeInTheDocument();
  });
});
