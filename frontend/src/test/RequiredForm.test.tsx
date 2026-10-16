import { describe, expect, it, vi } from 'vitest';
import type { SubmitEvent } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ToastProvider } from '../context/ToastContext';
import { RequiredForm } from '../components/ui/RequiredForm';

describe('required forms', () => {
  it('shows an error toast and blocks submission when a required field is empty', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <ToastProvider>
        <RequiredForm aria-label="Create project" onSubmit={onSubmit}>
          <label>
            Project name
            <input required value="" readOnly />
          </label>
          <button type="submit">Create project</button>
        </RequiredForm>
      </ToastProvider>
    );

    const form = screen.getByRole('form', { name: 'Create project' });
    fireEvent.submit(form);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Please complete all required fields before continuing.'
    );
    expect(container.querySelector('.required-indicator')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits when required fields are complete', () => {
    const onSubmit = vi.fn((event: SubmitEvent<HTMLFormElement>) => event.preventDefault());
    render(
      <ToastProvider>
        <RequiredForm aria-label="Create project" onSubmit={onSubmit}>
          <label>
            Project name
            <input required value="Workspace" readOnly />
          </label>
          <button type="submit">Create project</button>
        </RequiredForm>
      </ToastProvider>
    );

    fireEvent.submit(screen.getByRole('form', { name: 'Create project' }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
