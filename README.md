# nuxt-openapi-meta

[![npm version][npm-version-src]][npm-version-href] [![npm downloads][npm-downloads-src]][npm-downloads-href] [![License][license-src]][license-href] [![Nuxt][nuxt-src]][nuxt-href]

Auto-generate Nitro `defineRouteMeta` (OpenAPI) for Nuxt server routes from **JSDoc annotations** + **Zod / Valibot schemas**. Zero boilerplate: just write a route, get documented OpenAPI.

- [✨ Release Notes](/CHANGELOG.md)

## Features

- 🔍 Auto-scan `server/api/**` route files at build time
- 📝 JSDoc annotations (`@tag`, `@summary`, `@response`, …) → OpenAPI operation
- 🧪 `export const bodySchema / querySchema / paramsSchema / responseSchema` (Zod v3/v4, Valibot) → JSON Schema
- ⚡ Serves generated `defineRouteMeta` through Nitro's `?meta` pipeline (no source files touched)
- 🛡 Respects existing `defineRouteMeta` (skip unless `overwrite: true`)
- ⚙️ `tagMap`, `defaultErrors`, `createError()` auto-detect, generic `@param` support

## Quick Setup

```bash
npx nuxt module add nuxt-openapi-meta
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-openapi-meta'],
  openapiMeta: {
    tagMap: { '/api/auth': 'Auth' },
  },
  nitro: {
    experimental: { openAPI: true }, // enables /_openapi.json + /_scalar + /_swagger
  },
})
```

## Usage

Minimal convention — no `defineRouteMeta` needed:

```ts
// server/api/auth/forgot-password.post.ts
/**
 * @tag Auth
 * @summary Request password reset
 * @description Send a reset email if the address exists.
 * @bodyDescription Password-reset request payload.
 * @param header x-request-id optional Idempotency key for safe retries
 * @response 429 Too many requests
 * @example { "email": "student@fpt.edu.vn" }
 */
import { z } from 'zod'

export const bodySchema = z.object({
  email: z.email(),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  return { ok: true }
})
```

