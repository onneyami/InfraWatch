import React, { useState, useEffect } from 'react'
import { Settings, Bell, Palette, Key, Server, Plus, Copy, Check, MapPin, Volume2, Monitor } from 'lucide-react'
import toast from 'react-hot-toast'
import { theme } from '../../theme/tokens'
import { AhovaCard } from '../../components/ui/AhovaCard'
import { AhovaBadge } from '../../components/ui/AhovaBadge'
import { AhovaButton } from '../../components/ui/AhovaButton'
import { AhovaDrawer } from '../../components/ui/AhovaDrawer'
import { useAppStore } from '../../store/appStore'

const sections = [
  { id: 'general', label: 'General', icon: <Settings size={16} /> },
  { id: 'agents', label: 'Agents', icon: <Server size={16} /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={16} /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette size={16} /> },
  { id: 'api', label: 'API', icon: <Key size={16} /> },
]

const COMMON_TIMEZONES = [
  'UTC', 'Europe/Warsaw', 'Europe/London', 'Europe/Moscow', 'Europe/Berlin',
  'America/New_York', 'America/Los_Angeles', 'America/Chicago',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo',
  'Australia/Sydney',
]

const inputStyle: React.CSSProperties = {
  height: 40,
  padding: `0 ${theme.spacing[3]}`,
  background: theme.colors.bg.card,
  border: `1px solid ${theme.colors.border.default}`,
  borderRadius: theme.radius.sm,
  color: theme.colors.text.primary,
  fontSize: 14,
  width: '100%',
}

