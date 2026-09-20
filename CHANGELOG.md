# Changelog

All notable changes to this project will be documented in this file.
Releases use [changelogen](https://github.com/unjs/changelogen)
with [Conventional Commits](https://www.conventionalcommits.org/).

## v0.2.2

[compare changes](https://github.com/davidtheheroes/nuxt-openapi-meta/compare/v0.2.1...v0.2.2)

### 🚀 Enhancements

- Add support security ([c821863](https://github.com/davidtheheroes/nuxt-openapi-meta/commit/c821863))

### 📖 Documentation

- Highlight @paramExample in v0.2.1 changelog ([cfd1849](https://github.com/davidtheheroes/nuxt-openapi-meta/commit/cfd1849))

### ❤️ Contributors

- David Pham ([@davidtheheroes](https://github.com/davidtheheroes))

## v0.2.1

[compare changes](https://github.com/davidtheheroes/nuxt-openapi-meta/compare/v0.2.0...v0.2.1)

### 🚀 Features

- **New:** `@paramExample` — attach examples to parameters (header/query/path/cookie).
  Also available as `openAPIMeta.paramExamples`.

  ```ts
  /**
   * @param header x-request-id optional Idempotency key for safe retries
   * @paramExample x-request-id req_9f2c4a1e
   */
  ```

## v0.1.2

[compare changes](https://github.com/davidtheheroes/nuxt-openapi-meta/compare/v0.1.1...v0.1.2)

### 📖 Docs
- Cache-busted npm badges after first publish; `repository` metadata fixed.

## v0.1.1

[compare changes](https://github.com/davidtheheroes/nuxt-openapi-meta/compare/v0.1.0...v0.1.1)

### 🚀 Features

- First public release: auto-generate Nitro route metadata via `?meta`
  interception for `server/api/**` (and `server/routes/**` via `routesDirs`).
- JSDoc annotations: `@tag`/`@tags`, `@summary`, `@description`,
  `@bodyDescription`, generic `@param`, `@security`, `@response`, `@example`,
  `@operationId`, `@deprecated`.
- Schema exports via `jiti`: `bodySchema`, `querySchema`, `paramsSchema`
  (enriches path params), `responseSchema`.
- Example exports: `bodyExample`, `responseExample`.
- Per-status error DTOs: `errorResponses = { 404: NotFoundDto, … }`
  (schema or plain example object).
- `openAPIMeta` raw override (typed via `defineOpenAPIMeta`); `overwrite`
  option for files with hand-written `defineRouteMeta`.
- Validators: Zod v3/v4 (native `toJSONSchema`), Valibot
  (`@valibot/to-json-schema`); `~/`/`@` alias support for shared DTO imports.
- `tagMap`, `defaultErrors`, `createError({ statusCode })` auto-detect.
- Field descriptions via Zod `.describe()` / Valibot `v.description()`;
  non-object (array/primitive/union) schemas pass through untouched.
- Strict TypeScript (`noUncheckedIndexedAccess` clean), 40+ unit tests,
  playground with `/_scalar` + prerendered `/_openapi.json` demo.

### ❤️ Contributors

- David Pham ([@davidtheheroes](https://github.com/davidtheheroes))
