import { describe, expect, it } from 'vitest'
import { fileToRoute, isRouteFile } from '../src/scan/routes'

describe('scan/routes', () => {
  it('detects route files', () => {
    expect(isRouteFile('/app/server/api/foo.post.ts')).toBe(true)
    expect(isRouteFile('/app/server/api/util.ts')).toBe(false)
    expect(isRouteFile('/app/server/api/x.get.ts?foo')).toBe(true)
  })

  it('maps api files to /api paths', () => {
    expect(fileToRoute('/app/server/api/auth/forgot-password.post.ts', '/app/server/api'))
      .toMatchObject({ path: '/api/auth/forgot-password', method: 'post' })
    expect(fileToRoute('/app/server/api/index.get.ts', '/app/server/api'))
      .toMatchObject({ path: '/api', method: 'get' })
  })

  it('maps dynamic segments', () => {
    expect(fileToRoute('/app/server/api/users/[id].get.ts', '/app/server/api').path)
      .toBe('/api/users/:id')
    expect(fileToRoute('/app/server/api/[...slug].get.ts', '/app/server/api').path)
      .toBe('/api/:slug*')
  })

  it('maps server/routes without /api prefix', () => {
    expect(fileToRoute('/app/server/routes/hello.get.ts', '/app/server/routes').path)
      .toBe('/hello')
  })

  it('maps deeply nested dynamic segments (roles/[id]/permissions/[permissionId])', () => {
    expect(fileToRoute(
      'D:/Capstone/fu-study/server/api/roles/[id]/permissions/[permissionId].delete.ts',
      'D:/Capstone/fu-study/server/api',
    )).toMatchObject({ path: '/api/roles/:id/permissions/:permissionId', method: 'delete' })
    // Windows separators resolve identically
    expect(fileToRoute(
      'D:\\Capstone\\fu-study\\server\\api\\roles\\[id]\\permissions\\[permissionId].delete.ts',
      'D:\\Capstone\\fu-study\\server\\api',
    )).toMatchObject({ path: '/api/roles/:id/permissions/:permissionId', method: 'delete' })
    expect(isRouteFile('D:/Capstone/fu-study/server/api/roles/[id]/permissions/[permissionId].delete.ts')).toBe(true)
  })
})
