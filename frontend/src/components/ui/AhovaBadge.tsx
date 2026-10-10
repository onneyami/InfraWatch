import React from 'react'
import { theme } from '../../theme/tokens'

interface AhovaBadgeProps {
  variant: 'healthy' | 'warning' | 'critical' | 'info' | 'default'
  children: React.ReactNode
  size?: 'sm' | 'md'
  dot?: boolean
}

const variantColors: Record<string, { bg: string; text: string; dot: string }> = {
  healthy: { bg: 'rgba(34,197,94,0.1)', text: '#22C55E', dot: '#22C55E' },
  warning: { bg: 'rgba(234,179,8,0.1)', text: '#EAB308', dot: '#EAB308' },
  critical: { bg: 'rgba(239,68,68,0.1)', text: '#EF4444', dot: '#EF4444' },
  info: { bg: 'rgba(56,189,248,0.1)', text: '#38BDF8', dot: '#38BDF8' },
  default: { bg: 'rgba(148,163,184,0.1)', text: '#94A3B8', dot: '#94A3B8' },
}

export const AhovaBadge: React.FC<AhovaBadgeProps> = ({
  variant,
  children,
  size = 'sm',
  dot = true,
}) => {
  const colors = variantColors[variant]
  const height = size === 'sm' ? 24 : 28
  const fontSize = size === 'sm' ? '12px' : '13px'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        height,
        padding: `0 ${theme.spacing[2]}`,
        background: colors.bg,
        borderRadius: theme.radius.sm,
        fontSize,
        fontWeight: theme.fontWeight.medium,
        color: colors.text,
        whiteSpace: 'nowrap',
      }}
    >
      {dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: colors.dot,
            display: 'inline-block',
          }}
        />
      )}
      {children}
    </span>
  )
}