import { catchError } from '../../shared/result.ts'

function normalizeAccordionDefaultValue(rawValue: string | undefined): string[] {
  if (!rawValue)
    return []

  const [parsed, error] = catchError<unknown>(() => JSON.parse(rawValue))
  if (error)
    return [rawValue]
  return Array.isArray(parsed) ? parsed.map(String) : [String(parsed)]
}

function applyAccordionState(root: HTMLElement, targetItem: HTMLDetailsElement, nextOpenState: boolean): void {
  const items = [...root.querySelectorAll<HTMLDetailsElement>('[data-accordion-item]')]
  const accordionType = root.dataset.accordionType || 'single'
  const isCollapsible = root.dataset.accordionCollapsible === 'true'

  if (!nextOpenState && !isCollapsible) {
    const openItems = items.filter(item => item.open)
    if (openItems.length === 1 && openItems[0] === targetItem)
      return
  }

  if (nextOpenState && accordionType === 'single') {
    for (const item of items) {
      if (item !== targetItem)
        item.open = false
    }
  }

  targetItem.open = nextOpenState
}

export function mountAccordions(root: ParentNode): () => void {
  const controller = new AbortController()
  const accordions = root.querySelectorAll<HTMLElement>('[data-accordion]')

  for (const root of accordions) {
    const items = [...root.querySelectorAll<HTMLDetailsElement>('[data-accordion-item]')]
    if (!items.length)
      continue

    const accordionType = root.dataset.accordionType || 'single'
    const defaultValues = normalizeAccordionDefaultValue(root.dataset.accordionDefaultValue)

    for (const item of items) {
      const value = item.dataset.value || ''
      item.open = defaultValues.includes(value)
    }

    if (accordionType === 'single' && !items.some(item => item.open) && root.dataset.accordionCollapsible !== 'true') {
      items[0].open = true
    }

    for (const item of items) {
      const summary = item.querySelector('summary')
      if (!(summary instanceof HTMLElement))
        continue

      summary.addEventListener('click', (event) => {
        event.preventDefault()
        applyAccordionState(root, item, !item.open)
      }, { signal: controller.signal })
    }
  }

  return () => controller.abort()
}
