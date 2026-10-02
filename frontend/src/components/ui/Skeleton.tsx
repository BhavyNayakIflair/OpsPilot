import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { HTMLAttributes } from 'react';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

type SkeletonVariant = 'text' | 'card' | 'table-row' | 'stat-tile' | 'circle';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
  widthClass?: string;
  heightClass?: string;
}

const variantClasses: Record<SkeletonVariant, string> = {
  text: 'h-4 rounded-ui-md w-full',
  card: 'h-40 rounded-ui-2xl w-full',
  'table-row': 'h-14 rounded-ui-lg w-full',
  'stat-tile': 'h-24 rounded-ui-2xl w-full',
  circle: 'w-10 h-10 rounded-full',
};

export function Skeleton({ variant = 'text', widthClass, heightClass, className, style, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'skeleton-shimmer',
        variantClasses[variant],
        widthClass,
        heightClass,
        className
      )}
      style={style}
      {...props}
    />
  );
}
