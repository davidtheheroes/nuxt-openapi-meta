import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'pathe'
import { VIRTUAL_META_PREFIX, installAutoImportShims, openapiTransform } from '../src/transform/rollup'

const here = dirname(fileURLToPath(import.meta.url))
const playgroundRoute = join(here, '../playground/server/api/auth/forgot-password.post.ts')
const playgroundApiDir = join(here, '../playground/server/api')

describe('openapiTransform + jiti (real route file)', () => {
  it('extracts zod schema from the playground route', async () => {
    installAutoImportShims()
    const { createJiti } = await import('jiti')
    const jiti = createJiti(import.meta.url, { fsCache: false, moduleCache: false }) as {
      import: (id: string) => Promise<Record<string, unknown>>
    }
    const mod = await jiti.import(playgroundRoute)
    expect(mod.bodySchema).toBeDefined()

    const { loadRouteSchemas } = await import('../src/parse/schema')
    const { schemas } = await loadRouteSchemas(mod)
    expect(schemas.body).toBeDefined()
    expect((schemas.body as { properties: unknown }).properties).toHaveProperty('email')
  })

  it('serves generated meta via the ?meta virtual module', async () => {
    const plugin = openapiTransform({
      routesDir: playgroundApiDir,
      options: { defaultErrors: [] },
    }) as unknown as {
      resolveId: (id: string, importer?: string, opts?: Record<string, unknown>) => Promise<string | null>
      load: (id: string) => Promise<string | null>
    }
    const ctx = { resolve: async (id: string) => ({ id }) }
    const resolved = await plugin.resolveId.call(ctx, `${playgroundRoute}?meta`, undefined, {})
    expect(resolved).toBe(`${VIRTUAL_META_PREFIX}${playgroundRoute}`)

    const code = await plugin.load.call(ctx, resolved as string)
    expect(code).toContain('export default')
    expect(code).toContain('Request password reset')
    expect(code).toContain('requestBody')
    expect(code).toContain('student@fpt.edu.vn')
    expect(code).toContain('x-request-id')
    expect(code).toContain('Password-reset request payload')
    // Valid shape: the full defineRouteMeta argument. Tags are asserted
    // structurally on purpose — the playground file is a live demo that
    // developers edit by hand.
    const payload = JSON.parse(code!.replace(/^export default /, '').replace(/;$/, ''))
    expect(payload.openAPI.tags).toEqual([expect.any(String)])
    expect(payload.openAPI.responses['200']).toBeDefined()
  })
})
