import React from 'react'
import { theme } from '../../theme/tokens'

export interface Column<T> {
  key: string
  header: string
  render?: (item: T) => React.ReactNode
  width?: string
  align?: 'left' | 'right' | 'center'
  sortable?: boolean
}

interface AhovaTableProps<T> {
  columns: Column<T>[]
  data: T[]
  onRowClick?: (item: T) => void
  emptyMessage?: string
  emptyIcon?: React.ReactNode
}

export function AhovaTable<T>({
  columns,
  data,
  onRowClick,
  emptyMessage,
  emptyIcon,
}: AhovaTableProps<T>) {
  if (data.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: theme.spacing[12],
          color: theme.colors.text.muted,
          gap: theme.spacing[3],
        }}
      >
        {emptyIcon && <span style={{ opacity: 0.5, fontSize: 32 }}>{emptyIcon}</span>}
        <span style={{ fontSize: theme.fontSize.sm }}>
          {emptyMessage || 'No data available'}
        </span>
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  padding: `${theme.spacing[3]} ${theme.spacing[4]}`,
                  textAlign: col.align || 'left',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: theme.colors.text.muted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  borderBottom: `1px solid ${theme.colors.border.default}`,
                  whiteSpace: 'nowrap',
                  width: col.width,
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item, idx) => (
            <tr
              key={(item as any).id || idx}
              onClick={() => onRowClick?.(item)}
              style={{
                cursor: onRowClick ? 'pointer' : undefined,
                transition: theme.transition.fast,
                borderBottom: `1px solid ${theme.colors.border.default}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--ahova-fg-a02)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    padding: `${theme.spacing[3]} ${theme.spacing[4]}`,
                    textAlign: col.align || 'left',
                    fontSize: theme.fontSize.sm,
                    color: theme.colors.text.primary,
                    height: 56,
                  }}
                >
                  {col.render
                    ? col.render(item)
                    : (item as any)[col.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}