import { basename } from 'pathe'

export const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'all'] as const
export type HttpMethod = (typeof HTTP_METHODS)[number]

const ROUTE_FILE_RE = /\.(get|post|put|patch|delete|all)\.(ts|js|mts|mjs|cts|cjs)$/

export function isRouteFile(id: string): boolean {
  const clean = id.split('?')[0] ?? id
  return ROUTE_FILE_RE.test(clean)
}

export function getRouteMethod(id: string): string {
  const clean = id.split('?')[0] ?? id
  const m = clean.match(ROUTE_FILE_RE)
  return m?.[1] ?? 'get'
}

export interface NuxtRouteInfo {
  /** e.g. `/api/auth/forgot-password` */
  path: string
  /** e.g. `post` */
  method: string
  /** file basename without method suffix */
  name: string
}

/**
 * Convert an absolute route file id to a Nitro/Nuxt route path.
 *
 * Handles:
 * - `server/api/foo.post.ts` -> `/api/foo`
 * - `server/api/index.get.ts` -> `/api`
 * - `server/routes/x.get.ts` -> `/x` (when routesDir points at server/routes)
 * - `[id].get.ts` -> `/:id`, `[...slug].get.ts` -> `/:slug*`
 */
export function fileToRoute(id: string, routesDir: string): NuxtRouteInfo {
  const cleanId = (id.split('?')[0] ?? id).replace(/\\/g, '/')
  const normBase = routesDir.replace(/\\/g, '/').replace(/\/$/, '')

  let rel = cleanId.startsWith(normBase)
    ? cleanId.slice(normBase.length).replace(/^\//, '')
    : basename(cleanId)

  const method = getRouteMethod(cleanId)

  // Strip `.<method>.<ext>`
  rel = rel.replace(ROUTE_FILE_RE, '')

  // `server/api` prefix maps to `/api`, `server/routes` maps to `/`
  const isApiDir = /(?:^|\/)api$/.test(normBase)
  let path = isApiDir ? `/api/${rel}` : `/${rel}`

  // index -> parent
  path = path.replace(/\/index$/, '') || '/'
  if (path !== '/' && path.endsWith('/'))
    path = path.slice(0, -1)

  // Nuxt file-system params -> Nitro/Express params
  path = path
    .replace(/\[\.\.\.(\w+)\]/g, ':$1*')
    .replace(/\[(\w+)\]/g, ':$1')

  // Collapse duplicate slashes
  path = path.replace(/\/{2,}/g, '/')

  const name = path === '/' ? 'index' : path.split('/').pop() || 'index'

  return { path, method, name }
}

export function humanize(input: string): string {
  const out = input
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
  return out || 'Route'
}
