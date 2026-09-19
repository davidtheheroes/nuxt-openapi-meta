export interface ParsedSchemas {
  body?: Record<string, unknown>
  query?: Record<string, unknown>
  params?: Record<string, unknown>
  response?: Record<string, unknown>
  /** Per-status error DTOs: status code → JSON Schema (or example fallback). */
  errorResponses?: Record<number, Record<string, unknown>>
  /** Plain-object examples (no conversion, passed through as-is). */
  bodyExample?: unknown
  responseExample?: unknown
}

export interface LoadedRouteModule {
  schemas: ParsedSchemas
  /** Merged `export const openAPIMeta = {...}` override, if present */
  openAPIMeta?: Record<string, unknown>
}

const SCHEMA_EXPORT_NAMES = {
  body: ['bodySchema', 'body_schema'],
  query: ['querySchema', 'query_schema'],
  params: ['paramsSchema', 'params_schema', 'paramSchema'],
  response: ['responseSchema', 'response_schema'],
} as const

const EXAMPLE_EXPORT_NAMES = {
  bodyExample: ['bodyExample', 'body_example'],
  responseExample: ['responseExample', 'response_example'],
} as const

const ERROR_EXPORT_NAMES = ['errorResponses', 'error_responses', 'errorSchemas', 'error_schemas'] as const

