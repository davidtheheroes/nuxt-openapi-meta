export type ParamLocation = 'query' | 'header' | 'path' | 'cookie'

export interface ParsedParam {
  name: string
  in: ParamLocation
  required: boolean
  schema: { type: string }
  description?: string
}

export interface JSDocMeta {
  tag?: string
  tags?: string[]
  summary?: string
  description?: string
  /** Description for the request body (`requestBody.description`). */
  bodyDescription?: string
  /** Generic parameters from `@param` tags (project-agnostic). */
  params?: ParsedParam[]
  deprecated?: boolean
  operationId?: string
  security?: string[]
  responses?: Record<number, unknown>
  example?: unknown
  [key: string]: unknown
}

function tryJSON(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed)
    return trimmed
  // Allow single quotes as a convenience
  const normalized = trimmed.replace(/'/g, '"')
  try {
    return JSON.parse(trimmed)
  }
  catch {
    try {
      return JSON.parse(normalized)
    }
    catch {
      return trimmed
    }
  }
}

function parseBool(value: string): boolean {
  return /^(?:true|1|yes|deprecated)$/i.test(value.trim())
}

const PARAM_LOCATIONS: ParamLocation[] = ['query', 'header', 'path', 'cookie']

const PARAM_TYPE_ALIASES: Record<string, string> = {
  string: 'string',
  str: 'string',
  number: 'number',
  int: 'integer',
  integer: 'integer',
  bool: 'boolean',
  boolean: 'boolean',
  array: 'array',
  object: 'object',
}

/**
 * Parse a generic parameter tag value (the part after `@param`):
 * `<in> <name>[:type] [required|optional] [description…]`
 *
 * @example `header x-request-id optional Idempotency key`
 * @example `query limit:number required Max items`
 */
export function parseParam(value: string): ParsedParam | undefined {
  const tokens = value.split(/\s+/).filter(Boolean)
  if (tokens.length < 2)
    return undefined
  let location = (tokens[0] ?? '').toLowerCase()
  if (location.endsWith('s'))
    location = location.slice(0, -1)
  if (!PARAM_LOCATIONS.includes(location as ParamLocation))
    return undefined

  const [rawName, rawType] = (tokens[1] ?? '').split(':')
  if (!rawName)
    return undefined
  const type = (rawType ? PARAM_TYPE_ALIASES[rawType.toLowerCase()] : undefined) ?? 'string'

  let required = false
  let descStart = 2
  const flag = (tokens[2] ?? '').toLowerCase()
  if (flag === 'required' || flag === 'optional') {
    required = flag === 'required'
    descStart = 3
  }
  const description = tokens.slice(descStart).join(' ') || undefined

  return {
    name: rawName,
    in: location as ParamLocation,
    required,
    schema: { type },
    ...(description ? { description } : {}),
  }
}

/**
 * Parse the first JSDoc block found before the route handler export.
 *
 * Supported annotations (backticked so no tooling mistakes them for this
 * function's own doc tags — especially `@deprecated`):
 *   `@tag` Auth | `@tags` Auth, User
 *   `@summary` ... | `@description` ...
 *   `@bodyDescription` ... (requestBody.description)
 *   `@param` header x-request-id optional Idempotency key
 *   `@param` query limit:number required Max items
 *   `@security` bearerAuth | `@security` a, b
 *   `@response` 200 { ... } | `@response` 409 Email already exists
 *   `@example` { ... }
 *   `@operationId` foo | `@deprecated` true
 */
export function parseJSDoc(code: string): JSDocMeta {
  // Grab the first /** ... */ block (usually at the top of the file).
  // Fall back to a block directly above `export default`.
  const firstBlock = code.match(/\/\*\*([\s\S]*?)\*\//)
  if (!firstBlock)
    return {}

  const body = firstBlock[1] ?? ''
  const meta: JSDocMeta = {}
  const responses: Record<number, unknown> = {}

  for (const raw of body.split('\n')) {
    // Avoid backtracking-prone regexes: strip leading `*` manually.
    const line = raw.trim().replace(/^\* ?/, '')
    if (!line.startsWith('@'))
      continue
    const spaceIdx = line.indexOf(' ')
    const key = spaceIdx === -1 ? line.slice(1) : line.slice(1, spaceIdx)
    const value = spaceIdx === -1 ? '' : line.slice(spaceIdx + 1).trim()
    switch (key) {
      case 'tag':
        meta.tag = value
        break
      case 'tags':
        meta.tags = value.split(/[,;]/).map(s => s.trim()).filter(Boolean)
        break
      case 'summary':
        meta.summary = value
        break
      case 'description':
        meta.description = meta.description ? `${meta.description}\n${value}` : value
        break
      case 'bodyDescription':
      case 'bodydescription':
        meta.bodyDescription = value
        break
      case 'param':
      case 'params': {
        const param = parseParam(value)
        if (param) {
          meta.params ??= []
          meta.params.push(param)
        }
        break
      }
      case 'deprecated':
        meta.deprecated = value ? parseBool(value) : true
        break
      case 'operationId':
      case 'operationid':
        meta.operationId = value
        break
      case 'security':
        meta.security = value.split(',').map(s => s.trim()).filter(Boolean)
        break
      case 'response':
      case 'responses': {
        const gap = value.indexOf(' ')
        if (gap > 0) {
          const code = Number(value.slice(0, gap))
          const rest = value.slice(gap + 1).trim()
          if (Number.isInteger(code) && rest)
            responses[code] = tryJSON(rest)
        }
        break
      }
      case 'example':
      case 'examples':
        meta.example = tryJSON(value)
        break
      default:
        break
    }
  }

  if (Object.keys(responses).length)
    meta.responses = responses

  return meta
}
