export const theme = {
  colors: {
    // Backgrounds
    bg: {
      primary: 'var(--ahova-bg-primary)',
      secondary: 'var(--ahova-bg-secondary)',
      card: 'var(--ahova-bg-card)',
      elevated: 'var(--ahova-bg-elevated)',
    },
    // Borders
    border: {
      default: 'var(--ahova-border-default)',
      hover: 'var(--ahova-border-hover)',
    },
    // Text
    text: {
      primary: 'var(--ahova-text-primary)',
      secondary: 'var(--ahova-text-secondary)',
      muted: 'var(--ahova-text-muted)',
    },
    // Brand — сознательно НЕ меняются между темами (акцентные цвета
    // остаются одинаковыми что в тёмной, что в светлой теме — обычная
    // практика для инструментов в духе Linear/Vercel)
    brand: {
      blue: '#3B82F6',
      purple: '#8B5CF6',
      gradient: 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
    },
    // Status — тоже фиксированные, это семантические цвета состояний
    status: {
      healthy: '#22C55E',
      warning: '#EAB308',
      critical: '#EF4444',
      info: '#38BDF8',
    },
    // Sidebar
    sidebar: {
      bg: 'var(--ahova-sidebar-bg)',
      activeBg: 'rgba(139,92,246,0.15)',
      activeBorder: 'linear-gradient(180deg, #3B82F6, #8B5CF6)',
      text: 'var(--ahova-sidebar-text)',
    },
  },
  spacing: {
    px: '1px',
    0: '0',
    0.5: '2px',
    1: '4px',
    1.5: '6px',
    2: '8px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    8: '32px',
    10: '40px',
    12: '48px',
    16: '64px',
  },
  radius: {
    sm: '8px',
    md: '10px',
    lg: '16px',
    xl: '24px',
  },
  fontSize: {
    xs: '12px',
    sm: '14px',
    base: '14px',
    lg: '16px',
    xl: '20px',
    '2xl': '24px',
    '3xl': '32px',
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  shadows: {
    card: '0 8px 30px rgba(0,0,0,0.25)',
    glow: {
      blue: '0 0 30px rgba(59,130,246,0.25)',
      purple: '0 0 30px rgba(139,92,246,0.25)',
      green: '0 0 30px rgba(34,197,94,0.25)',
      yellow: '0 0 30px rgba(234,179,8,0.25)',
      red: '0 0 30px rgba(239,68,68,0.25)',
    },
  },
  transition: {
    fast: '150ms ease',
    normal: '200ms ease',
    slow: '250ms ease',
  },
  layout: {
    sidebarWidth: 260,
    sidebarCollapsed: 72,
    topBarHeight: 64,
    contentPadding: 32,
    maxContentWidth: 1600,
  },
} as const

export type Theme = typeof theme