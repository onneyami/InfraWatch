import React from 'react'
import { theme } from '../../theme/tokens'

interface AhovaCardProps {
  title?: string
  icon?: React.ReactNode
  variant?: 'default' | 'metric' | 'alert' | 'status' | 'chart'
  children: React.ReactNode
  className?: string
  onClick?: () => void
  footer?: React.ReactNode
  style?: React.CSSProperties
}

const variantStyles: Record<string, React.CSSProperties> = {
  default: {},
  metric: { height: 160 },
  alert: { borderLeft: `3px solid ${theme.colors.status.critical}` },
  status: { borderLeft: `3px solid ${theme.colors.status.healthy}` },
  chart: { minHeight: 200 },
}

export const AhovaCard: React.FC<AhovaCardProps> = ({
  title,
  icon,
  variant = 'default',
  children,
  className = '',
  onClick,
  footer,
  style,
}) => {
  return (
    <div
      className={`ahova-card ${className}`}
      onClick={onClick}
      style={{
        background: theme.colors.bg.card,
        border: `1px solid ${theme.colors.border.default}`,
        borderRadius: theme.radius.lg,
        padding: theme.spacing[6],
        boxShadow: theme.shadows.card,
        cursor: onClick ? 'pointer' : undefined,
        transition: theme.transition.normal,
        ...variantStyles[variant],
        ...style,
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.borderColor = theme.colors.border.hover
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.borderColor = theme.colors.border.default
        }
      }}
    >
      {(title || icon) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: children ? theme.spacing[4] : 0,
          }}
        >
          {title && (
            <span
              style={{
                fontSize: theme.fontSize.sm,
                fontWeight: theme.fontWeight.medium,
                color: theme.colors.text.secondary,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {title}
            </span>
          )}
          {icon && (
            <span style={{ color: theme.colors.text.muted, display: 'flex' }}>
              {icon}
            </span>
          )}
        </div>
      )}
      <div>{children}</div>
      {footer && (
        <div
          style={{
            marginTop: theme.spacing[4],
            paddingTop: theme.spacing[3],
            borderTop: `1px solid ${theme.colors.border.default}`,
          }}
        >
          {footer}
        </div>
      )}
    </div>
  )
}