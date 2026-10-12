// adapted from https://stackoverflow.com/a/46432113/11613622

export class LRUCache<K, V> {
  private max: number
  private cache: Map<K, V>

  constructor(max: number = 10) {
    this.max = max
    this.cache = new Map<K, V>()
  }

  get size(): number {
    return this.cache.size
  }

  get(key: K): V | undefined {
    const item = this.cache.get(key)
    if (item !== undefined) {
      this.cache.delete(key)
      this.cache.set(key, item)
    }
    return item
  }

  set(key: K, val: V): void {
    if (this.cache.has(key))
      this.cache.delete(key)
    else if (this.cache.size === this.max)
      this.cache.delete(this.first()!)
    this.cache.set(key, val)
  }

  has(key: K): boolean {
    return this.cache.has(key)
  }

  delete(key: K): void {
    this.cache.delete(key)
  }

  first(): K | undefined {
    return this.cache.keys().next().value
  }

  entries(): IterableIterator<[K, V]> {
    return this.cache.entries()
  }

  clear(): void {
    this.cache.clear()
  }
}
