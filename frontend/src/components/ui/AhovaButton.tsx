import React from 'react'
import { theme } from '../../theme/tokens'

interface AhovaButtonProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  icon?: React.ReactNode
  style?: React.CSSProperties
}

const variantStyles: Record<string, React.CSSProperties> = {
  primary: {
    background: theme.colors.brand.gradient,
    color: '#FFFFFF',
    border: 'none',
  },
  secondary: {
    background: 'transparent',
    color: theme.colors.text.primary,
    border: `1px solid ${theme.colors.border.default}`,
  },
  danger: {
    background: 'rgba(239,68,68,0.1)',
    color: theme.colors.status.critical,
    border: `1px solid rgba(239,68,68,0.2)`,
  },
  ghost: {
    background: 'transparent',
    color: theme.colors.text.secondary,
    border: 'none',
  },
}

const sizeStyles: Record<string, { height: number; fontSize: string; padding: string }> = {
  sm: { height: 32, fontSize: '12px', padding: `0 ${theme.spacing[3]}` },
  md: { height: 40, fontSize: '14px', padding: `0 ${theme.spacing[4]}` },
  lg: { height: 48, fontSize: '15px', padding: `0 ${theme.spacing[5]}` },
}

export const AhovaButton: React.FC<AhovaButtonProps> = ({
  variant = 'primary',
  size = 'md',
  children,
  onClick,
  disabled,
  icon,
  style,
}) => {
  const sizeStyle = sizeStyles[size]

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing[2],
        height: sizeStyle.height,
        padding: sizeStyle.padding,
        fontSize: sizeStyle.fontSize,
        fontWeight: theme.fontWeight.medium,
        borderRadius: theme.radius.md,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: theme.transition.fast,
        whiteSpace: 'nowrap',
        ...variantStyles[variant],
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled && variant === 'secondary') {
          e.currentTarget.style.background = 'var(--ahova-fg-a05)'
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && variant === 'secondary') {
          e.currentTarget.style.background = 'transparent'
        }
      }}
    >
      {icon && <span style={{ display: 'flex' }}>{icon}</span>}
      {children}
    </button>
  )
}