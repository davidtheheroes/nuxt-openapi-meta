import type { JSDocMeta, ParsedParam } from '../parse/jsdoc'
import type { ParsedSchemas } from '../parse/schema'
import type { ModuleOptions } from '../module'
import { fileToRoute, humanize } from '../scan/routes'

export interface BuildOpenAPIArgs {
  id: string
  routesDir: string
  jsdoc: JSDocMeta
  openAPIMeta?: Record<string, unknown>
  schemas: ParsedSchemas
  options: ModuleOptions
}

function resolveTag(path: string, jsdoc: JSDocMeta, openAPIMeta: Record<string, unknown> | undefined, tagMap: Record<string, string> | undefined): string[] {
  const fromMeta = openAPIMeta?.tags ?? openAPIMeta?.tag ?? jsdoc.tags ?? jsdoc.tag
  if (Array.isArray(fromMeta) && fromMeta.length)
    return fromMeta.map(String)
  if (typeof fromMeta === 'string' && fromMeta)
    return [fromMeta]

  if (tagMap) {
    for (const [prefix, tag] of Object.entries(tagMap)) {
      if (path.startsWith(prefix))
        return [tag]
    }
  }
  return ['Default']
}

function buildDescription(jsdoc: JSDocMeta, meta: Record<string, unknown> | undefined): string | undefined {
  const desc = (meta?.description ?? jsdoc.description) as string | undefined
  const joined = String(desc ?? '').trim()
  return joined || undefined
}

