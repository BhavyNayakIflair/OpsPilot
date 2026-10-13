import { createContext, useContext } from 'react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

export const ToastContext = createContext<ToastContextValue>({
  showToast: () => undefined,
  success: () => undefined,
  error: () => undefined,
  warning: () => undefined,
  info: () => undefined,
});

export function useToast() {
  return useContext(ToastContext);
}
