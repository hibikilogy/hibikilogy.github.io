const jsonIndexPromises = new Map<string, Promise<unknown>>()

export function fetchJsonIndex<T = unknown>(url: string): Promise<T> {
  if (!jsonIndexPromises.has(url)) {
    const pending = fetch(url)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load ${url}`)
        }
        return parseJsonIndex<T>(await response.text())
      })
      .catch((error) => {
        jsonIndexPromises.delete(url)
        throw error
      })

    jsonIndexPromises.set(url, pending)
  }

  return jsonIndexPromises.get(url) as Promise<T>
}

function parseJsonIndex<T>(text: string): T {
  try {
    return JSON.parse(text) as T
  }
  catch (error) {
    const scriptAt = text.indexOf('<script')
    if (scriptAt !== -1)
      return JSON.parse(text.slice(0, scriptAt)) as T
    throw error
  }
}
