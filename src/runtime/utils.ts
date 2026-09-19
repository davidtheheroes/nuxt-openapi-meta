import type { OpenAPIMetaOverride } from './types'

/**
 * Identity helper for `export const openAPIMeta = defineOpenAPIMeta({...})`.
 * Provides typing only — the module reads the exported object at build time
 * via jiti and merges it over JSDoc annotations.
 */
export function defineOpenAPIMeta(meta: OpenAPIMetaOverride): OpenAPIMetaOverride {
  return meta
}

/** Identity helper kept for symmetry with `defineRouteMeta`-style APIs. */
export function defineRouteResponse<T>(example: T): T {
  return example
}
