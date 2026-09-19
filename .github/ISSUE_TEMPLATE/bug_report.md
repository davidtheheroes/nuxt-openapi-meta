---
name: Bug report
about: Report incorrect or missing OpenAPI output from nuxt-openapi-meta
title: "[bug] "
labels: bug
assignees: ""
---

## Describe the bug

A clear description of what is wrong (e.g. route missing from `/_openapi.json`,
wrong tags/summary, empty `requestBody`, missing error responses).

## Environment

- `nuxt-openapi-meta` version:
- Nuxt version: (`npx nuxt --version`)
- Nitro version: (shown in build output, e.g. `with Nitro 2.13.4`)
- Validator: `zod@` / `valibot@` / none (with version)
- Mode: dev (`nuxt dev`) / production (`nuxt build` + `node .output/server/index.mjs`)

## Module config

```ts
// nuxt.config.ts (relevant part)
export default defineNuxtConfig({
  modules: ['nuxt-openapi-meta'],
  openapiMeta: {
    // ...
  },
  nitro: {
    experimental: { openAPI: true },
  },
})
```

## Route file (minimal reproduction)

```ts
// server/api/....ts — paste the smallest route that reproduces the bug
```

## Expected OpenAPI

What the operation in `/_openapi.json` (or `/_scalar`) should look like:

```json
{}
```

## Actual OpenAPI

What it actually looks like (paste the operation object from `/_openapi.json`):

```json
{}
```

## Logs

Run with debug hints enabled and paste related lines:

```bash
DEBUG=nuxt-openapi-meta npm run dev
# or: npx nuxt build playground
```

```
(paste output here)
```

## Additional context

Anything else (custom `defineRouteMeta`, `overwrite: true`, dynamic segments like
`[id]`, `~/` alias imports, monorepo setup, Windows/macOS/Linux…).
