import { describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { VIRTUAL_META_PREFIX, openapiTransform } from '../src/transform/rollup'

function makePlugin(routesDir: string, options: Record<string, unknown> = {}) {
  const plugin = openapiTransform({ routesDir, options: { defaultErrors: [], ...options } }) as unknown as {
    resolveId: (id: string, importer?: string, opts?: Record<string, unknown>) => Promise<string | null>
    load: (id: string) => Promise<string | null>
  }
  const ctx = {
    resolve: async (id: string) => ({ id }),
  }
  return {
    resolveId: (id: string) => plugin.resolveId.call(ctx, id, undefined, {}),
    load: (id: string) => plugin.load.call(ctx, id),
  }
}

describe('openapiTransform ?meta interception', () => {
  it('ignores non-?meta ids', async () => {
    const p = makePlugin('/app/server/api')
    expect(await p.resolveId('/app/server/api/hello.get.ts')).toBeNull()
    expect(await p.load('/app/server/api/hello.get.ts')).toBeNull()
  })

  it('ignores ?meta outside routesDir and non-route files', async () => {
    const p = makePlugin('/app/server/api')
    expect(await p.resolveId('/other/x.get.ts?meta')).toBeNull()
    expect(await p.resolveId('/app/server/api/util.ts?meta')).toBeNull()
  })

  it('ignores ?meta for missing files', async () => {
    const p = makePlugin('/app/server/api')
    expect(await p.resolveId('/app/server/api/missing.get.ts?meta')).toBeNull()
  })

  it('claims ?meta for managed routes without own meta', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'oam-'))
    await writeFile(join(dir, 'hello.get.ts'), '/**\n * @summary Hello\n */\nexport default 1')
    const p = makePlugin(dir)
    const resolved = await p.resolveId(`${join(dir, 'hello.get.ts')}?meta`)
    expect(resolved).toBe(`${VIRTUAL_META_PREFIX}${join(dir, 'hello.get.ts')}`)
    const code = await p.load(resolved as string)
    expect(code).toContain('export default')
    expect(code).toContain('"summary":"Hello"')
  })

  it('falls through to Nitro when file already has defineRouteMeta', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'oam-'))
    await writeFile(join(dir, 'x.get.ts'), 'defineRouteMeta({ openAPI: { summary: "mine" } })\nexport default 1')
    const p = makePlugin(dir)
    expect(await p.resolveId(`${join(dir, 'x.get.ts')}?meta`)).toBeNull()
  })

  it('claims even with existing meta when overwrite: true', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'oam-'))
    await writeFile(join(dir, 'x.get.ts'), '/**\n * @summary Fresh\n */\ndefineRouteMeta({ openAPI: {} })\nexport default 1')
    const p = makePlugin(dir, { overwrite: true })
    const resolved = await p.resolveId(`${join(dir, 'x.get.ts')}?meta`)
    expect(resolved).not.toBeNull()
    const code = await p.load(resolved as string)
    expect(code).toContain('"summary":"Fresh"')
  })

  it('serves ?meta from any of multiple base dirs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'oam-'))
    const apiDir = join(dir, 'api')
    const routesDir = join(dir, 'routes')
    await mkdir(apiDir, { recursive: true })
    await mkdir(routesDir, { recursive: true })
    await writeFile(join(apiDir, 'a.get.ts'), '/**\n * @summary A\n */\nexport default 1')
    await writeFile(join(routesDir, 'b.get.ts'), '/**\n * @summary B\n */\nexport default 1')
    const plugin = openapiTransform({ routesDirs: [apiDir, routesDir], options: { defaultErrors: [] } }) as unknown as {
      resolveId: (id: string, importer?: string, opts?: Record<string, unknown>) => Promise<string | null>
      load: (id: string) => Promise<string | null>
    }
    const ctx = { resolve: async (id: string) => ({ id }) }
    const ra = await plugin.resolveId.call(ctx, `${join(apiDir, 'a.get.ts')}?meta`, undefined, {})
    const rb = await plugin.resolveId.call(ctx, `${join(routesDir, 'b.get.ts')}?meta`, undefined, {})
    expect(ra).toBe(`${VIRTUAL_META_PREFIX}${join(apiDir, 'a.get.ts')}`)
    expect(rb).toBe(`${VIRTUAL_META_PREFIX}${join(routesDir, 'b.get.ts')}`)
    const codeB = await plugin.load.call(ctx, rb as string)
    expect(codeB).toContain('"summary":"B"')
    expect(codeB).toContain('"tags":["Default"]')
  })

  it('handles nested dynamic dirs (roles/[id]/permissions/[permissionId].delete.ts)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'oam-'))
    const nested = join(dir, 'roles', '[id]', 'permissions')
    await mkdir(nested, { recursive: true })
    const file = join(nested, '[permissionId].delete.ts')
    await writeFile(file, [
      '/**',
      ' * @summary Remove permission from role',
      ' * @response 204 No content',
      ' */',
      'export const paramsSchema = { _: 1 }',
      'export default defineEventHandler(async (event) => {',
      '  const id = getRouterParam(event, "id")',
      '  const permissionId = getRouterParam(event, "permissionId")',
      '  void id; void permissionId',
      '  return { ok: true }',
      '})',
      '',
    ].join('\n'))
    const p = makePlugin(dir)
    const resolved = await p.resolveId(`${file}?meta`)
    expect(resolved).toBe(`${VIRTUAL_META_PREFIX}${file}`)
    const code = await p.load(resolved as string)
    expect(code).toContain('"summary":"Remove permission from role"')
    const payload = JSON.parse((code as string).replace(/^export default /, '').replace(/;$/, ''))
    expect(payload.openAPI.tags).toEqual(['Default'])
    const params = payload.openAPI.parameters as Array<{ name: string, in: string, required: boolean }>
    expect(params).toContainEqual(expect.objectContaining({ name: 'id', in: 'path', required: true }))
    expect(params).toContainEqual(expect.objectContaining({ name: 'permissionId', in: 'path', required: true }))
    expect(payload.openAPI.responses['204'].description).toBe('No content')
  })
})
