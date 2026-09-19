import { describe, expect, it } from 'vitest'
import { parseJSDoc, parseParam } from '../src/parse/jsdoc'

describe('parseJSDoc', () => {
  it('parses full annotation block', () => {
    const code = `/**
 * @tag Auth
 * @summary Request password reset
 * @description Send email.
 * @bodyDescription Reset payload.
 * @param header x-request-id optional Idempotency key
 * @security bearerAuth
 * @response 200 { "ok": true }
 * @response 404 Not found
 * @example { "email": "a@b.c" }
 */
export default defineEventHandler(() => ({}))`
    const meta = parseJSDoc(code)
    expect(meta.tag).toBe('Auth')
    expect(meta.summary).toBe('Request password reset')
    expect(meta.bodyDescription).toBe('Reset payload.')
    expect(meta.params).toEqual([
      { name: 'x-request-id', in: 'header', required: false, schema: { type: 'string' }, description: 'Idempotency key' },
    ])
    expect(meta.security).toEqual(['bearerAuth'])
    expect(meta.example).toEqual({ email: 'a@b.c' })
    expect(meta.responses?.[200]).toEqual({ ok: true })
    expect(meta.responses?.[404]).toBe('Not found')
  })

  it('returns empty object without a block', () => {
    expect(parseJSDoc('export default 1')).toEqual({})
  })

  it('parses @tags list and @deprecated', () => {
    const meta = parseJSDoc(`/**\n * @tags Auth, Users\n * @deprecated true\n */\nexport default 1`)
    expect(meta.tags).toEqual(['Auth', 'Users'])
    expect(meta.deprecated).toBe(true)
  })

  it('parses @paramExample values (string and JSON)', () => {
    const meta = parseJSDoc(`/**\n * @param header x-id optional Some id\n * @paramExample x-id req_123\n * @paramExample limit 10\n */\nexport default 1`)
    expect(meta.paramExamples).toEqual({ 'x-id': 'req_123', 'limit': 10 })
  })
})

describe('parseParam', () => {
  it('parses typed required params', () => {
    expect(parseParam('query limit:number required Max items')).toEqual({
      name: 'limit',
      in: 'query',
      required: true,
      schema: { type: 'number' },
      description: 'Max items',
    })
  })

  it('defaults to optional string params', () => {
    expect(parseParam('header x-request-id Idempotency key')).toEqual({
      name: 'x-request-id',
      in: 'header',
      required: false,
      schema: { type: 'string' },
      description: 'Idempotency key',
    })
  })

  it('rejects unknown locations and bare names', () => {
    expect(parseParam('bogus x-id whatever')).toBeUndefined()
    expect(parseParam('header')).toBeUndefined()
  })

  it('maps type aliases', () => {
    expect(parseParam('query page:int')?.schema).toEqual({ type: 'integer' })
    expect(parseParam('query verbose:bool')?.schema).toEqual({ type: 'boolean' })
  })
})
