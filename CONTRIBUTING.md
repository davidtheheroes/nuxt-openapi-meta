# Contributing to nuxt-openapi-meta

Thanks for helping out! This guide covers the local workflow. By participating you
agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Setup

```bash
npm install
npm run dev:prepare   # stub-build the module + generate Nuxt types
npm run dev           # playground with hot reload
```

Open `http://localhost:3000/_scalar` (or `/_openapi.json`) to inspect generated
metadata for the demo routes in `playground/server/api`.

## Checks (run all before opening a PR)

```bash
npm run lint          # eslint — must be clean
npm run test          # vitest unit tests
npm run test:types    # vue-tsc for the module and the playground
npm run dev:build     # real Nuxt+Nitro build; inspect playground/.output/public/_openapi.json
```

Debug hints for schema extraction:

```bash
DEBUG=nuxt-openapi-meta npm run dev
```

## Conventions

- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `test:`, `chore:` …) — the changelog is generated from them.
- **Route conventions** implemented by the module live in `src/`:
  `parse/` (JSDoc, Zod/Valibot), `scan/` (file → route path), `generate/` (OpenAPI object),
  `transform/` (Nitro `?meta` interception). Pure functions first — they are the easiest to test.
- **Tests**: add/extend a case in `test/` for every behavior change. Tests that read the
  `playground/` must assert structure, not demo content (the playground is edited by hand).
- **No project-specific logic in core**: no hardcoded headers, tags, or rate limits —
  generic mechanisms (`@param`, `tagMap`, `defaultErrors`) instead.

## Pull requests

1. Fork, branch from `main` (`feat/<name>`, `fix/<name>`).
2. Keep PRs focused; one behavior per PR.
3. Fill in the issue template context (repro route + expected vs actual OpenAPI) when fixing bugs.

## Releases

Maintainers only: `npm run release` (lint → test → build → `changelogen --release` → publish).
