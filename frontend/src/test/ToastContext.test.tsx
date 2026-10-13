import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ToastProvider } from '../context/ToastContext';
import { useToast } from '../context/toast';

function ToastActions() {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast.success('Project created.')}>Create</button>
      <button onClick={() => toast.error('Approval could not be updated.')}>Fail</button>
    </>
  );
}

describe('toast notifications', () => {
  it('announces operation outcomes and can dismiss them', () => {
    render(
      <ToastProvider>
        <ToastActions />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByRole('status')).toHaveTextContent('Project created.');

    fireEvent.click(screen.getByRole('button', { name: 'Fail' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Approval could not be updated.');

    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss notification' })[0]);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
