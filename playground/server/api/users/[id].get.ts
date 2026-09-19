/**
 * @summary Get user by id
 * @description Fetch a single user. Demonstrates path params + query schema.
 * @response 404 User not found
 */
import * as v from 'valibot'

export const querySchema = v.object({
  include: v.optional(v.pipe(v.string(), v.description('Comma-separated relations to include'))),
})

export const responseExample = { id: 'user_123' }

const errorDto = v.object({
  statusCode: v.number(),
  statusMessage: v.string(),
})

/** Per-status error DTOs (Valibot schemas → JSON Schema). */
export const errorResponses = { 404: errorDto }

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  // Note: Valibot has no `.parse` method — use `v.parse(schema, data)`.
  const query = await getValidatedQuery(event, data => v.parse(querySchema, data))
  void query
  if (!id)
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  return { id }
})
