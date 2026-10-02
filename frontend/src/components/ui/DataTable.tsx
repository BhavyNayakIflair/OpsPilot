import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Search, ArrowUpDown, ChevronDown, X } from 'lucide-react';
import { Skeleton } from './Skeleton';
import { EmptyState } from './EmptyState';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  accessor?: (row: T) => React.ReactNode;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  widthClass?: string;
  align?: 'left' | 'right' | 'center';
}

export interface DataTableFilterDef {
  key: string;
  label: string;
  type: 'dropdown' | 'chips';
  options: { value: string; label: string }[];
  multiple?: boolean;
  placeholder?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  filters?: DataTableFilterDef[];
  filterValues?: Record<string, string | string[]>;
  onFilterChange?: (key: string, value: string | string[]) => void;
  sortable?: boolean;
  sortKey?: string | null;
  sortDir?: 'asc' | 'desc' | null;
  onSortChange?: (key: string) => void;
  emptyState?: React.ReactNode;
  loading?: boolean;
  loadingRows?: number;
  rowClassName?: string | ((row: T) => string);
  headerClassName?: string;
  wrapperClassName?: string;
  children?: React.ReactNode;
  getRowHref?: (row: T) => string;
}

export function DataTable<T,>({
  columns,
  rows,
  rowKey,
  searchable = false,
  searchPlaceholder = 'Search...',
  searchValue,
  onSearchChange,
  filters,
  filterValues,
  onFilterChange,
  sortable = false,
  sortKey,
  sortDir,
  onSortChange,
  emptyState,
  loading = false,
  loadingRows = 5,
  rowClassName,
  headerClassName,
  wrapperClassName,
  children,
  getRowHref,
}: DataTableProps<T>) {
  const isControlledSearch = searchValue !== undefined && onSearchChange !== undefined;
  const [internalSearch, setInternalSearch] = React.useState('');
  const navigate = useNavigate();

  React.useEffect(() => {
    if (isControlledSearch) return;
    const timer = setTimeout(() => {
      onSearchChange?.(internalSearch);
    }, 200);
    return () => clearTimeout(timer);
  }, [internalSearch, isControlledSearch, onSearchChange]);

  const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isControlledSearch) {
      onSearchChange?.(e.target.value);
    } else {
      setInternalSearch(e.target.value);
    }
  };

  const alignClass = (align?: 'left' | 'right' | 'center') => {
    switch (align) {
      case 'right': return 'text-right';
      case 'center': return 'text-center';
      default: return 'text-left';
    }
  };

  const alignJustifyClass = (align?: 'left' | 'right' | 'center') => {
    switch (align) {
      case 'right': return 'justify-end';
      case 'center': return 'justify-center';
      default: return 'justify-start';
    }
  };

  const getCellValue = (row: T, col: DataTableColumn<T>): React.ReactNode => {
    if (col.render) return col.render(row);
    if (col.accessor) return col.accessor(row);
    const rowAny = row as Record<string, unknown>;
    return rowAny[col.key] as React.ReactNode;
  };

  const resolveRowClassName = (row: T): string | undefined => {
    if (!rowClassName) return undefined;
    if (typeof rowClassName === 'function') return rowClassName(row);
    return rowClassName;
  };

  const handleChipToggle = (filter: DataTableFilterDef, value: string) => {
    if (!onFilterChange || !filterValues) return;
    const current = filterValues[filter.key];
    if (filter.multiple) {
      const arr = Array.isArray(current) ? [...current] : [];
      const idx = arr.indexOf(value);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(value);
      onFilterChange(filter.key, arr);
    } else {
      const single = typeof current === 'string' ? current : '';
      onFilterChange(filter.key, single === value ? '' : value);
    }
  };

  const isChipActive = (filter: DataTableFilterDef, value: string): boolean => {
    if (!filterValues) return false;
    const current = filterValues[filter.key];
    if (filter.multiple) {
      return Array.isArray(current) && current.includes(value);
    }
    return typeof current === 'string' && current === value;
  };

  const clearChipFilter = (filter: DataTableFilterDef, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onFilterChange) return;
    onFilterChange(filter.key, filter.multiple ? [] : '');
  };

  return (
    <div className={cn(
      'rounded-ui-2xl border border-semantic-border bg-semantic-surface overflow-hidden shadow-ui-sm',
      wrapperClassName
    )}>
      <div className={cn('p-4 sm:p-5 flex flex-wrap items-center gap-3 border-b border-semantic-border', headerClassName)}>
        {searchable && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-semantic-text-muted" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={isControlledSearch ? searchValue! : internalSearch}
              onChange={handleSearchInput}
              className="rounded-ui-xl px-3.5 py-2 pl-9 text-sm border border-semantic-border bg-semantic-surface text-semantic-text placeholder:text-semantic-text-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-border min-w-[240px] w-full sm:w-auto"
            />
          </div>
        )}
        <div className="flex-1 min-w-[16px]" />
        {filters && filters.length > 0 && (
          <div className="flex flex-wrap items-end gap-3">
            {filters.map((filter) => (
              <div key={filter.key} className="flex flex-col gap-1">
                <label className="text-[11px] uppercase tracking-wider text-semantic-text-muted font-medium">
                  {filter.label}
                </label>
                {filter.type === 'dropdown' ? (
                  <div className="relative">
                    <select
                      value={filter.multiple ? '' : (typeof filterValues?.[filter.key] === 'string' ? filterValues[filter.key] as string : '')}
                      onChange={(e) => onFilterChange?.(filter.key, e.target.value)}
                      className="appearance-none rounded-ui-lg border border-semantic-border bg-semantic-surface text-semantic-text text-sm px-3 py-1.5 pr-8 min-w-[140px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-semantic-border"
                      multiple={filter.multiple}
                    >
                      <option value="">{filter.placeholder ?? 'All'}</option>
                      {filter.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-semantic-text-muted pointer-events-none" />
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {filter.options.map((opt) => {
                      const active = isChipActive(filter, opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleChipToggle(filter, opt.value)}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-180ms border',
                            active
                              ? 'bg-semantic-accent text-white border-semantic-accent hover:bg-semantic-accent-hover'
                              : 'border-semantic-border bg-semantic-surface text-semantic-text hover:bg-semantic-surface-muted'
                          )}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                    {(() => {
                      const current = filterValues?.[filter.key];
                      const hasValue = filter.multiple
                        ? Array.isArray(current) && current.length > 0
                        : typeof current === 'string' && current !== '';
                      if (!hasValue) return null;
                      return (
                        <button
                          type="button"
                          onClick={(e) => clearChipFilter(filter, e)}
                          className="inline-flex items-center justify-center w-6 h-6 rounded-full text-semantic-text-muted hover:text-semantic-text hover:bg-semantic-surface-muted transition-colors"
                          aria-label={`Clear ${filter.label}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      );
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {children && (
        <div className="flex p-4 sm:px-5 pt-2 items-center gap-2 border-b border-semantic-border/60">
          {children}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-semantic-surface-muted text-[11px] uppercase tracking-wider text-semantic-text-muted">
            <tr>
              {columns.map((col) => {
                const canSort = sortable && col.sortable;
                const isActiveSort = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    className={cn(
                      'px-4 py-3 first:pl-5 last:pr-5 whitespace-nowrap',
                      col.widthClass,
                      alignClass(col.align)
                    )}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={() => onSortChange?.(col.key)}
                        className={cn(
                          'inline-flex items-center gap-1.5 font-semibold transition-colors',
                          isActiveSort ? 'text-semantic-text font-bold' : 'hover:text-semantic-text',
                          alignJustifyClass(col.align),
                          col.align === 'right' ? 'ml-auto' : '',
                          col.align === 'center' ? 'mx-auto' : ''
                        )}
                      >
                        {col.header}
                        <ArrowUpDown
                          className={cn(
                            'w-3.5 h-3.5 transition-transform duration-150',
                            isActiveSort && sortDir === 'desc' && 'rotate-180',
                            isActiveSort && 'text-semantic-accent'
                          )}
                        />
                      </button>
                    ) : (
                      <span className="font-semibold">{col.header}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          {loading ? (
            <tbody className="divide-y divide-semantic-border">
              {Array.from({ length: loadingRows }).map((_, i) => (
                <tr key={i} className="border-t border-semantic-border/50">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-4 py-3 first:pl-5 last:pr-5',
                        col.widthClass
                      )}
                    >
                      <Skeleton variant="text" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ) : rows.length === 0 ? null : (
            <tbody className="divide-y divide-semantic-border">
              {rows.map((row) => {
                const key = rowKey(row);
                const href = getRowHref?.(row);
                return (
                  <tr
                    key={key}
                    className={cn(
                      'border-t border-semantic-border/50 hover:bg-semantic-surface-muted/60 transition-colors duration-150',
                      href && 'cursor-pointer',
                      resolveRowClassName(row)
                    )}
                    onClick={href ? () => { navigate(href); } : undefined}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          'px-4 py-3 first:pl-5 last:pr-5 text-semantic-text align-middle whitespace-nowrap',
                          col.widthClass,
                          alignClass(col.align)
                        )}
                      >
                        {getCellValue(row, col)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          )}
        </table>
      </div>
      {rows.length === 0 && !loading && (
        <div className="p-8">
          {emptyState ?? <EmptyState title="No results found" description="Try adjusting your search or filters." />}
        </div>
      )}
      {rows.length > 0 && (
        <div className="px-5 py-3 border-t border-semantic-border/60 flex items-center justify-between">
          <span className="text-xs text-semantic-text-muted">
            Showing <span className="font-semibold text-semantic-text">{rows.length}</span> {rows.length === 1 ? 'result' : 'results'}
          </span>
        </div>
      )}
    </div>
  );
}
