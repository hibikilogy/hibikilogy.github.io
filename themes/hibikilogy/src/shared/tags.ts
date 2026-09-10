interface SortableTagItem {
  name: string
  count?: number | null
}

export function sortTagItems<T extends SortableTagItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.count !== b.count)
      return (b.count ?? 0) - (a.count ?? 0)
    return String(a.name).localeCompare(String(b.name), 'zh-Hans-CN')
  })
}