function extractErrorStatuses(code: string): Array<{ status: number, description: string }> {
  const out: Array<{ status: number, description: string }> = []
  const re = /createError\s*\(\s*\{([^}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(code)) !== null) {
    const body = m[1] ?? ''
    const statusM = body.match(/status(?:Code)?\s*:\s*(\d{3})/)
    const msgM = body.match(/(?:statusMessage|message)\s*:\s*['"`]([^'"`]+)['"`]/)
    if (statusM) {
      out.push({
        status: Number(statusM[1]),
        description: msgM?.[1] ?? `Error ${statusM[1]}`,
      })
    }
  }
  return out
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function toQueryParameters(querySchema: Record<string, unknown> | undefined): unknown[] {
  if (!querySchema || typeof querySchema !== 'object')
    return []
  const props = (querySchema.properties ?? {}) as Record<string, Record<string, unknown>>
  const required = new Set((querySchema.required as string[] | undefined) ?? [])
  return Object.entries(props).map(([name, prop]) => ({
    name,
    in: 'query',
    required: required.has(name),
    schema: prop,
  }))
}

interface ResponsesInput {
  jsdoc: JSDocMeta
  meta: Record<string, unknown>
  schemas: ParsedSchemas
  options: ModuleOptions
}

/**
 * Build the OpenAPI `responses` map.
 *
 * Layers (later wins for descriptions):
 * 1. `defaultErrors` option
 * 2. `createError({ statusCode })` auto-detect (unless `detectCreateError: false`)
 * 3. `@response <code>` JSDoc (string → description, object → example)
 * 4. `openAPIMeta.responses` (string → description, `{ description, content?, example? }`)
 *
 * Schemas attach as `content`:
 * - 200 ← `export const responseSchema`
 * - errors ← `export const errorResponses = { 404: Dto, … }`
 */
function buildResponses({ jsdoc, meta, schemas, options }: ResponsesInput): Record<string, unknown> {
  const jsdocResponses = (jsdoc.responses ?? {}) as Record<string | number, unknown>
  const metaResponses = (meta.responses ?? {}) as Record<string | number, unknown>
  const errorSchemas = schemas.errorResponses ?? {}

  const code = (options as { __code?: string }).__code
  const baseDescriptions = new Map<number, string>()
  for (const e of options.defaultErrors ?? [])
    baseDescriptions.set(e.status, e.description)
  if (options.detectCreateError !== false && typeof code === 'string') {
    for (const e of extractErrorStatuses(code)) {
      if (!baseDescriptions.has(e.status))
        baseDescriptions.set(e.status, e.description)
    }
  }

  const descriptionOf = (status: number, fallback: string): string => {
    const m = metaResponses[status]
    if (typeof m === 'string' && m)
      return m
    if (isRecord(m) && typeof m.description === 'string' && m.description)
      return m.description
    const j = jsdocResponses[status]
    if (typeof j === 'string' && j)
      return j
    return baseDescriptions.get(status) ?? fallback
  }

  const exampleMedia = (part: { schema?: unknown, example?: unknown }): Record<string, unknown> | undefined => {
    const media: Record<string, unknown> = {}
    if (part.schema !== undefined)
      media.schema = part.schema
    if (part.example !== undefined)
      media.example = part.example
    return Object.keys(media).length ? { 'application/json': media } : undefined
  }

  const responses: Record<string, unknown> = {}

  // ---- 200 ----
  const meta200 = metaResponses[200]
  if (isRecord(meta200) && 'content' in meta200) {
    // Explicit full response object wins.
    responses['200'] = { description: descriptionOf(200, 'Successful response'), ...meta200 }
  }
  else {
    // Example precedence: openAPIMeta example > `responseExample` export > `@response 200 {…}`.
    const metaExample = isRecord(meta200) ? meta200.example : undefined
    const jsdoc200 = jsdocResponses[200]
    const example200 = metaExample
      ?? schemas.responseExample
      ?? (isRecord(jsdoc200) ? jsdoc200 : undefined)
      ?? (isRecord(meta200) ? meta200 : undefined)
      ?? { ok: true }
    const content = exampleMedia({ schema: schemas.response, example: example200 })
    responses['200'] = {
      description: descriptionOf(200, 'Successful response'),
      ...(content ? { content } : {}),
    }
  }

  // ---- errors ----
  const statuses = new Set<number>([...baseDescriptions.keys(), ...Object.keys(errorSchemas).map(Number)])
  for (const key of [...Object.keys(jsdocResponses), ...Object.keys(metaResponses)]) {
    const n = Number(key)
    if (Number.isInteger(n) && n !== 200)
      statuses.add(n)
  }

  for (const status of [...statuses].sort((a, b) => a - b)) {
    const fallback = status >= 200 && status < 300 ? 'Successful response' : 'Error'
    const metaVal = metaResponses[status]
    if (isRecord(metaVal) && 'content' in metaVal) {
      responses[String(status)] = {
        description: descriptionOf(status, fallback),
        ...metaVal,
      }
      continue
    }
    // Object values (JSDoc `@response 404 {…}` or meta) are examples, not response shapes.
    const metaExample = isRecord(metaVal) ? (metaVal.example ?? metaVal) : undefined
    const jsdocVal = jsdocResponses[status]
    const example = metaExample ?? (isRecord(jsdocVal) ? jsdocVal : undefined)
    const errorPart = errorSchemas[status] ?? {}
    const content = exampleMedia({ ...errorPart, ...(example !== undefined ? { example } : {}) })
    responses[String(status)] = {
      description: descriptionOf(status, fallback),
      ...(content ? { content } : {}),
    }
  }

  return responses
}

/**
 * Build the `defineRouteMeta({ openAPI })` payload for one route file.
 * Pure function — easy to unit test.
 */
export function buildOpenAPI({ id, routesDir, jsdoc, openAPIMeta, schemas, options }: BuildOpenAPIArgs): { openAPI: Record<string, unknown> } {
  const { path: routePath, method, name } = fileToRoute(id, routesDir)
  const meta = openAPIMeta ?? {}

  const tags = resolveTag(routePath, jsdoc, meta, options.tagMap)
  const summary = (meta.summary ?? jsdoc.summary ?? humanize(name === 'index' ? routePath.split('/').filter(Boolean).pop() ?? 'Index' : name)) as string
  const description = buildDescription(jsdoc, meta)
  const operationId = (meta.operationId ?? jsdoc.operationId) as string | undefined
  const deprecated = (meta.deprecated ?? jsdoc.deprecated) as boolean | undefined

  const parameters: Record<string, unknown>[] = []

  // Path params from `:id` segments, enriched from `paramsSchema`
  // (e.g. `z.string().describe('Role id')` flows into description + schema).
  const pathProps = (schemas.params as { properties?: Record<string, Record<string, unknown>> } | undefined)?.properties ?? {}
  for (const m of routePath.matchAll(/:(\w+)\*?/g)) {
    const paramName = m[1] ?? ''
    const prop = pathProps[paramName]
    const { description: propDescription, ...propSchema } = prop ?? {}
    parameters.push({
      name: paramName,
      in: 'path',
      required: true,
      ...(typeof propDescription === 'string' ? { description: propDescription } : {}),
      schema: prop && Object.keys(propSchema).length ? propSchema : { type: 'string' },
    })
  }

  // Query params from query schema (object shapes explode to named params;
  // anything else has no per-name representation and is skipped).
  parameters.push(...(toQueryParameters(schemas.query) as Record<string, unknown>[]))

  // Generic `@param` tags. Entries override auto-detected params with the
  // same `in:name` key (e.g. to document a path param).
  const applyParams = (list: Array<ParsedParam | Record<string, unknown>>) => {
    for (const p of list) {
      // Normalize to a plain record (also drops the strict ParsedParam type
      // so explicit overrides with extra keys merge cleanly).
      const param: Record<string, unknown> = { ...p }
      const key = `${String(param.in)}:${String(param.name)}`
      if (param.in === 'path')
        param.required = true
      const idx = parameters.findIndex(existing => `${String(existing.in)}:${String(existing.name)}` === key)
      if (idx === -1)
        parameters.push(param)
      else
        parameters[idx] = { ...parameters[idx], ...param }
    }
  }
  applyParams([...(jsdoc.params ?? [])])
  // Explicit `openAPIMeta.parameters` win on key conflicts.
  if (Array.isArray(meta.parameters))
    applyParams(meta.parameters as Array<Record<string, unknown>>)

  // `@paramExample <name> <value>` (+ `openAPIMeta.paramExamples`) attaches
  // `example` to every parameter with that name. Explicit `example` on the
  // parameter object itself always wins.
  const paramExamples = {
    ...(jsdoc.paramExamples ?? {}),
    ...((meta.paramExamples as Record<string, unknown> | undefined) ?? {}),
  }
  if (Object.keys(paramExamples).length) {
    for (const p of parameters) {
      if (typeof p.name === 'string'
        && p.example === undefined
        && paramExamples[p.name] !== undefined)
        p.example = paramExamples[p.name]
    }
  }

  // Request body (only meaningful for mutating verbs; the schema may be any
  // JSON Schema — object, array, primitive).
  // Example precedence: openAPIMeta.example > `bodyExample` export > `@example`.
  // Description precedence: openAPIMeta.requestBody.description > `@bodyDescription`.
  let requestBody: Record<string, unknown> | undefined
  if (schemas.body && ['post', 'put', 'patch'].includes(method)) {
    const example = (meta.example ?? schemas.bodyExample ?? jsdoc.example) as unknown
    const bodyDescription = ((meta.requestBody as Record<string, unknown> | undefined)?.description
      ?? meta.bodyDescription
      ?? jsdoc.bodyDescription) as string | undefined
    requestBody = {
      ...(bodyDescription ? { description: bodyDescription } : {}),
      required: true,
      content: {
        'application/json': {
          schema: schemas.body,
          ...(example !== undefined ? { example } : {}),
        },
      },
    }
  }
  if (meta.requestBody && typeof meta.requestBody === 'object') {
    const override = meta.requestBody as Record<string, unknown>
    requestBody = {
      ...(requestBody ?? {}),
      ...override,
      ...(requestBody?.content && override.content
        ? {
            content: {
              ...(requestBody.content as Record<string, unknown>),
              ...(override.content as Record<string, unknown>),
            },
          }
        : {}),
    }
  }

  const responses = buildResponses({ jsdoc, meta, schemas, options })

  const openAPI: Record<string, unknown> = {
    tags,
    summary,
    ...(description ? { description } : {}),
    ...(operationId ? { operationId } : {}),
    ...(deprecated ? { deprecated } : {}),
    ...(parameters.length ? { parameters } : {}),
    ...(requestBody ? { requestBody } : {}),
    responses,
  }

  const security = (meta.security ?? jsdoc.security) as string[] | undefined
  if (security?.length)
    openAPI.security = security.map(s => ({ [s]: [] }))

  return { openAPI }
}

export { extractErrorStatuses }
