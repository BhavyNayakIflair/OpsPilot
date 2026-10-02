import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import {
  Info,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  X,
  type LucideIcon,
} from 'lucide-react';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
  icon?: LucideIcon;
  dismissible?: boolean;
  onDismiss?: () => void;
}

interface AlertTitleProps extends HTMLAttributes<HTMLDivElement> {}
interface AlertDescriptionProps extends HTMLAttributes<HTMLParagraphElement> {}

const variantClasses: Record<AlertVariant, string> = {
  info: 'bg-semantic-info-soft text-semantic-info border-semantic-info/30',
  success: 'bg-semantic-success-soft text-semantic-success border-semantic-success/30',
  warning: 'bg-semantic-warning-soft text-semantic-warning border-semantic-warning/30',
  danger: 'bg-semantic-danger-soft text-semantic-danger border-semantic-danger/30',
};

const variantIcons: Record<AlertVariant, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
};

export const AlertTitle = forwardRef<HTMLDivElement, AlertTitleProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('font-semibold text-sm', className)} {...props} />
  )
);
AlertTitle.displayName = 'AlertTitle';

export const AlertDescription = forwardRef<HTMLParagraphElement, AlertDescriptionProps>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm mt-1 leading-6', className)} {...props} />
  )
);
AlertDescription.displayName = 'AlertDescription';

export function Alert({
  variant = 'info',
  title,
  icon: IconProp,
  dismissible = false,
  onDismiss,
  className,
  children,
  ...props
}: AlertProps) {
  const Icon = IconProp ?? variantIcons[variant];
  const content = children as ReactNode;

  return (
    <div
      role="alert"
      className={cn(
        'rounded-ui-xl border px-4 py-3 text-sm flex items-start gap-2.5 transition-all duration-180ms toast-enter',
        variantClasses[variant],
        className
      )}
      {...props}
    >
      <Icon className="h-4 w-4 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {title && <AlertTitle>{title}</AlertTitle>}
        {content && (
          <AlertDescription>
            {content}
          </AlertDescription>
        )}
      </div>
      {dismissible && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className={cn(
            'shrink-0 -mr-1 -mt-1 h-7 w-7 inline-flex items-center justify-center rounded-ui-md',
            'text-current/70 hover:text-current hover:bg-current/10 transition',
            'focus:outline-none focus:ring-2 focus:ring-current/20'
          )}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
