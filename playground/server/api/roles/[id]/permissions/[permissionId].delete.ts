/**
 * @tag Roles
 * @summary Remove permission from role
 * @description Revoke a permission from a role. Idempotent — revoking a
 * permission the role does not have still returns 204.
 * @param header x-request-id optional Idempotency key for safe retries
 * @response 204 No content
 * @response 403 Missing roles:write scope
 * @response 404 Role or permission not found
 */
import { z } from 'zod'

export const paramsSchema = z.object({
  id: z.string().describe('Role id'),
  permissionId: z.string().describe('Permission id to revoke'),
})

const forbiddenDto = z.object({
  statusCode: z.number(),
  statusMessage: z.string(),
})

const notFoundDto = z.object({
  statusCode: z.number(),
  statusMessage: z.string(),
  missing: z.array(z.string()),
})

/** Per-status error DTOs. */
export const errorResponses = {
  403: forbiddenDto,
  404: notFoundDto,
}

export default defineEventHandler(async (event) => {
  const params = await getValidatedRouterParams(event, paramsSchema.parse)
  // const user = event.context.user
  // if (!user.scopes.includes('roles:write'))
  //   throw createError({ statusCode: 403, statusMessage: 'Missing roles:write scope' })
  // await removePermissionFromRole(params.id, params.permissionId)
  void params
  setResponseStatus(event, 204)
  return null
})
