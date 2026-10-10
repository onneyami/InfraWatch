export type ThemePreference = 'dark' | 'light' | 'system'

/**
 * Превращает выбор пользователя ('dark'/'light'/'system') в реальную тему
 * для применения ('dark'/'light'), разрешая 'system' через предпочтение ОС.
 */
export function resolveTheme(preference: ThemePreference): 'dark' | 'light' {
  if (preference === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return preference
}

/**
 * Применяет тему к документу — выставляет data-ahova-theme, который
 * подхватывают CSS-переменные в theme/global.css. Все компоненты читают
 * цвета через theme.colors.* (theme/tokens.ts), которые указывают на эти
 * переменные, поэтому один вызов перекрашивает всё приложение целиком.
 */
export function applyTheme(preference: ThemePreference): void {
  const resolved = resolveTheme(preference)
  document.documentElement.setAttribute('data-ahova-theme', resolved)
}

let systemListenerCleanup: (() => void) | null = null

/**
 * Пока выбран режим 'system', приложение должно реагировать на живую смену
 * темы в ОС (например, автоматическое переключение на закате), а не только
 * на явный выбор пользователя. Вызывается один раз при выборе 'system' и
 * снова при выборе любого другого варианта (тогда слушатель снимается).
 */
export function watchSystemTheme(preference: ThemePreference): void {
  systemListenerCleanup?.()
  systemListenerCleanup = null

  if (preference !== 'system') return

  const mql = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => applyTheme('system')
  mql.addEventListener('change', handler)
  systemListenerCleanup = () => mql.removeEventListener('change', handler)
}
