import { defineNuxtModule, createResolver } from '@nuxt/kit'
import { isAbsolute, join } from 'pathe'
import { existsSync } from 'node:fs'
import { openapiTransform } from './transform/rollup'

export interface DefaultError {
  status: number
  description: string
}

export interface AuthOptions {
  /** Scheme name, default `'bearerAuth'`. */
  name?: string
  /**
   * Scheme description shown in Swagger/Scalar.
   * NOTE: Swagger/Scalar render descriptions as HTML — a literal `<token>`
   * is treated as an HTML tag and stripped. Use `{token}` instead.
   */
  description?: string
  /**
   * Toggle who adds the `Bearer ` prefix (optional, default `'bearer'`):
   * - `'bearer'`: `type: http, scheme: bearer` — Swagger/Scalar prepend
   *   `Bearer ` automatically, the user pastes the raw JWT only.
   * - `'apiKey'`: `type: apiKey, in: header, name: Authorization` — no
   *   auto-prefix, the user types the full header value by hand
   *   (e.g. `Bearer {token}`).
   */
  mode?: 'bearer' | 'apiKey'
}

export interface ModuleOptions {
  /**
   * Directory containing routes, default `server/api` (relative to rootDir or absolute).
   * Kept for backward compatibility — prefer `routesDirs`.
   */
  routesDir?: string
  /** Directories containing routes. Default: `server/api` + `server/routes` (whichever exist). */
  routesDirs?: string[]
  /** Enable/disable auto-generate */
  enabled?: boolean
  /** Map path prefix → tag, e.g. `{ '/api/auth': 'Auth' }` */
  tagMap?: Record<string, string>
  /** Default error responses injected into every route */
  defaultErrors?: DefaultError[]
  /** Overwrite files that already contain `defineRouteMeta` */
  overwrite?: boolean
  /** Auto-detect `createError({ statusCode })` calls and add them to `responses` */
  detectCreateError?: boolean
  /**
   * Global `components.securitySchemes` injected via `$global` into every
   * generated route meta. Required for Swagger/Scalar to show the
   * Authorize button, e.g. `{ bearerAuth: { type: 'http', scheme: 'bearer' } }`.
   */
  securitySchemes?: Record<string, unknown>
  /**
   * Default `security` applied to every operation when the route itself
   * doesn't define `@security` / `openAPIMeta.security`.
   * E.g. `['bearerAuth']` → `security: [{ bearerAuth: [] }]`.
   * Set per-route `security: []` (or `@security` empty) to mark a public route.
   */
  security?: string[]
  /**
   * Optional shorthand to auto-add a Bearer scheme + default security, so
   * you don't have to spell out `securitySchemes`/`security` by hand.
   * Omit it (or set `auth: false`) to disable auth entirely.
   * - `auth: true` → `securitySchemes.bearerAuth = { type: 'http', scheme: 'bearer', description }`
   *   and `security = ['bearerAuth']`.
   * - `auth: { name, description, mode }` to customize.
   *   `mode: 'apiKey'` turns OFF the UIs' automatic `Bearer ` prefix so the
   *   user types the full header value manually.
   * Explicit `security` / `securitySchemes` always win over this shorthand.
   */
  auth?: boolean | AuthOptions
  /**
   * Source code of the current file (set by transform).
   * @internal
   */
  __code?: string
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-openapi-meta',
    configKey: 'openapiMeta',
    compatibility: {
      nuxt: '>=3.0.0',
    },
  },
  defaults: {
    // Note: no `routesDir` default here on purpose — leaving it unset lets
    // setup fall through to scanning both `server/api` and `server/routes`.
    enabled: true,
    tagMap: {},
    defaultErrors: [
      { status: 400, description: 'Bad request' },
      { status: 401, description: 'Unauthorized' },
      { status: 429, description: 'Rate limit exceeded' },
      { status: 500, description: 'Internal server error' },
    ],
    overwrite: false,
    detectCreateError: true,
  },
  setup(options, nuxt) {
    if (!options.enabled)
      return

    const { resolve } = createResolver(import.meta.url)
    void resolve

    const toAbs = (d: string) => (isAbsolute(d) ? d : join(nuxt.options.rootDir, d))
    // Explicit config wins as-is; the default covers both Nuxt server dirs
    // (`server/api` → `/api/*`, `server/routes` → `/*`), skipping missing ones.
    let routesDirs: string[]
    if (options.routesDirs?.length)
      routesDirs = options.routesDirs.map(toAbs)
    else if (options.routesDir)
      routesDirs = [toAbs(options.routesDir)]
    else
      routesDirs = ['server/api', 'server/routes'].map(d => join(nuxt.options.rootDir, d)).filter(d => existsSync(d))

    // Nitro reads route meta (`defineRouteMeta`) from `*?meta` virtual
    // modules that it loads straight from disk. Our rollup plugin (user
    // plugins run first) intercepts `?meta` for managed routes and serves
    // generated metadata, so handler files are never modified.
    //
    // Aliases let jiti resolve shared DTO imports (`~/server/dto`, `@/...`)
    // the same way Nuxt does.
    const aliases: Record<string, string> = {
      '~': nuxt.options.srcDir,
      '@': nuxt.options.srcDir,
      '~~': nuxt.options.rootDir,
      '@@': nuxt.options.rootDir,
    }
    nuxt.hook('nitro:config', (nitroConfig) => {
      nitroConfig.rollupConfig ??= {}
      const rc = nitroConfig.rollupConfig as { plugins?: unknown[] }
      rc.plugins ??= []
      rc.plugins.push(openapiTransform({ routesDirs, options, aliases }))
    })
  },
})
