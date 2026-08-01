export function shouldIgnoreKeyEvent(event: KeyboardEvent): boolean {
  return event.defaultPrevented || event.isComposing || event.altKey
}

export function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.isContentEditable
    || ['input', 'textarea', 'select'].includes(target.tagName.toLowerCase())
  )
}