export const SettingsPage: React.FC = () => {
  const [activeSection, setActiveSection] = useState('general')
  const { agents, theme: currentTheme, setTheme, notificationSettings, setNotificationSettings, addAlert } = useAppStore()
  const [desktopPermission, setDesktopPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied'
  )

  const handleEnableDesktop = async () => {
    if (!('Notification' in window)) {
      toast.error('This browser does not support desktop notifications')
      return
    }
    const permission = await Notification.requestPermission()
    setDesktopPermission(permission)
    if (permission === 'granted') {
      setNotificationSettings({ desktopEnabled: true })
      toast.success('Desktop notifications enabled')
    } else {
      toast.error('Permission denied — enable notifications for this site in your browser settings')
    }
  }

  const handleTestNotification = () => {
    addAlert({ type: 'critical', title: 'Test notification', message: 'This is what a critical alert looks like.', source: 'Settings' })
    toast.success('Test alert sent')
  }

  // General settings — раньше это были статичные <div>, ничего никуда не
  // сохранялось. Персистим в localStorage (реального backend для настроек
  // организации пока нет).
  const [orgName, setOrgName] = useState(() => localStorage.getItem('ahova_org_name') || 'Ahova Inc.')
  const [timezone, setTimezoneState] = useState(() => localStorage.getItem('ahova_timezone') || 'UTC')

  useEffect(() => { localStorage.setItem('ahova_org_name', orgName) }, [orgName])
  useEffect(() => { localStorage.setItem('ahova_timezone', timezone) }, [timezone])

  const detectTimezone = () => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
    setTimezoneState(detected)
    toast.success(`Timezone set to ${detected}`)
  }

  // Add Agent drawer (тот же паттерн, что и на странице Hosts)
  const [showAddAgent, setShowAddAgent] = useState(false)
  const [copied, setCopied] = useState(false)
  const backendUrl = window.location.protocol + '//' + window.location.hostname + ':8000'
  const installCommand = `BACKEND_URL=${backendUrl} AGENT_ID=my-server ./agent`
  const handleCopyCommand = () => {
    navigator.clipboard.writeText(installCommand)
    setCopied(true)
    toast.success('Command copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  // API token — показываем реальный dashboard-токен, которым уже
  // авторизуется сам этот фронтенд (см. services/api.ts), а не выдуманный.
  const dashboardToken = (import.meta as any).env?.VITE_DASHBOARD_TOKEN || 'dev-dashboard-token-change-me'
  const [showToken, setShowToken] = useState(false)
  const [tokenCopied, setTokenCopied] = useState(false)
  const maskedToken = dashboardToken.slice(0, 4) + '••••••••••••••••••••' + dashboardToken.slice(-4)

  const handleCopyToken = () => {
    navigator.clipboard.writeText(dashboardToken)
    setTokenCopied(true)
    toast.success('Token copied to clipboard')
    setTimeout(() => setTokenCopied(false), 2000)
  }

  const handleRegenerateKey = () => {
    // Честно: сейчас это статичный DASHBOARD_API_TOKEN из переменной
    // окружения бэкенда — регенерация "по кнопке" потребовала бы отдельного
    // backend-эндпоинта и раздачи нового токена всем клиентам. Такого
    // эндпоинта пока нет — не притворяемся, что кнопка что-то делает.
    toast('Regenerating from the UI isn\'t supported yet — change DASHBOARD_API_TOKEN in the backend .env and restart.', { icon: 'ℹ️', duration: 5000 })
  }

  return (
    <div className="animate-fadeIn" style={{ display: 'flex', gap: theme.spacing[6] }}>
      <div style={{ width: 200, flexShrink: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[1] }}>
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing[2],
                padding: `${theme.spacing[2]} ${theme.spacing[3]}`,
                background: activeSection === section.id ? 'rgba(139,92,246,0.15)' : 'transparent',
                border: 'none',
                borderRadius: theme.radius.sm,
                color: activeSection === section.id ? theme.colors.text.primary : theme.colors.text.secondary,
                fontSize: 13,
                fontWeight: activeSection === section.id ? 500 : 400,
                cursor: 'pointer',
                transition: theme.transition.fast,
                textAlign: 'left',
                width: '100%',
              }}
            >
              {section.icon}
              {section.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1 }}>
        {activeSection === 'general' && (
          <AhovaCard title="General Settings">
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[6] }}>
              <div>
                <div style={{ fontSize: 13, color: theme.colors.text.secondary, marginBottom: theme.spacing[2] }}>Organization Name</div>
                <input
                  style={inputStyle}
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Organization name"
                />
              </div>
              <div>
                <div style={{ fontSize: 13, color: theme.colors.text.secondary, marginBottom: theme.spacing[2] }}>Timezone</div>
                <div style={{ display: 'flex', gap: theme.spacing[2] }}>
                  <select
                    style={{ ...inputStyle, cursor: 'pointer' }}
                    value={timezone}
                    onChange={(e) => setTimezoneState(e.target.value)}
                  >
                    {!COMMON_TIMEZONES.includes(timezone) && <option value={timezone}>{timezone}</option>}
                    {COMMON_TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                  <AhovaButton variant="secondary" size="md" icon={<MapPin size={14} />} onClick={detectTimezone}>
                    Detect
                  </AhovaButton>
                </div>
              </div>
            </div>
          </AhovaCard>
        )}

        {activeSection === 'agents' && (
          <AhovaCard title="Connected Agents">
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[4] }}>
              {Object.entries(agents).length === 0 ? (
                <p style={{ fontSize: 13, color: theme.colors.text.muted }}>No agents connected yet.</p>
              ) : (
                Object.entries(agents).map(([id, agent]) => (
                  <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: theme.spacing[3], background: 'rgba(34,197,94,0.05)', borderRadius: theme.radius.sm, border: '1px solid rgba(34,197,94,0.15)' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{agent.system?.hostname || id}</div>
                      <div style={{ fontSize: 11, color: theme.colors.text.muted }}>
                        Last heartbeat: {Math.floor(Date.now() / 1000 - agent.timestamp)}s ago
                      </div>
                    </div>
                    <AhovaBadge variant="healthy">Connected</AhovaBadge>
                  </div>
                ))
              )}
              <AhovaButton variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowAddAgent(true)}>
                Add Agent
              </AhovaButton>
            </div>
          </AhovaCard>
        )}

        {activeSection === 'notifications' && (
          <AhovaCard title="Notification Settings">
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[6] }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing[2] }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[2] }}>
                    <Monitor size={16} style={{ color: theme.colors.text.secondary }} />
                    <span style={{ fontSize: 14, fontWeight: 500 }}>Desktop notifications</span>
                  </div>
                  {desktopPermission === 'granted' ? (
                    <AhovaBadge variant="healthy" size="sm">Enabled</AhovaBadge>
                  ) : (
                    <AhovaButton variant="secondary" size="sm" onClick={handleEnableDesktop}>Enable</AhovaButton>
                  )}
                </div>
                <p style={{ fontSize: 12, color: theme.colors.text.muted }}>
                  Показывает системное уведомление поверх окон, когда приходит алерт. Работает, только пока вкладка с Ahova открыта в браузере.
                </p>
                {desktopPermission === 'denied' && (
                  <p style={{ fontSize: 12, color: theme.colors.status.warning, marginTop: theme.spacing[2] }}>
                    Уведомления заблокированы в браузере для этого сайта — разреши их в настройках сайта, чтобы включить здесь.
                  </p>
                )}
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[2], marginBottom: theme.spacing[2] }}>
                  <Volume2 size={16} style={{ color: theme.colors.text.secondary }} />
                  <span style={{ fontSize: 14, fontWeight: 500 }}>Sound</span>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[2], fontSize: 13, color: theme.colors.text.secondary, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={notificationSettings.soundEnabled}
                    onChange={(e) => setNotificationSettings({ soundEnabled: e.target.checked })}
                  />
                  Play a sound for matching alerts
                </label>
              </div>

              <div>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: theme.spacing[2] }}>Notify me for</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[2] }}>
                  {(['critical', 'warning', 'info'] as const).map((sev) => (
                    <label key={sev} style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[2], fontSize: 13, color: theme.colors.text.secondary, cursor: 'pointer', textTransform: 'capitalize' }}>
                      <input
                        type="checkbox"
                        checked={notificationSettings.severities[sev]}
                        onChange={(e) => setNotificationSettings({ severities: { ...notificationSettings.severities, [sev]: e.target.checked } })}
                      />
                      {sev}
                    </label>
                  ))}
                </div>
              </div>

              <AhovaButton variant="secondary" size="sm" onClick={handleTestNotification}>Send test alert</AhovaButton>
            </div>
          </AhovaCard>
        )}

        {activeSection === 'appearance' && (
          <AhovaCard title="Appearance">
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[4] }}>
              <div>
                <div style={{ fontSize: 13, color: theme.colors.text.secondary, marginBottom: theme.spacing[3] }}>Theme</div>
                <div style={{ display: 'flex', gap: theme.spacing[3] }}>
                  {(['dark', 'light', 'system'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      style={{
                        padding: `${theme.spacing[2]} ${theme.spacing[4]}`,
                        background: currentTheme === t ? 'rgba(139,92,246,0.15)' : 'transparent',
                        border: `1px solid ${currentTheme === t ? theme.colors.brand.purple + '40' : theme.colors.border.default}`,
                        borderRadius: theme.radius.sm,
                        color: currentTheme === t ? theme.colors.text.primary : theme.colors.text.muted,
                        fontSize: 13,
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </AhovaCard>
        )}

        {activeSection === 'api' && (
          <AhovaCard title="API Access">
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[4] }}>
              <div>
                <div style={{ fontSize: 13, color: theme.colors.text.secondary, marginBottom: theme.spacing[2] }}>Dashboard Token</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[2] }}>
                  <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', fontFamily: 'monospace', flex: 1 }}>
                    {showToken ? dashboardToken : maskedToken}
                  </div>
                  <button onClick={() => setShowToken(s => !s)} style={{ height: 40, padding: `0 ${theme.spacing[3]}`, background: 'transparent', border: `1px solid ${theme.colors.border.default}`, borderRadius: theme.radius.sm, color: theme.colors.text.secondary, cursor: 'pointer', fontSize: 12 }}>
                    {showToken ? 'Hide' : 'Show'}
                  </button>
                  <button onClick={handleCopyToken} style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: `1px solid ${theme.colors.border.default}`, borderRadius: theme.radius.sm, color: theme.colors.text.secondary, cursor: 'pointer' }}>
                    {tokenCopied ? <Check size={14} color={theme.colors.status.healthy} /> : <Copy size={14} />}
                  </button>
                </div>
                <p style={{ fontSize: 12, color: theme.colors.text.muted, marginTop: theme.spacing[2] }}>
                  Это тот же токен, которым сам дашборд авторизуется в API (VITE_DASHBOARD_TOKEN). Полноценные
                  персональные API-ключи с независимой ротацией — задача для будущей многопользовательской модели.
                </p>
              </div>
              <AhovaButton variant="secondary" size="sm" onClick={handleRegenerateKey}>Regenerate Key</AhovaButton>
            </div>
          </AhovaCard>
        )}
      </div>

      <AhovaDrawer open={showAddAgent} onClose={() => setShowAddAgent(false)} title="Add Agent">
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[4] }}>
          <p style={{ fontSize: 13, color: theme.colors.text.secondary, lineHeight: 1.6 }}>
            Скопируйте команду на сервере, который хотите мониторить, и запустите
            скомпилированный бинарник агента (<code>make build-agent</code> в корне проекта).
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[2], padding: theme.spacing[3], background: theme.colors.bg.secondary, border: `1px solid ${theme.colors.border.default}`, borderRadius: theme.radius.sm, fontFamily: 'monospace', fontSize: 12 }}>
            <code style={{ flex: 1, wordBreak: 'break-all' }}>{installCommand}</code>
            <button onClick={handleCopyCommand} style={{ flexShrink: 0, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: theme.radius.sm, background: 'transparent', color: theme.colors.text.secondary, cursor: 'pointer' }}>
              {copied ? <Check size={14} color={theme.colors.status.healthy} /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      </AhovaDrawer>
    </div>
  )
}
