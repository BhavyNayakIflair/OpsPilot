import {
  Children,
  cloneElement,
  isValidElement,
  type FormHTMLAttributes,
  type ReactNode,
  type SubmitEvent,
} from 'react';
import { useToast } from '../../context/toast';

type RequiredControlProps = {
  required?: boolean;
  'aria-required'?: boolean | 'true';
  'aria-valuetext'?: string;
  children?: ReactNode;
};

export function RequiredIndicator() {
  return <span className="required-indicator ml-1 text-semantic-danger" aria-hidden="true" />;
}

function containsRequiredControl(node: ReactNode): boolean {
  let found = false;
  Children.forEach(node, (child) => {
    if (!isValidElement<RequiredControlProps>(child)) return;
    if (
      child.props.required ||
      child.props['aria-required'] === true ||
      child.props['aria-required'] === 'true' ||
      containsRequiredControl(child.props.children)
    ) {
      found = true;
    }
  });
  return found;
}

function addRequiredIndicator(children: ReactNode): ReactNode {
  const childList = Children.toArray(children);
  const labelTextIndex = childList.findIndex(
    (child) => typeof child === 'string' && child.trim().length > 0
  );

  if (labelTextIndex < 0) {
    return [<RequiredIndicator key="required-indicator" />, ...childList];
  }

  return [
    ...childList.slice(0, labelTextIndex + 1),
    <RequiredIndicator key="required-indicator" />,
    ...childList.slice(labelTextIndex + 1),
  ];
}

function addRequiredIndicators(node: ReactNode): ReactNode {
  return Children.map(node, (child) => {
    if (!isValidElement<RequiredControlProps>(child)) return child;

    if (child.type === 'label' && containsRequiredControl(child.props.children)) {
      return cloneElement(child, undefined, addRequiredIndicator(child.props.children));
    }

    if (containsRequiredControl(child.props.children)) {
      return cloneElement(child, undefined, addRequiredIndicators(child.props.children));
    }

    return child;
  });
}

function isEmptyRequiredControl(control: Element): boolean {
  if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) {
    return !control.getAttribute('aria-valuetext')?.trim();
  }
  if (!control.required) return false;
  if (control instanceof HTMLInputElement && control.type === 'checkbox') {
    return !control.checked;
  }
  if (control instanceof HTMLInputElement && control.type === 'file') {
    return !control.files?.length;
  }
  return !control.value.trim();
}

function hasInvalidNativeValue(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): boolean {
  const validity = control.validity;
  if (validity.valid) return false;

  const hasOtherError = [
    validity.badInput,
    validity.customError,
    validity.patternMismatch,
    validity.rangeOverflow,
    validity.rangeUnderflow,
    validity.tooLong,
    validity.tooShort,
    validity.typeMismatch,
    validity.valueMissing && !(control instanceof HTMLInputElement && control.type === 'file' && control.files?.length),
  ].some(Boolean);
  if (hasOtherError) return true;

  if (validity.stepMismatch && control instanceof HTMLInputElement && control.type === 'number') {
    const step = control.step === 'any' ? NaN : Number(control.step || '1');
    const value = Number(control.value);
    const base = Number(control.min || '0');
    if (!Number.isFinite(step) || step <= 0 || !Number.isFinite(value) || !Number.isFinite(base)) return true;
    const quotient = (value - base) / step;
    const tolerance = Number.EPSILON * Math.max(1, Math.abs(quotient)) * 8;
    return Math.abs(quotient - Math.round(quotient)) > tolerance;
  }

  return validity.stepMismatch;
}

export type RequiredFormProps = FormHTMLAttributes<HTMLFormElement>;

export function RequiredForm({ children, onSubmit, ...props }: RequiredFormProps) {
  const toast = useToast();

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    const controls = Array.from(event.currentTarget.querySelectorAll('input, select, textarea, [aria-required="true"]'));
    const invalidControl = controls.find(
      (control) =>
        isEmptyRequiredControl(control) ||
        (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement
          ? hasInvalidNativeValue(control)
          : false)
    );

    if (invalidControl) {
      event.preventDefault();
      toast.error('Please complete all required fields before continuing.');
      if (invalidControl instanceof HTMLElement) invalidControl.focus();
      return;
    }

    onSubmit?.(event);
  };

  return (
    <form {...props} noValidate onSubmit={handleSubmit}>
      {addRequiredIndicators(children)}
    </form>
  );
}
