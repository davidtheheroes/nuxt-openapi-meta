import { z } from 'zod'

/** Shared DTOs — import them from any route with a relative path or `~/server/dto/user`. */
export const UserSchema = z.object({
  id: z.string().describe('User id'),
  email: z.email().describe('Login email'),
  name: z.string().min(1).describe('Display name'),
})

export const CreateUserSchema = z.object({
  email: z.email().describe('Login email'),
  name: z.string().min(1).describe('Display name'),
})

export const ErrorSchema = z.object({
  statusCode: z.number().describe('HTTP status code'),
  statusMessage: z.string().describe('Human-readable error'),
})
