import React from 'react'
import { theme } from '../../theme/tokens'
import { AhovaCard } from './AhovaCard'

interface AhovaMetricProps {
  title: string
  value: string | number
  icon?: React.ReactNode
  trend?: {
    value: number
    direction: 'up' | 'down'
    label?: string
  }
  chart?: React.ReactNode
  subtitle?: string
  color?: string
  onClick?: () => void
}

export const AhovaMetric: React.FC<AhovaMetricProps> = ({
  title,
  value,
  icon,
  trend,
  chart,
  subtitle,
  color = theme.colors.brand.blue,
  onClick,
}) => {
  return (
    <AhovaCard variant="metric" onClick={onClick}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: theme.spacing[2],
          }}
        >
          <span
            style={{
              fontSize: theme.fontSize.xs,
              fontWeight: theme.fontWeight.medium,
              color: theme.colors.text.muted,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {title}
          </span>
          {icon && (
            <span style={{ color: color, opacity: 0.8, display: 'flex' }}>
              {icon}
            </span>
          )}
        </div>

        {/* Value */}
        <div style={{ marginBottom: trend || subtitle ? theme.spacing[1] : 0 }}>
          <span
            style={{
              fontSize: theme.fontSize['3xl'],
              fontWeight: theme.fontWeight.semibold,
              color: theme.colors.text.primary,
              lineHeight: 1.1,
            }}
          >
            {value}
          </span>
        </div>

        {/* Trend */}
        {trend && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing[1],
              marginBottom: chart ? theme.spacing[2] : 0,
            }}
          >
            <span
              style={{
                fontSize: theme.fontSize.xs,
                color: trend.direction === 'up' ? theme.colors.status.critical : theme.colors.status.healthy,
                fontWeight: theme.fontWeight.medium,
              }}
            >
              {trend.direction === 'up' ? '↑' : '↓'} {Math.abs(trend.value).toFixed(2)}%
            </span>
            {trend.label && (
              <span style={{ fontSize: theme.fontSize.xs, color: theme.colors.text.muted }}>
                {trend.label}
              </span>
            )}
          </div>
        )}

        {/* Subtitle */}
        {subtitle && !trend && (
          <div style={{ marginBottom: chart ? theme.spacing[2] : 0 }}>
            <span style={{ fontSize: theme.fontSize.xs, color: theme.colors.text.muted }}>
              {subtitle}
            </span>
          </div>
        )}

        {/* Mini chart */}
        {chart && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'flex-end',
              marginTop: 'auto',
            }}
          >
            {chart}
          </div>
        )}
      </div>
    </AhovaCard>
  )
}

// Mini sparkline component for metric cards
interface MiniSparklineProps {
  data: readonly number[]
  color?: string
  height?: number
}

let sparklineCounter = 0

export const MiniSparkline: React.FC<MiniSparklineProps> = ({
  data,
  color = theme.colors.brand.blue,
  height = 40,
}) => {
  if (data.length < 2) return null

  const id = React.useMemo(() => `spark-${++sparklineCounter}`, [])
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const width = 100

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((d - min) / range) * height
    return `${x},${y}`
  })

  const areaPoints = [
    `0,${height}`,
    ...points,
    `${width},${height}`,
  ]

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0.05} />
        </linearGradient>
      </defs>
      <polygon
        points={areaPoints.join(' ')}
        fill={`url(#${id})`}
      />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Need unique IDs for gradients - workaround
const GradientSparkline: React.FC<MiniSparklineProps & { id: string }> = (props) => {
  if (props.data.length < 2) return null

  const { data, color = theme.colors.brand.blue, height = 40, id } = props
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const width = 100

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((d - min) / range) * height
    return `${x},${y}`
  })

  const areaPoints = [
    `0,${height}`,
    ...points,
    `${width},${height}`,
  ]

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={`sparkline-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0.05} />
        </linearGradient>
      </defs>
      <polygon
        points={areaPoints.join(' ')}
        fill={`url(#sparkline-${id})`}
      />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export { GradientSparkline }