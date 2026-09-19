# Changelog

All notable changes to this project will be documented in this file.
Releases after `v0.1.0` are generated with [changelogen](https://github.com/unjs/changelogen)
from [Conventional Commits](https://www.conventionalcommits.org/).

## v0.2.1

[compare changes](https://github.com/davidtheheroes/nuxt-openapi-meta/compare/v0.2.0...v0.2.1)

## v0.1.2


### 🏡 Chore

- **release:** V0.1.1 ([d0f8262](https://github.com/davidtheheroes/nuxt-openapi-meta/commit/d0f8262))

### ❤️ Contributors

- David Pham ([@davidtheheroes](https://github.com/davidtheheroes))

## v0.1.1

## v0.1.0 (unreleased)

### Features

- Auto-generate Nitro route metadata (`?meta` interception) for `server/api/**` routes
- JSDoc annotations: `@tag`/`@tags`, `@summary`, `@description`, `@bodyDescription`,
  generic `@param`, `@security`, `@response`, `@example`, `@operationId`, `@deprecated`
- Schema exports via `jiti`: `bodySchema`, `querySchema`, `paramsSchema`, `responseSchema`
- Example exports: `bodyExample`, `responseExample`
- Per-status error DTOs: `errorResponses = { 404: NotFoundDto, … }` (schema or plain example object)
- `openAPIMeta` raw override (typed via `defineOpenAPIMeta`); `overwrite` option for
  files with hand-written `defineRouteMeta`
- Validators: Zod v3/v4 (native `toJSONSchema`), Valibot (`@valibot/to-json-schema`);
  `~/`/`@` alias support for shared DTO imports
- `tagMap`, `defaultErrors`, `createError({ statusCode })` auto-detect
- Field descriptions via Zod `.describe()` / Valibot `v.description()`; non-object
  (array/primitive/union) schemas pass through untouched
- Multi-dir scan: `server/api` + `server/routes` by default (`routesDirs` option)
- `paramsSchema` enriches auto-detected path params (description + schema)
