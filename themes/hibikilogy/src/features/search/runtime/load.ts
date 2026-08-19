const jsonIndexPromises = new Map<string, Promise<unknown>>()

export function fetchJsonIndex<T = unknown>(url: string): Promise<T> {
  if (!jsonIndexPromises.has(url)) {
    const pending = fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load ${url}`)
        }
        return response.json()
      })
      .catch((error) => {
        jsonIndexPromises.delete(url)
        throw error
      })

    jsonIndexPromises.set(url, pending)
  }

  return jsonIndexPromises.get(url) as Promise<T>
}