At build time the module serves (via Nitro's `?meta` pipeline):

```ts
// virtual: server/api/auth/forgot-password.post.ts?meta
export default {
  openAPI: {
    tags: ['Auth'],
    summary: 'Request password reset',
    // ... parameters, requestBody (JSON Schema), responses
  },
}
```

Your handler source files are never modified.

### JSDoc annotations

| Tag | Meaning |
|---|---|
| `@tag X` / `@tags A, B` | Operation tags (fallback: `tagMap`, then `Default`) |
| `@summary` / `@description` | Operation summary/description |
| `@bodyDescription …` | `requestBody.description` |
| `@param <in> <name>[:type] [required\|optional] [desc…]` | Generic parameter — see below |
| `@paramExample <name> <value>` | Example for the named parameter (JSON or plain text) |
| `@operationId` | Explicit operationId |
| `@deprecated` | Mark deprecated |
| `@security bearerAuth` | `security: [{ bearerAuth: [] }]` |
| `@response 200 { … }` | Success example (JSON object) |
| `@response 404 Not found` | Error description — stack one line per status |
| `@example { … }` | Request-body example (inline JSON) |

### Generic parameters (`@param`)

Project-agnostic — use it for any header/query/path/cookie your project needs
(CSRF tokens, idempotency keys, pagination, …). The module ships **no**
hardcoded custom headers.

```ts
/**
 * @param header x-request-id optional Idempotency key for safe retries
 * @param query limit:number required Max items (1-100)
 * @param query include Comma-separated relations to include
 * @param path id The user id
 * @paramExample x-request-id req_9f2c4a1e
 * @paramExample limit 25
 */
```

Syntax: `@param <in> <name>[:type] [required|optional] [description…]`
- `<in>`: `query` `header` `path` `cookie`
- `:type`: `string` (default) `number` `integer`/`int` `boolean`/`bool` `array` `object`
- `required` present → `required: true`, else `false` (`path` is always required)
- Entries override auto-detected params with the same `in:name` (so `@param path id …`
  documents the `:id` segment instead of duplicating it); `openAPIMeta.parameters`
  wins over both.

### Error responses: stack `@response` lines

```ts
/**
 * @response 400 Email is invalid
 * @response 409 Email already exists
 * @response 422 Account is locked
 */
export const errorResponses = {
  409: ConflictErrorDto, // Zod/Valibot schema → content.schema
  422: { error: 'locked' }, // plain object → content.example
}
```

Description precedence per status: `openAPIMeta.responses[N]` › `@response N` text ›
`defaultErrors` option › `createError({ statusCode })` auto-detect. Schemas from
`errorResponses` attach as `content`; `@response N {…}` objects become examples.

### Descriptions everywhere

- Operation: `@description`
- Body: `@bodyDescription` (or `openAPIMeta.requestBody.description`)
- Field-level: describe fields **in the DTO itself** — it flows into JSON Schema:
  ```ts
  z.email().describe('Login email')          // Zod
  v.pipe(v.string(), v.description('Login email'))    // Valibot
  ```
- Non-object shapes are first-class: `z.array(UserDto)`, `z.string()`, unions and
  plain array/primitive examples all pass through to `schema`/`example` untouched.

### Schema exports (build-time via `jiti`)

| Export | Used as |
|---|---|
| `bodySchema` | `requestBody` for POST/PUT/PATCH |
| `querySchema` | `parameters` (`in: query`) |
| `paramsSchema` | Reserved (path params come from filename) |
| `responseSchema` | `responses.200` schema |
| `bodyExample` | `requestBody` example — plain object, no JSON-in-comment needed |
| `responseExample` | `responses.200` example — plain object/array |
| `errorResponses` | `{ 404: NotFoundDto, … }` — per-status error DTOs (schema → JSON Schema, plain object → example) |
| `openAPIMeta` | Raw override merged **over** JSDoc (typed via `defineOpenAPIMeta`) |

Precedence for examples: `openAPIMeta.example` › `bodyExample` export › `@example`. For `200`: `openAPIMeta.responses[200]` › `responseExample` › `@response 200 {…}`.

### DTOs: share schemas across routes

Schemas are loaded by executing the route file with `jiti`, so plain imports work — including Nuxt aliases (`~/…`, `@/…`):

```ts
// server/dto/user.ts
import { z } from 'zod'

export const UserSchema = z.object({
  id: z.string(),
  email: z.email(),
})
export const ErrorSchema = z.object({
  statusCode: z.number(),
  statusMessage: z.string(),
})
```

```ts
// server/api/users/index.post.ts
import { ErrorSchema, UserSchema, CreateUserSchema } from '../../dto/user'
// (or: from '~/server/dto/user')

export const bodySchema = CreateUserSchema
export const bodyExample = { email: 'new@fpt.edu.vn', name: 'New Student' }
export const responseSchema = UserSchema
export const responseExample = { id: 'user_123', email: 'new@fpt.edu.vn' }
export const errorResponses = { 409: ErrorSchema, 400: ErrorSchema }

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  return { id: 'user_123', ...body }
})
```

### Validators: Zod vs Valibot

- **Zod**: pass `schema.parse` directly — `readValidatedBody(event, bodySchema.parse)`.
- **Valibot** has no `.parse` method — wrap the standalone parser:

```ts
import * as v from 'valibot'

export const querySchema = v.object({ include: v.optional(v.string()) })

export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, data => v.parse(querySchema, data))
  // ...
})
```

```ts
import { defineOpenAPIMeta } from 'nuxt-openapi-meta/dist/runtime/utils'

export const openAPIMeta = defineOpenAPIMeta({
  tags: ['Auth'],
  operationId: 'forgotPassword',
})
```

Supported validators (latest versions):

- `zod` v4 — native `z.toJSONSchema()` / `schema.toJSONSchema()`
- `zod` v3 — via `zod-to-json-schema`
- `valibot` v1 — via `@valibot/to-json-schema`

### Manual override

If a route file already contains `defineRouteMeta(...)`, the module skips it. Set `overwrite: true` to force regeneration.

## Module options

```ts
export interface ModuleOptions {
  routesDirs?: string[] // default ['server/api', 'server/routes'] (whichever exist)
  routesDir?: string // single dir (backward compat, overrides the default)
  enabled?: boolean // default true
  tagMap?: Record<string, string> // e.g. { '/api/auth': 'Auth' }
  defaultErrors?: Array<{ status: number, description: string }>
  overwrite?: boolean // default false
  detectCreateError?: boolean // default true — parse createError({ statusCode })
}
```

Both Nuxt server dirs are scanned by default: `server/api/**` maps to `/api/*`,
`server/routes/**` maps to `/*` (e.g. `server/routes/hello.get.ts` → `GET /hello`).

## How it works

1. `nitro:config` hook registers a rollup plugin scoped to `routesDir` + `*.(get|post|put|patch|delete|all).ts`.
2. Nitro feeds `/_openapi.json` from virtual `server-handlers-meta`, which does `import XMeta from "<handler>?meta"` — and Nitro's own `nitro:handlers-meta` plugin resolves `?meta` by `readFile`-ing the handler **from disk**. A plain `transform()` injection into the handler module therefore never reaches the meta pipeline (this is why the module does **not** inject `defineRouteMeta` into your source).
3. Instead, our plugin (user `rollupConfig.plugins` run first) intercepts `<handler>?meta` and serves a virtual module `export default <generated meta>`: `parseJSDoc(code)` → `jiti.import(id)` → schema-to-JSON-Schema → `buildOpenAPI(...)`.
4. Files already containing `defineRouteMeta` are left alone (unless `overwrite: true`), so Nitro extracts the author's own metadata.

Notes:

- `defineRouteMeta` metadata is read by Nitro from `?meta` virtual modules loaded straight from disk — hence interception instead of source injection, and handler files stay untouched (zero runtime overhead).
- Schema loading never fails the build: route files are executed via `jiti` with Nitro/h3 auto-imports (`defineEventHandler`, …) stubbed; if import throws, the module falls back to JSDoc-only metadata.
- File-system params: `[id]` → `:id`, `[...slug]` → `:slug*`, `index` → parent path.

## Development

```bash
npm install
npm run dev:prepare
npm run dev          # playground
npm run test         # vitest
npm run lint
```

## 💖 Support the project

If this project is useful to you, consider buying me a coffee! ☕

<p align="center">
  <a href="https://buymeacoffee.com/davidthehero">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50">
  </a>
</p>

Your support motivates me to keep building and maintaining open-source projects! 🚀

### Other ways to support:

- ⭐ **Star** the project on GitHub
- 🐛 **Report bugs** or **suggest** new features
- 🔀 **Contribute** code via Pull Request
- 📢 **Share** the project with the community

<p align="center">
  Made with ❤️ using <strong>Nuxt</strong> & <strong>Nitro</strong>
  <br><br>
  <a href="https://github.com/davidtheheroes/nuxt-openapi-meta/stargazers">
    <img src="https://img.shields.io/github/stars/davidtheheroes/nuxt-openapi-meta?style=social" alt="GitHub Stars">
  </a>
  <a href="https://github.com/davidtheheroes/nuxt-openapi-meta/fork">
    <img src="https://img.shields.io/github/forks/davidtheheroes/nuxt-openapi-meta?style=social" alt="GitHub Forks">
  </a>
</p>

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/nuxt-openapi-meta/latest.svg?style=flat&colorA=020420&colorB=00DC82&cacheSeconds=86400
[npm-version-href]: https://npmjs.com/package/nuxt-openapi-meta

[npm-downloads-src]: https://img.shields.io/npm/dm/nuxt-openapi-meta.svg?style=flat&colorA=020420&colorB=00DC82&cacheSeconds=86400
[npm-downloads-href]: https://npm.chart.dev/nuxt-openapi-meta

[license-src]: https://img.shields.io/npm/l/nuxt-openapi-meta.svg?style=flat&colorA=020420&colorB=00DC82&cacheSeconds=86400
[license-href]: https://npmjs.com/package/nuxt-openapi-meta

[nuxt-src]: https://img.shields.io/badge/Nuxt-020420?logo=nuxt
[nuxt-href]: https://nuxt.com
