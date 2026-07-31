const jsonIndexPromises = new Map<string, Promise<unknown>>()

export { normalizeSearchUrl } from '../utils.ts'

export function fetchJsonIndex<T = unknown>(url: string): Promise<T> {
  if (!jsonIndexPromises.has(url)) {
    const pending = fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load ${url}`)
        }
        return response.text()
      })
      .then(text => parseJsonIndex(text) as T)
      .catch((error) => {
        jsonIndexPromises.delete(url)
        throw error
      })

    jsonIndexPromises.set(url, pending)
  }

  return jsonIndexPromises.get(url) as Promise<T>
}

export function parseJsonIndex(text: string): unknown {
  try {
    return JSON.parse(text)
  }
  catch (error) {
    const trimmed = String(text).trim()
    const jsonEnd = findJsonValueEnd(trimmed)

    if (jsonEnd === -1) {
      throw error
    }

    return JSON.parse(trimmed.slice(0, jsonEnd))
  }
}

function findJsonValueEnd(text: string): number {
  const opening = text[0]
  const closing = opening === '[' ? ']' : opening === '{' ? '}' : ''
  if (!closing)
    return -1

  let depth = 0
  let inString = false
  let isEscaped = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (inString) {
      if (isEscaped) {
        isEscaped = false
      }
      else if (char === '\\') {
        isEscaped = true
      }
      else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
    }
    else if (char === opening) {
      depth += 1
    }
    else if (char === closing) {
      depth -= 1
      if (depth === 0)
        return index + 1
    }
  }

  return -1
}
