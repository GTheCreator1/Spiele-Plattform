export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
}

export function need(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new HttpError(status, message)
}

export async function readBody(request: Request) {
  const reader = request.body?.getReader()
  need(reader, 'Das Formular ist leer.')
  let length = 0
  let body = ''
  const decoder = new TextDecoder()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > 8192) {
        await reader.cancel()
        throw new HttpError(413, 'Die Anfrage ist zu groß.')
      }
      body += decoder.decode(value, { stream: true })
    }
    return body + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  need(request.headers.get('content-type')?.startsWith('application/json'), 'JSON-Anfrage erforderlich.', 415)
  const body = await readBody(request)
  let data: unknown
  try {
    data = JSON.parse(body)
  } catch {
    throw new HttpError(400, 'Ungültige Anfrage.')
  }
  need(data && typeof data === 'object' && !Array.isArray(data), 'Ungültige Anfrage.')
  return data as Record<string, unknown>
}

export const tokenPattern = /^[a-f0-9]{64}$/
export const idPattern = /^[a-f0-9-]{36}$/

export function randomToken(bytes = 32) {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)))
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function digest(value: string) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
}

export function equalHex(first: string, second: string) {
  let difference = first.length ^ second.length
  for (let index = 0; index < first.length; index++) {
    difference |= first.charCodeAt(index) ^ (second.charCodeAt(index) || 0)
  }
  return difference === 0
}
