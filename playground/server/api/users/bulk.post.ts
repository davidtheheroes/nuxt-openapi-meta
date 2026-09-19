/**
 * @tag Users
 * @summary Bulk create users
 * @description Create up to 100 users in one call. Demonstrates a non-object (array) body.
 * @bodyDescription Array of users to create (max 100).
 * @response 201 { "created": 2 }
 */
import { z } from 'zod'
import { CreateUserSchema } from '../../dto/user'

export const bodySchema = z.array(CreateUserSchema).max(100)

export const bodyExample = [
  { email: 'a@fpt.edu.vn', name: 'Student A' },
  { email: 'b@fpt.edu.vn', name: 'Student B' },
]

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  return { created: body.length }
})
