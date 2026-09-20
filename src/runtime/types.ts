/**
 * Public runtime types for `nuxt-openapi-meta`.
 * Re-exported from the built package as `nuxt-openapi-meta/dist/runtime/types`.
 */

export interface OpenAPIMetaOverride {
  tag?: string
  tags?: string[]
  summary?: string
  description?: string
  /** Description for the request body (`requestBody.description`). */
  bodyDescription?: string
  operationId?: string
  deprecated?: boolean
  security?: string[]
  /**
   * Shorthand for per-route `components.securitySchemes`.
   * Merged into `$global.components.securitySchemes` (over global config).
   */
  securitySchemes?: Record<string, unknown>
  /**
   * Raw global fragment hoisted by Nitro to the top-level OpenAPI doc,
   * e.g. `{ components: { securitySchemes: { bearerAuth: {...} } } }`.
   * Deep-merged under the module's global `securitySchemes` option.
   */
  $global?: Record<string, unknown>
  example?: unknown
  responses?: Record<number | string, unknown>
  parameters?: Array<Record<string, unknown>>
  /** Examples keyed by parameter name (`@paramExample` equivalent). */
  paramExamples?: Record<string, unknown>
  requestBody?: Record<string, unknown>
}

/**
 * Names the module reads from a route module (all optional).
 * Schemas accept any Zod/Valibot shape — object, array, primitive, union.
 */
export interface RouteModuleConventions {
  bodySchema?: unknown
  querySchema?: unknown
  paramsSchema?: unknown
  responseSchema?: unknown
  /** Plain JSON-able request-body example (object, array, primitive). */
  bodyExample?: unknown
  /** Plain JSON-able 200-response example. */
  responseExample?: unknown
  /** Per-status error DTOs: `{ 404: NotFoundDto, … }` (schema or plain example object). */
  errorResponses?: Record<number | string, unknown>
  openAPIMeta?: OpenAPIMetaOverride
}

/**
 * Convention-based override evaluated at build time.
 *
 * @example
 * ```ts
 * export const openAPIMeta = defineOpenAPIMeta({ tags: ['Auth'] })
 * ```
 */
export type DefineOpenAPIMeta = (meta: OpenAPIMetaOverride) => OpenAPIMetaOverride
