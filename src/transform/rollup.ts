import { readFile } from 'node:fs/promises'
import type { ModuleOptions } from '../module'
import { parseJSDoc } from '../parse/jsdoc'
import { detectSchemaRefs, loadRouteSchemas } from '../parse/schema'
import { buildOpenAPI } from '../generate/meta'
import { isRouteFile } from '../scan/routes'

export interface TransformOpts {
  /** Single base dir (backward compat — prefer `routesDirs`). */
  routesDir?: string
  /** Base dirs to manage (e.g. `server/api` + `server/routes`). */
  routesDirs?: string[]
  options: ModuleOptions
  /** resolved at setup time; injected for tests */
  rootDir?: string
  /** Import aliases for jiti (e.g. `{ '~': srcDir, '@': srcDir }`) so shared DTOs resolve. */
  aliases?: Record<string, string>
}

interface JitiInstance {
  import: (id: string) => Promise<unknown>
}

/** Prefix for our virtual `?meta` modules. Must differ from Nitro's `\0nitro-handler-meta:`. */
export const VIRTUAL_META_PREFIX = '\0nuxt-openapi-meta:'

const DEFINE_ROUTE_META_RE = /defineRouteMeta\s*\(/
const META_SUFFIX = '?meta'

function normalizeId(id: string): string {
  return (id.split('?')[0] ?? id).replace(/\\/g, '/')
}

/**
 * Route files rely on Nitro/h3 auto-imports (`defineEventHandler`, …)
 * which do not exist in the module's Node process. Stub them so
 * `jiti.import(id)` can execute the file purely to read its exported
 * schemas. Shims are identity/no-op and idempotent.
 */
function installAutoImportShims(): void {
  const g = globalThis as Record<string, unknown>
  if (!g.defineEventHandler)
    g.defineEventHandler = (handler: unknown) => handler
  if (!g.defineRouteMeta)
    g.defineRouteMeta = () => {}
  if (!g.defineNitroPlugin)
    g.defineNitroPlugin = (plugin: unknown) => plugin
  if (!g.readValidatedBody)
    g.readValidatedBody = async () => ({})
  if (!g.getValidatedQuery)
    g.getValidatedQuery = async () => ({})
  if (!g.getValidatedRouterParams)
    g.getValidatedRouterParams = async () => ({})
  if (!g.getRouterParam)
    g.getRouterParam = () => undefined
  if (!g.createError)
    g.createError = (input: unknown) => input
}

export { installAutoImportShims }

/**
 * Nitro rollup plugin (must run before Nitro's own `nitro:handlers-meta` —
 * guaranteed because user `rollupConfig.plugins` are prepended).
 *
 * How Nitro feeds `/_openapi.json`: the virtual module
 * `#nitro-internal-virtual/server-handlers-meta` does
 * `import XMeta from "<handler>?meta"` and Nitro's own plugin resolves
 * `?meta` by `readFile`-ing the handler **from disk** and AST-parsing the
 * first `defineRouteMeta(...)` call. A normal `transform()` injection into
 * the handler module therefore never reaches the meta pipeline (and a bare
 * `defineRouteMeta()` call in the handler would additionally be tree-shaken
 * or crash at runtime).
 *
 * So instead this plugin intercepts `<handler>?meta` first and serves a
 * virtual module `export default <generated meta>` built from JSDoc
 * annotations + Zod/Valibot schemas. Handler source files are never touched.
 *
 * Files that already contain `defineRouteMeta` (and `overwrite: false`)
 * are left alone so Nitro extracts the author's own metadata.
 */
export function openapiTransform({ routesDir, routesDirs, options, aliases }: TransformOpts) {
  // Longest first so the most specific base wins on overlap.
  const bases = [...(routesDirs ?? []), ...(routesDir ? [routesDir] : [])]
    .map(b => b.replace(/\\/g, '/').replace(/\/$/, ''))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
  const matchBase = (cleanId: string): string | undefined =>
    bases.find(b => cleanId.startsWith(b))
  let jiti: JitiInstance | undefined
  let jitiFailed = false
  const metaCache = new Map<string, { hash: string, code: string }>()

  async function getJiti(): Promise<JitiInstance | undefined> {
    if (jiti || jitiFailed)
      return jiti
    try {
      const { createJiti } = await import('jiti')
      jiti = (createJiti as (base: string, opts?: Record<string, unknown>) => JitiInstance)(
        import.meta.url,
        { fsCache: false, moduleCache: false, ...(aliases ? { alias: aliases } : {}) },
      )
      return jiti
    }
    catch {
      jitiFailed = true
      return undefined
    }
  }

  function hashCode(s: string): string {
    let h = 5381
    for (let i = 0; i < s.length; i++)
      h = ((h << 5) + h + s.charCodeAt(i)) | 0
    return String(h)
  }

  function isManaged(absPath: string): boolean {
    const clean = normalizeId(absPath)
    return matchBase(clean) !== undefined && isRouteFile(clean)
  }

  async function readSource(absPath: string): Promise<string | undefined> {
    try {
      return await readFile(absPath.split('?')[0] ?? absPath, 'utf8')
    }
    catch {
      return undefined
    }
  }

  /**
   * Build the virtual `?meta` module code for a handler.
   * Returns `null` when Nitro's own plugin should handle it
   * (unreadable file, or author-defined `defineRouteMeta` without overwrite).
   */
  async function buildMetaModule(absPath: string): Promise<string | null> {
    const cleanId = normalizeId(absPath)
    const base = matchBase(cleanId)
    const raw = await readSource(absPath)
    if (base === undefined || raw === undefined)
      return null

    const hasMeta = DEFINE_ROUTE_META_RE.test(raw)
    if (hasMeta && !options.overwrite)
      return null

    const cached = metaCache.get(cleanId)
    if (cached && cached.hash === hashCode(raw))
      return cached.code

    // 1. JSDoc (sync, cheap)
    const jsdoc = parseJSDoc(raw)

    // 2. Schemas via jiti (async). Never fail the build.
    let schemas: Record<string, unknown> = {}
    let openAPIMeta: Record<string, unknown> | undefined
    try {
      const importer = await getJiti()
      if (importer) {
        installAutoImportShims()
        const mod = (await importer.import(cleanId)) as Record<string, unknown>
        const loaded = await loadRouteSchemas(mod ?? {})
        schemas = loaded.schemas as Record<string, unknown>
        openAPIMeta = loaded.openAPIMeta
      }
    }
    catch {
      // jiti import can fail for files with runtime-only side effects;
      // fall back to JSDoc-only metadata.
    }

    // Dev hint: referenced validator has no matching export
    if (process.env.DEBUG === 'nuxt-openapi-meta') {
      const refs = detectSchemaRefs(raw)
      for (const [kind, refName] of Object.entries(refs)) {
        if (refName && !(schemas as Record<string, unknown>)[kind])
          console.warn(`[nuxt-openapi-meta] ${cleanId}: referenced "${refName}" but no exported schema found for "${kind}". Export e.g. \`export const ${kind}Schema = ...\``)
      }
    }

    // 3. Build payload (pass source for createError auto-detect).
    // Shape = the full `defineRouteMeta(...)` argument, matching what
    // Nitro's own `?meta` loader would produce.
    const payload = buildOpenAPI({
      id: cleanId,
      routesDir: base,
      jsdoc,
      openAPIMeta,
      schemas: schemas as never,
      options: { ...options, __code: raw } as ModuleOptions,
    })

    const code = `export default ${JSON.stringify(payload)};`
    metaCache.set(cleanId, { hash: hashCode(raw), code })
    // Keep cache small in long dev sessions
    if (metaCache.size > 200) {
      const first = metaCache.keys().next().value as string | undefined
      if (first)
        metaCache.delete(first)
    }
    return code
  }

  return {
    name: 'nuxt-openapi-meta',
    enforce: 'pre' as const,

    buildStart() {
      metaCache.clear()
    },

    async resolveId(
      this: { resolve: (id: string, importer?: string, opts?: Record<string, unknown>) => Promise<{ id: string } | null> },
      id: string,
      importer?: string,
      resolveOpts?: Record<string, unknown>,
    ) {
      if (id.startsWith('\0'))
        return null
      if (!id.endsWith(META_SUFFIX))
        return null
      const realId = id.slice(0, -META_SUFFIX.length)
      const resolved = await this.resolve(realId, importer, { ...resolveOpts, skipSelf: true })
      const absPath = resolved?.id ?? realId
      if (!isManaged(absPath))
        return null
      // Author-defined meta wins (unless overwrite): let Nitro extract it.
      const raw = await readSource(absPath)
      if (raw === undefined)
        return null
      if (DEFINE_ROUTE_META_RE.test(raw) && !options.overwrite)
        return null
      return VIRTUAL_META_PREFIX + absPath
    },

    async load(this: unknown, id: string) {
      void this
      if (!id.startsWith(VIRTUAL_META_PREFIX))
        return null
      const absPath = id.slice(VIRTUAL_META_PREFIX.length)
      const code = await buildMetaModule(absPath)
      // File changed between resolveId and load (or unreadable):
      // mirror Nitro's "no meta found" semantics instead of failing the build.
      return code ?? 'export default null;'
    },
  }
}
