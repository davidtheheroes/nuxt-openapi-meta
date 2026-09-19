import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import * as v from 'valibot'
import { convertToJsonSchema, detectSchemaRefs, loadRouteSchemas } from '../src/parse/schema'

describe('convertToJsonSchema', () => {
  it('converts zod v4 schema (native)', async () => {
    const schema = z.object({ email: z.email() })
    const out = await convertToJsonSchema(schema)
    expect(out).toBeDefined()
    expect((out as { type: string }).type).toBe('object')
    expect(((out as { properties: Record<string, unknown> }).properties)).toHaveProperty('email')
  })

  it('converts valibot schema', async () => {
    const schema = v.object({ include: v.optional(v.string()) })
    const out = await convertToJsonSchema(schema)
    expect(out).toBeDefined()
    expect((out as { type: string }).type).toBe('object')
  })

  it('returns undefined for non-schemas', async () => {
    expect(await convertToJsonSchema(undefined)).toBeUndefined()
    expect(await convertToJsonSchema({ foo: 1 })).toBeUndefined()
  })
})

describe('loadRouteSchemas', () => {
  it('extracts named exports', async () => {
    const bodySchema = z.object({ email: z.string() })
    const { schemas } = await loadRouteSchemas({ bodySchema })
    expect(schemas.body).toBeDefined()
    expect(schemas.query).toBeUndefined()
  })

  it('picks up openAPIMeta override', async () => {
    const { openAPIMeta } = await loadRouteSchemas({ openAPIMeta: { tags: ['X'] } })
    expect(openAPIMeta).toEqual({ tags: ['X'] })
  })
})

describe('detectSchemaRefs', () => {
  it('finds validator references', () => {
    const refs = detectSchemaRefs('readValidatedBody(event, bodySchema.parse); getValidatedQuery(event, querySchema.parse)')
    expect(refs.body).toBe('bodySchema')
    expect(refs.query).toBe('querySchema')
  })

  it('finds valibot and arrow-wrapper references', () => {
    expect(detectSchemaRefs('getValidatedQuery(event, v.parse(querySchema, data))').query).toBe('querySchema')
    expect(detectSchemaRefs('getValidatedQuery(event, data => v.parse(querySchema, data))').query).toBe('querySchema')
    expect(detectSchemaRefs('readValidatedBody(event, d => bodySchema.parse(d))').body).toBe('bodySchema')
  })
})

describe('loadRouteSchemas examples + error DTOs', () => {
  it('passes through bodyExample/responseExample objects', async () => {
    const { schemas } = await loadRouteSchemas({
      bodyExample: { email: 'a@b.c' },
      responseExample: [{ id: 1 }],
    })
    expect(schemas.bodyExample).toEqual({ email: 'a@b.c' })
    expect(schemas.responseExample).toEqual([{ id: 1 }])
  })

  it('converts errorResponses schemas per status', async () => {
    const { schemas } = await loadRouteSchemas({
      errorResponses: {
        404: z.object({ message: z.string() }),
        bad: z.string(),
      },
    })
    expect(schemas.errorResponses?.[404]).toHaveProperty('schema')
    expect((schemas.errorResponses?.[404] as { schema: { type: string } }).schema.type).toBe('object')
    expect(schemas.errorResponses?.['bad' as unknown as number]).toBeUndefined()
  })

  it('keeps plain objects in errorResponses as examples', async () => {
    const { schemas } = await loadRouteSchemas({
      errorResponses: { 409: { error: 'taken' } },
    })
    expect(schemas.errorResponses?.[409]).toEqual({ example: { error: 'taken' } })
  })
})