function pickExport(mod: Record<string, unknown>, candidates: readonly string[]): unknown {
  for (const name of candidates) {
    if (mod[name] !== undefined)
      return mod[name]
  }
  return undefined
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/**
 * Convert a Zod (v3/v4) or Valibot schema instance to JSON Schema.
 * Returns `undefined` when the value is not a recognizable schema
 * or conversion fails (never throws).
 */
export async function convertToJsonSchema(schema: unknown): Promise<Record<string, unknown> | undefined> {
  if (!isObject(schema))
    return undefined

  // 1. Zod v4 instance method: schema.toJSONSchema()
  try {
    const maybeFn = (schema as { toJSONSchema?: unknown }).toJSONSchema
    if (typeof maybeFn === 'function') {
      const out = (maybeFn as (p?: unknown) => unknown).call(schema, { unrepresentable: 'any' })
      if (isObject(out))
        return out as Record<string, unknown>
    }
  }
  catch { /* fall through */ }

  // 2. Zod v4 static: z.toJSONSchema(schema) — uses our bundled zod v4
  try {
    const zod = await import('zod').catch(() => undefined) as unknown as { toJSONSchema?: (s: unknown, o?: unknown) => unknown } | undefined
    if (zod?.toJSONSchema) {
      const out = zod.toJSONSchema(schema, { unrepresentable: 'any' })
      if (isObject(out))
        return out as Record<string, unknown>
    }
  }
  catch { /* fall through to v3 converter */ }

  // 3. Zod v3 via `zod-to-json-schema` (also tolerates v4 shapes)
  try {
    const { zodToJsonSchema } = await import('zod-to-json-schema')
    const out = (zodToJsonSchema as (s: unknown) => unknown)(schema)
    if (isObject(out))
      return out as Record<string, unknown>
  }
  catch { /* not a zod schema */ }

  // 4. Valibot via `@valibot/to-json-schema`
  try {
    const { toJsonSchema } = await import('@valibot/to-json-schema') as unknown as { toJsonSchema: (s: never) => unknown }
    const out = toJsonSchema(schema as never)
    if (isObject(out))
      return out as Record<string, unknown>
  }
  catch { /* not a valibot schema */ }

  return undefined
}

export interface JitiLike {
  import: (id: string) => Promise<unknown>
}

/**
 * Load a route file with jiti and extract exported schemas.
 * `mod` is the already-imported route module (imported by the caller
 * with jiti so this module stays free of jiti side-effects).
 *
 * Conventions (all optional):
 * - `bodySchema` / `querySchema` / `paramsSchema` / `responseSchema`
 * - `bodyExample` / `responseExample` — plain JSON-able values
 * - `errorResponses = { 404: NotFoundDto, ... }` — Zod/Valibot schemas
 *   (converted to JSON Schema) or plain example objects
 * - `openAPIMeta` — raw override object (highest precedence)
 */
export async function loadRouteSchemas(
  mod: Record<string, unknown>,
): Promise<LoadedRouteModule> {
  const schemas: ParsedSchemas = {}

  const body = pickExport(mod, SCHEMA_EXPORT_NAMES.body)
  const query = pickExport(mod, SCHEMA_EXPORT_NAMES.query)
  const params = pickExport(mod, SCHEMA_EXPORT_NAMES.params)
  const response = pickExport(mod, SCHEMA_EXPORT_NAMES.response)

  const [b, q, p, r] = await Promise.all([
    body ? convertToJsonSchema(body) : Promise.resolve(undefined),
    query ? convertToJsonSchema(query) : Promise.resolve(undefined),
    params ? convertToJsonSchema(params) : Promise.resolve(undefined),
    response ? convertToJsonSchema(response) : Promise.resolve(undefined),
  ])

  if (b)
    schemas.body = b
  if (q)
    schemas.query = q
  if (p)
    schemas.params = p
  if (r)
    schemas.response = r

  const bodyExample = asExampleValue(pickExport(mod, EXAMPLE_EXPORT_NAMES.bodyExample))
  const responseExample = asExampleValue(pickExport(mod, EXAMPLE_EXPORT_NAMES.responseExample))
  if (bodyExample !== undefined)
    schemas.bodyExample = bodyExample
  if (responseExample !== undefined)
    schemas.responseExample = responseExample

  const errorResponses = await loadErrorResponses(pickExport(mod, ERROR_EXPORT_NAMES))
  if (errorResponses)
    schemas.errorResponses = errorResponses

  const openAPIMeta = isObject(mod.openAPIMeta) ? (mod.openAPIMeta as Record<string, unknown>) : undefined

  return { schemas, openAPIMeta }
}

/** Pass through plain JSON-able values (objects, arrays, primitives). */
function asExampleValue(value: unknown): unknown | undefined {
  if (value === undefined || typeof value === 'function')
    return undefined
  try {
    return JSON.parse(JSON.stringify(value))
  }
  catch {
    return undefined
  }
}

/**
 * Normalize `export const errorResponses = { 404: SomeDto, ... }`.
 * Each value is converted to JSON Schema when it is a Zod/Valibot schema;
 * otherwise a plain JSON-able object is kept as `{ example }` content.
 */
async function loadErrorResponses(value: unknown): Promise<Record<number, Record<string, unknown>> | undefined> {
  if (!isObject(value))
    return undefined
  const entries = await Promise.all(
    Object.entries(value).map(async ([status, dto]) => {
      const code = Number(status)
      if (!Number.isInteger(code))
        return undefined
      const schema = await convertToJsonSchema(dto)
      if (schema)
        return [code, { schema }] as const
      const example = asExampleValue(dto)
      if (example !== undefined)
        return [code, { example }] as const
      return undefined
    }),
  )
  const out: Record<number, Record<string, unknown>> = {}
  for (const e of entries) {
    if (e)
      out[e[0]] = e[1]
  }
  return Object.keys(out).length ? out : undefined
}

/**
 * Statically detect `readValidatedBody(event, X)` / `getValidatedQuery` /
 * `getValidatedRouterParams` references so we can warn when the referenced
 * export cannot be resolved to a schema. Handles Zod (`X.parse`), Valibot
 * (`v.parse(X, …)`) and arrow wrappers (`(d) => v.parse(X, d)`).
 */
export function detectSchemaRefs(code: string): { body?: string, query?: string, params?: string } {
  return {
    body: extractValidator(code, 'readValidatedBody'),
    query: extractValidator(code, 'getValidatedQuery'),
    params: extractValidator(code, 'getValidatedRouterParams'),
  }
}

function extractValidator(code: string, fn: string): string | undefined {
  const arrow = `(?:\\([^)]*\\)|[\\w$]+)\\s*=>\\s*`
  const patterns = [
    // (d) => v.parse(Schema, d)  |  d => v.parse(Schema, d)  (comma required)
    new RegExp(`${fn}\\s*\\(\\s*event\\s*,\\s*${arrow}\\w+\\.parse\\(\\s*([\\w$]+)\\s*,`),
    // (d) => Schema.parse(d)
    new RegExp(`${fn}\\s*\\(\\s*event\\s*,\\s*${arrow}([\\w$]+)\\.parse\\b`),
    // v.parse(Schema, …) (comma required)
    new RegExp(`${fn}\\s*\\(\\s*event\\s*,\\s*\\w+\\.parse\\(\\s*([\\w$]+)\\s*,`),
    // Schema  |  Schema.parse
    new RegExp(`${fn}\\s*\\(\\s*event\\s*,\\s*([\\w$]+)`),
  ]
  for (const re of patterns) {
    const m = code.match(re)
    // Skip bare namespace captures (`v`) and arrow heads (`(data`).
    if (m?.[1] && !m[1].startsWith('(') && m[1] !== 'v')
      return m[1]
  }
  return undefined
}
