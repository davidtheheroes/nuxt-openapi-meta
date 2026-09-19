import { describe, expect, it } from 'vitest'
import { buildOpenAPI } from '../src/generate/meta'

const baseOptions = {
  tagMap: { '/api/auth': 'Auth' },
  defaultErrors: [
    { status: 400, description: 'Bad request' },
    { status: 500, description: 'Internal server error' },
  ],
}

describe('buildOpenAPI', () => {
  it('builds body + generic params + defaults', () => {
    const { openAPI } = buildOpenAPI({
      id: '/app/server/api/auth/forgot-password.post.ts',
      routesDir: '/app/server/api',
      jsdoc: {
        tag: 'Auth',
        summary: 'Request password reset',
        description: 'Send email.',
        bodyDescription: 'Reset payload.',
        params: [
          { name: 'x-request-id', in: 'header', required: false, schema: { type: 'string' }, description: 'Idempotency key' },
        ],
        example: { email: 'a@b.c' },
        responses: { 200: { ok: true } },
      },
      schemas: {
        body: { type: 'object', properties: { email: { type: 'string', format: 'email' } }, required: ['email'] },
      },
      options: baseOptions,
    })
    expect(openAPI.tags).toEqual(['Auth'])
    expect(openAPI.summary).toBe('Request password reset')
    expect(openAPI.description).toBe('Send email.')
    const params = openAPI.parameters as Array<{ name: string, description?: string }>
    expect(params).toContainEqual(expect.objectContaining({ name: 'x-request-id', in: 'header', description: 'Idempotency key' }))
    const requestBody = openAPI.requestBody as { description: string }
    expect(requestBody.description).toBe('Reset payload.')
    expect(openAPI.requestBody).toBeDefined()
    const responses = openAPI.responses as Record<string, { description: string }>
    expect(responses['200']).toBeDefined()
    expect((responses['400'] as { description: string }).description).toBe('Bad request')
  })

  it('falls back to tagMap and humanized summary', () => {
    const { openAPI } = buildOpenAPI({
      id: '/app/server/api/auth/login.post.ts',
      routesDir: '/app/server/api',
      jsdoc: {},
      schemas: {},
      options: baseOptions,
    })
    expect(openAPI.tags).toEqual(['Auth'])
    expect(openAPI.summary).toBe('Login')
  })

  it('emits path params and query params', () => {
    const { openAPI } = buildOpenAPI({
      id: '/app/server/api/users/[id].get.ts',
      routesDir: '/app/server/api',
      jsdoc: { summary: 'Get user' },
      schemas: {
        query: { type: 'object', properties: { include: { type: 'string' } }, required: [] },
      },
      options: { defaultErrors: [] },
    })
    const params = openAPI.parameters as Array<{ name: string, in: string }>
    expect(params).toContainEqual(expect.objectContaining({ name: 'id', in: 'path' }))
    expect(params).toContainEqual(expect.objectContaining({ name: 'include', in: 'query' }))
    expect(openAPI.requestBody).toBeUndefined()
  })

  it('maps @security to OpenAPI security', () => {
    const { openAPI } = buildOpenAPI({
      id: '/app/server/api/me.get.ts',
      routesDir: '/app/server/api',
      jsdoc: { security: ['bearerAuth'] },
      schemas: {},
      options: {},
    })
    expect(openAPI.security).toEqual([{ bearerAuth: [] }])
  })

  it('prefers bodyExample export over @example', () => {
    const { openAPI } = buildOpenAPI({
      id: '/app/server/api/users/index.post.ts',
      routesDir: '/app/server/api',
      jsdoc: { example: { email: 'jsdoc@x.y' } },
      schemas: {
        body: { type: 'object' },
        bodyExample: { email: 'export@x.y' },
      },
      options: {},
    })
    const body = openAPI.requestBody as { content: { 'application/json': { example: unknown } } }
    expect(body.content['application/json'].example).toEqual({ email: 'export@x.y' })
  })

  it('attaches error DTO schemas with descriptions', () => {
    const { openAPI } = buildOpenAPI({
      id: '/app/server/api/users/index.post.ts',
      routesDir: '/app/server/api',
      jsdoc: { responses: { 409: 'Email already exists' } },
      schemas: {
        errorResponses: { 409: { schema: { type: 'object' } } },
      },
      options: { defaultErrors: [] },
    })
    const r409 = (openAPI.responses as Record<string, { description: string, content: { 'application/json': { schema: unknown } } }>)['409'] as { description: string, content: { 'application/json': { schema: unknown } } }
    expect(r409.description).toBe('Email already exists')
    expect(r409.content['application/json'].schema).toEqual({ type: 'object' })
  })

  it('uses responseExample export for 200', () => {
    const { openAPI } = buildOpenAPI({
      id: '/app/server/api/users/[id].get.ts',
      routesDir: '/app/server/api',
      jsdoc: {},
      schemas: { responseExample: { id: 'user_123' } },
      options: {},
    })
    const r200 = (openAPI.responses as Record<string, { content: { 'application/json': { example: unknown } } }>)['200'] as { content: { 'application/json': { example: unknown } } }
    expect(r200.content['application/json'].example).toEqual({ id: 'user_123' })
  })

  it('treats object @response as example content', () => {
    const { openAPI } = buildOpenAPI({
      id: '/app/server/api/x.get.ts',
      routesDir: '/app/server/api',
      jsdoc: { responses: { 404: { error: 'missing' } } },
      schemas: {},
      options: {},
    })
    const r404 = (openAPI.responses as Record<string, { description: string, content: { 'application/json': { example: unknown } } }>)['404'] as { description: string, content: { 'application/json': { example: unknown } } }
    expect(r404.description).toBe('Error')
    expect(r404.content['application/json'].example).toEqual({ error: 'missing' })
  })

  it('merges @param over auto path params without duplicates', () => {
    const { openAPI } = buildOpenAPI({
      id: '/app/server/api/users/[id].get.ts',
      routesDir: '/app/server/api',
      jsdoc: {
        params: [{ name: 'id', in: 'path', required: false, schema: { type: 'string' }, description: 'User id' }],
      },
      schemas: {},
      options: {},
    })
    const params = openAPI.parameters as Array<{ name: string, in: string, required: boolean, description?: string }>
    const ids = params.filter(p => p.name === 'id')
    expect(ids).toHaveLength(1)
    expect(ids[0]).toMatchObject({ in: 'path', required: true, description: 'User id' })
  })

  it('supports array (non-object) bodies with examples', () => {
    const { openAPI } = buildOpenAPI({
      id: '/app/server/api/users/bulk.post.ts',
      routesDir: '/app/server/api',
      jsdoc: { bodyDescription: 'Array of users.' },
      schemas: {
        body: { type: 'array', items: { type: 'object' } },
        bodyExample: [{ email: 'a@b.c' }],
      },
      options: {},
    })
    const body = openAPI.requestBody as { description: string, content: { 'application/json': { schema: unknown, example: unknown } } }
    expect(body.description).toBe('Array of users.')
    expect(body.content['application/json'].schema).toEqual({ type: 'array', items: { type: 'object' } })
    expect(body.content['application/json'].example).toEqual([{ email: 'a@b.c' }])
  })

  it('labels non-200 success codes correctly', () => {
    const { openAPI } = buildOpenAPI({
      id: '/app/server/api/users/bulk.post.ts',
      routesDir: '/app/server/api',
      jsdoc: { responses: { 201: { created: 2 } } },
      schemas: {},
      options: {},
    })
    const r201 = (openAPI.responses as Record<string, { description: string }>)['201'] as { description: string }
    expect(r201.description).toBe('Successful response')
  })

  it('merges openAPIMeta.requestBody over generated body', () => {
    const { openAPI } = buildOpenAPI({
      id: '/app/server/api/users/index.post.ts',
      routesDir: '/app/server/api',
      jsdoc: { bodyDescription: 'JSDoc desc' },
      schemas: { body: { type: 'object' } },
      openAPIMeta: { requestBody: { description: 'Meta desc' } },
      options: {},
    })
    const body = openAPI.requestBody as { description: string, required: boolean, content: unknown }
    expect(body.description).toBe('Meta desc')
    expect(body.required).toBe(true)
    expect(body.content).toBeDefined()
  })

  it('attaches @paramExample to parameters without overriding explicit examples', () => {
    const { openAPI } = buildOpenAPI({
      id: '/app/server/api/auth/forgot-password.post.ts',
      routesDir: '/app/server/api',
      jsdoc: {
        params: [
          { name: 'x-request-id', in: 'header', required: false, schema: { type: 'string' } },
          { name: 'x-trace', in: 'header', required: false, schema: { type: 'string' } },
        ],
        paramExamples: { 'x-request-id': 'req_123', 'x-trace': 'ignored' },
      },
      openAPIMeta: {
        parameters: [{ name: 'x-trace', in: 'header', example: 'explicit' }],
      },
      schemas: {},
      options: {},
    })
    const params = openAPI.parameters as Array<{ name: string, example?: unknown }>
    expect(params.find(p => p.name === 'x-request-id')?.example).toBe('req_123')
    expect(params.find(p => p.name === 'x-trace')?.example).toBe('explicit')
  })

  it('enriches nested path params from paramsSchema', () => {
    const { openAPI } = buildOpenAPI({
      id: '/app/server/api/roles/[id]/permissions/[permissionId].delete.ts',
      routesDir: '/app/server/api',
      jsdoc: { summary: 'Remove permission from role' },
      schemas: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Role id' },
            permissionId: { type: 'string', description: 'Permission id to revoke' },
          },
        },
      },
      options: { tagMap: { '/api/roles': 'Roles' } },
    })
    expect(openAPI.tags).toEqual(['Roles'])
    const params = openAPI.parameters as Array<{ name: string, in: string, description?: string }>
    expect(params).toContainEqual(expect.objectContaining({ name: 'id', in: 'path', description: 'Role id' }))
    expect(params).toContainEqual(expect.objectContaining({ name: 'permissionId', in: 'path', description: 'Permission id to revoke' }))
  })
})
