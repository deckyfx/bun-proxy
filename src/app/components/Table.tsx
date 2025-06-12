import type { ReactNode } from 'react';

export interface TableColumn<T = Record<string, unknown>> {
  key: string;
  label: string;
  className?: string;
  headerClassName?: string;
  sortable?: boolean;
  width?: string | number;
  render?: (value: T[keyof T] | undefined, item: T, index: number) => ReactNode;
  onClick?: (item: T, index: number) => void;
}

export interface TableProps<T = Record<string, unknown>> {
  columns: TableColumn<T>[];
  data: T[];
  renderRow?: (item: T, index: number) => ReactNode;
  loading?: boolean;
  loadingMessage?: string;
  emptyMessage?: string | ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  rowClassName?: string | ((item: T, index: number) => string);
  onRowClick?: (item: T, index: number) => void;
  onCellClick?: (column: TableColumn<T>, item: T, index: number) => void;
  hoverable?: boolean;
  getRowKey?: (item: T, index: number) => string | number;
}

export default function Table<T = Record<string, unknown>>({
  columns,
  data,
  renderRow,
  loading = false,
  loadingMessage = 'Loading...',
  emptyMessage = 'No data available',
  className = '',
  headerClassName = '',
  bodyClassName = '',
  rowClassName = '',
  onRowClick,
  onCellClick,
  hoverable = true,
  getRowKey
}: TableProps<T>) {
  const colSpan = columns.length;

  const getRowClassName = (item: T, index: number): string => {
    const baseClass = hoverable ? 'hover:bg-gray-50' : '';
    const clickableClass = onRowClick ? 'cursor-pointer' : '';
    const customClass = typeof rowClassName === 'function' 
      ? rowClassName(item, index) 
      : rowClassName;
    
    return `${baseClass} ${clickableClass} ${customClass}`.trim();
  };

  const getCellClassName = (column: TableColumn<T>): string => {
    const baseClass = 'px-4 py-3 text-sm text-gray-900';
    const clickableClass = (column.onClick || onCellClick) ? 'cursor-pointer' : '';
    const customClass = column.className || '';
    
    return `${baseClass} ${clickableClass} ${customClass}`.trim();
  };

  const handleRowClick = (item: T, index: number) => {
    if (onRowClick) {
      onRowClick(item, index);
    }
  };

  const handleCellClick = (column: TableColumn<T>, item: T, index: number) => {
    if (column.onClick) {
      column.onClick(item, index);
    }
    if (onCellClick) {
      onCellClick(column, item, index);
    }
  };

  const renderCell = (column: TableColumn<T>, item: T, index: number): ReactNode => {
    const value = (item as Record<string, unknown>)[column.key];
    
    if (column.render) {
      return column.render(value as T[keyof T] | undefined, item, index);
    }
    
    return value !== undefined && value !== null ? String(value) : '-';
  };

  const getUniqueRowKey = (item: T, index: number): string | number => {
    if (getRowKey) {
      return getRowKey(item, index);
    }
    
    // Try to find a unique identifier in the item
    const itemRecord = item as Record<string, unknown>;
    if (itemRecord.id !== undefined) {
      return String(itemRecord.id);
    }
    if (itemRecord.domain !== undefined && itemRecord.addedAt !== undefined) {
      return `${itemRecord.domain}-${itemRecord.addedAt}`;
    }
    if (itemRecord.timestamp !== undefined && itemRecord.type !== undefined) {
      return `${itemRecord.timestamp}-${itemRecord.type}-${index}`;
    }
    
    // Fallback to index (not ideal but prevents crashes)
    return `row-${index}`;
  };

  const renderTableRow = (item: T, index: number): ReactNode => {
    // If custom renderRow is provided, use it
    if (renderRow) {
      return renderRow(item, index);
    }

    // Otherwise, render using column configuration
    return (
      <tr 
        key={getUniqueRowKey(item, index)}
        className={getRowClassName(item, index)}
        onClick={() => handleRowClick(item, index)}
      >
        {columns.map((column) => (
          <td
            key={String(column.key)}
            className={getCellClassName(column)}
            style={column.width ? { width: column.width } : undefined}
            onClick={(e) => {
              if (column.onClick || onCellClick) {
                e.stopPropagation(); // Prevent row click when cell has its own handler
                handleCellClick(column, item, index);
              }
            }}
          >
            {renderCell(column, item, index)}
          </td>
        ))}
      </tr>
    );
  };

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full">
        <thead className={`bg-gray-50 ${headerClassName}`}>
          <tr>
            {columns.map((column) => (
              <th
                key={String(column.key)}
                className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${column.headerClassName || ''}`}
                style={column.width ? { width: column.width } : undefined}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={`bg-white divide-y divide-gray-200 ${bodyClassName}`}>
          {loading ? (
            <tr>
              <td colSpan={colSpan} className="px-4 py-8 text-center text-gray-500">
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2"></div>
                  {loadingMessage}
                </div>
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="px-4 py-8 text-center text-gray-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item, index) => renderTableRow(item, index))
          )}
        </tbody>
      </table>
    </div>
  );
}