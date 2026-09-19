/**
 * @tag Users
 * @summary Create user
 * @description Create a new user. Demonstrates shared DTOs + object examples + error DTOs.
 * @response 409 Email already exists
 */
import { CreateUserSchema, ErrorSchema, UserSchema } from '../../dto/user'

// DTO re-export: converted to JSON Schema for `requestBody`.
export const bodySchema = CreateUserSchema

// Object example (no JSON-in-comment needed).
export const bodyExample = {
  email: 'new@fpt.edu.vn',
  name: 'New Student',
}

export const responseSchema = UserSchema

export const responseExample = {
  id: 'user_123',
  email: 'new@fpt.edu.vn',
  name: 'New Student',
}

/** Per-status error DTOs. */
export const errorResponses = {
  409: ErrorSchema,
  400: ErrorSchema,
}

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  if (body.email === 'taken@fpt.edu.vn')
    throw createError({ statusCode: 409, statusMessage: 'Email already exists' })
  return { id: 'user_123', ...body }
})
