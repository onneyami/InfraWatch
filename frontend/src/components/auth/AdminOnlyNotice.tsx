import React from 'react'
import { ShieldAlert } from 'lucide-react'
import { theme } from '../../theme/tokens'
import { AhovaCard } from '../ui/AhovaCard'

/** Shown instead of a page that needs an administrator. */
export const AdminOnlyNotice: React.FC = () => (
  <AhovaCard>
    <div style={{ textAlign: 'center', padding: theme.spacing[8], color: theme.colors.text.muted }}>
      <ShieldAlert size={48} style={{ margin: '0 auto', opacity: 0.4, marginBottom: theme.spacing[4] }} />
      <p style={{ fontSize: 16, fontWeight: 500, marginBottom: theme.spacing[2], color: theme.colors.text.primary }}>
        Administrator access required
      </p>
      <p style={{ fontSize: 13, maxWidth: 420, margin: '0 auto', lineHeight: 1.6 }}>
        This section controls the server Ahova itself runs on. Ask an administrator if you need it.
        Your own hosts and metrics are available from Hosts and Metrics.
      </p>
    </div>
  </AhovaCard>
)
