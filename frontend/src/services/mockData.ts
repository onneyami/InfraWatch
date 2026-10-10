import { Alert } from '../types/metrics'

/**
 * На бэкенде нет движка алертов (нет таблицы, нет правил, нет /api/v1/alerts).
 * Раньше AlertsPage показывал этот же набор как захардкоженную локальную
 * константу, а Overview тянул из стора, который пытался дернуть
 * несуществующий эндпоинт и оставался пустым — из-за этого два экрана
 * показывали разные вещи. Теперь оба читают один и тот же demo-источник.
 *
 * Это временное решение. Когда на бэкенде появится реальный алертинг —
 * заменить на api.getAlerts() и удалить этот файл.
 */
export const DEMO_ALERTS: Alert[] = [
  { id: '1', type: 'critical', title: 'Memory usage exceeded 90%', message: 'Container docker-api is using 92% of allocated memory', source: 'MacBook', timestamp: Math.floor(Date.now() / 1000) - 120 },
  { id: '2', type: 'warning', title: 'CPU threshold warning', message: 'CPU usage has been above 75% for 5 minutes', source: 'MacBook', timestamp: Math.floor(Date.now() / 1000) - 600 },
  { id: '3', type: 'info', title: 'Container restarted', message: 'Container nginx-proxy was restarted successfully', source: 'docker-api', timestamp: Math.floor(Date.now() / 1000) - 1200 },
  { id: '4', type: 'warning', title: 'Disk space low', message: 'Disk /dev/sda1 has less than 10% free space', source: 'MacBook', timestamp: Math.floor(Date.now() / 1000) - 3600 },
  { id: '5', type: 'critical', title: 'Service unavailable', message: 'The monitoring service was unreachable for 30 seconds', source: 'health-check', timestamp: Math.floor(Date.now() / 1000) - 7200 },
]
