import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { ToastContext, type ToastContextValue, type ToastVariant } from './toast';

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

const toastStyles: Record<ToastVariant, { icon: typeof CheckCircle2; classes: string }> = {
  success: {
    icon: CheckCircle2,
    classes: 'border-semantic-success/30 bg-semantic-surface text-semantic-success',
  },
  error: {
    icon: AlertCircle,
    classes: 'border-semantic-danger/30 bg-semantic-surface text-semantic-danger',
  },
  warning: {
    icon: TriangleAlert,
    classes: 'border-semantic-warning/30 bg-semantic-surface text-semantic-warning',
  },
  info: {
    icon: Info,
    classes: 'border-semantic-info/30 bg-semantic-surface text-semantic-info',
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, variant: ToastVariant = 'success') => {
    const id = ++nextId.current;
    setToasts((current) => [...current, { id, message, variant }]);
    timers.current.set(id, setTimeout(() => {
      timers.current.delete(id);
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 5000));
  }, []);

  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  }, []);

  const contextValue: ToastContextValue = {
    showToast,
    success: (message) => showToast(message, 'success'),
    error: (message) => showToast(message, 'error'),
    warning: (message) => showToast(message, 'warning'),
    info: (message) => showToast(message, 'info'),
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div
        className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3"
        aria-label="Notifications"
      >
        {toasts.map((toast) => {
          const { icon: Icon, classes } = toastStyles[toast.variant];
          return (
            <div
              key={toast.id}
              role={toast.variant === 'error' || toast.variant === 'warning' ? 'alert' : 'status'}
              aria-live={toast.variant === 'error' || toast.variant === 'warning' ? 'assertive' : 'polite'}
              className={`toast-enter pointer-events-auto flex items-start gap-3 rounded-ui-xl border px-4 py-3 text-sm shadow-lg ${classes}`}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="min-w-0 flex-1 break-words text-semantic-text">{toast.message}</p>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => dismiss(toast.id)}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-ui-md text-semantic-text-muted transition hover:bg-semantic-surface-muted hover:text-semantic-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-accent-ring"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
