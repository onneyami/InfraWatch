import React from 'react'
import { X } from 'lucide-react'
import { theme } from '../../theme/tokens'

interface AhovaDrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  width?: number
}

export const AhovaDrawer: React.FC<AhovaDrawerProps> = ({
  open,
  onClose,
  title,
  children,
  width = 420,
}) => {
  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 100,
          animation: 'fadeIn 0.2s ease',
        }}
      />
      {/* Drawer */}
      <div
        className="animate-slideInRight"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width,
          height: '100vh',
          background: theme.colors.bg.secondary,
          borderLeft: `1px solid ${theme.colors.border.default}`,
          zIndex: 101,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-8px 0 30px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: theme.spacing[6],
            borderBottom: `1px solid ${theme.colors.border.default}`,
            flexShrink: 0,
          }}
        >
          <h2
            style={{
              fontSize: theme.fontSize.xl,
              fontWeight: theme.fontWeight.semibold,
              color: theme.colors.text.primary,
            }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: theme.colors.text.muted,
              cursor: 'pointer',
              padding: theme.spacing[1],
              borderRadius: theme.radius.sm,
              display: 'flex',
              transition: theme.transition.fast,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = theme.colors.text.primary }}
            onMouseLeave={(e) => { e.currentTarget.style.color = theme.colors.text.muted }}
          >
            <X size={18} />
          </button>
        </div>
        {/* Content */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: theme.spacing[6],
          }}
        >
          {children}
        </div>
      </div>
    </>
  )
}