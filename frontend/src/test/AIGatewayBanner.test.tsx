import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AIGatewayBanner } from '../components/ui/AIGatewayBanner';

describe('AIGatewayBanner', () => {
  it('renders generating state with attempt counter and provider name', () => {
    render(
      <AIGatewayBanner
        status="generating"
        attempt={{ current: 1, total: 3 }}
        providerName="Gemini"
        modelName="gemini-2.5-flash"
      />
    );
    expect(screen.getByText('Generating… (attempt 1/3)')).toBeInTheDocument();
    expect(screen.getByText(/Gemini : gemini-2.5-flash/)).toBeInTheDocument();
  });

  it('renders degraded state indicating local model fallback', () => {
    const handleRetry = vi.fn();
    render(
      <AIGatewayBanner
        status="degraded"
        providerName="Ollama (local)"
        onRetry={handleRetry}
      />
    );
    expect(screen.getByText('Degraded: using local model')).toBeInTheDocument();
    expect(screen.getByText(/Ollama \(local\)/)).toBeInTheDocument();
    
    const retryBtn = screen.getByRole('button', { name: /retry cloud/i });
    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledOnce();
  });

  it('renders busy state with retry countdown and action button', () => {
    const handleRetry = vi.fn();
    render(
      <AIGatewayBanner
        status="busy"
        retrySeconds={30}
        onRetry={handleRetry}
      />
    );
    expect(screen.getByText(/All providers busy, retry in 30s/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /wait 30s/i })).toBeDisabled();
  });

  it('renders error state with fallback banner and retry button', () => {
    const handleRetry = vi.fn();
    render(
      <AIGatewayBanner
        status="error"
        errorMessage="Provider timeout: gemini"
        onRetry={handleRetry}
      />
    );
    expect(screen.getByText('AI request failed')).toBeInTheDocument();
    expect(screen.getByText(/Provider timeout: gemini/i)).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledOnce();
  });
});
