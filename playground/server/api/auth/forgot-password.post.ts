/**
 * @tag Auth
 * @summary Request password reset
 * @description Send a reset email if the address exists (max 5/min per IP).
 * @bodyDescription Password-reset request payload.
 * @param header x-request-id optional Idempotency key for safe retries
 * @paramExample x-request-id req_9f2c4a1e
 * @response 200 { "ok": true }
 * @response 429 Too many requests
 * @example { "email": "student@fpt.edu.vn" }
 */
import { z } from 'zod'

export const bodySchema = z.object({
  email: z.email(),
  token: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  void body
  return { ok: true }
})
