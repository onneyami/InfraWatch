import React, { useEffect, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { theme } from '../../theme/tokens'
import { AhovaButton } from '../ui/AhovaButton'
import { AhovaDrawer } from '../ui/AhovaDrawer'
import { api } from '../../services/api'

interface AddAgentDrawerProps {
  open: boolean
  onClose: () => void
}

const AGENT_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

const boxStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing[2],
  padding: theme.spacing[3],
  background: theme.colors.bg.secondary,
  border: `1px solid ${theme.colors.border.default}`,
  borderRadius: theme.radius.sm,
  fontFamily: 'monospace',
  fontSize: 12,
}

/**
 * Enrolls a new agent: the user names it, gets a one-time key and a ready-to-run command.
 * The key is shown once and forgotten as soon as the drawer closes.
 */
export const AddAgentDrawer: React.FC<AddAgentDrawerProps> = ({ open, onClose }) => {
  const [agentId, setAgentId] = useState('my-server')
  const [key, setKey] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) {
      setKey(null)
      setExpiresAt(null)
      setCopied(false)
    }
  }, [open])

  const idValid = AGENT_ID_PATTERN.test(agentId)
  const backendUrl = window.location.protocol + '//' + window.location.hostname + ':8000'
  const command = key ? `BACKEND_URL=${backendUrl} AGENT_ID=${agentId} AHOVA_ENROLL_KEY=${key} ./agent` : ''

  const generate = async () => {
    setLoading(true)
    try {
      const res = await api.createEnrollmentKey(agentId)
      setKey(res.key)
      setExpiresAt(res.expires_at * 1000)
      setCopied(false)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Could not create an enrollment key')
    } finally {
      setLoading(false)
    }
  }

  const copy = () => {
    navigator.clipboard.writeText(command)
    setCopied(true)
    toast.success('Command copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <AhovaDrawer open={open} onClose={onClose} title="Add Agent">
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[4] }}>
        <p style={{ fontSize: 13, color: theme.colors.text.secondary, lineHeight: 1.6, margin: 0 }}>
          Generate a one-time enrollment key, then run the command on the server you want to monitor
          (build the agent first with <code>ahova build-agent</code>). The key works once and expires in one hour.
        </p>

        <div>
          <label style={{ fontSize: 13, color: theme.colors.text.secondary, display: 'block', marginBottom: theme.spacing[2] }}>
            Agent ID
          </label>
          <input
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            maxLength={64}
            style={{
              height: 40,
              padding: `0 ${theme.spacing[3]}`,
              background: theme.colors.bg.card,
              border: `1px solid ${idValid ? theme.colors.border.default : theme.colors.status.critical}`,
              borderRadius: theme.radius.sm,
              color: theme.colors.text.primary,
              fontSize: 14,
              width: '100%',
            }}
          />
          {!idValid && (
            <p style={{ fontSize: 12, color: theme.colors.status.critical, margin: `${theme.spacing[1]} 0 0` }}>
              Use letters, digits, dots, dashes and underscores (up to 64).
            </p>
          )}
        </div>

        <AhovaButton variant="primary" size="md" disabled={loading || !idValid} onClick={generate}
          style={{ width: '100%', justifyContent: 'center' }}>
          {loading ? 'Generating...' : key ? 'Generate a new key' : 'Generate enrollment key'}
        </AhovaButton>

        {key && (
          <>
            <div style={boxStyle}>
              <code style={{ flex: 1, wordBreak: 'break-all' }}>{command}</code>
              <button
                onClick={copy}
                aria-label="Copy command"
                style={{ flexShrink: 0, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: theme.radius.sm, background: 'transparent', color: theme.colors.text.secondary, cursor: 'pointer' }}
              >
                {copied ? <Check size={14} color={theme.colors.status.healthy} /> : <Copy size={14} />}
              </button>
            </div>
            <p style={{ fontSize: 12, color: theme.colors.text.muted, lineHeight: 1.6, margin: 0 }}>
              Copy it now: the key is shown only once
              {expiresAt ? ` and expires at ${new Date(expiresAt).toLocaleTimeString()}` : ''}. After the agent
              registers it keeps its own token, so the key is not needed again.
            </p>
          </>
        )}
      </div>
    </AhovaDrawer>
  )
}
