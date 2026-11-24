/**
 * Pages that control or inspect the machine the backend runs on (Docker, processes, container
 * logs, security scans). The API restricts the matching endpoints to administrators; the UI
 * uses this list to hide them and to avoid calling endpoints that would answer 403.
 */
export const ADMIN_PAGES: ReadonlySet<string> = new Set([
  'processes',
  'docker', 'images', 'networks', 'volumes',
  'logs',
  'security', 'vulnerabilities', 'compliance',
])

export const isAdminPage = (page: string): boolean => ADMIN_PAGES.has(page)
