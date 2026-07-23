import { describe, expect, it } from 'vitest'
import { mountAccordions } from './accordion.ts'

describe('mountAccordions', () => {
  it('removes article listeners when the page scope is disposed', () => {
    const root = document.createElement('main')
    root.innerHTML = `
      <div data-accordion data-accordion-collapsible="true">
        <details data-accordion-item data-value="first">
          <summary>First</summary>
        </details>
      </div>
    `
    const item = root.querySelector('details')
    const summary = root.querySelector('summary')
    if (!item || !summary)
      throw new Error('Invalid accordion fixture')

    const dispose = mountAccordions(root)
    const handledEvent = new MouseEvent('click', { bubbles: true, cancelable: true })
    summary.dispatchEvent(handledEvent)
    expect(handledEvent.defaultPrevented).toBe(true)
    expect(item.open).toBe(true)

    dispose()
    item.open = false
    const nativeEvent = new MouseEvent('click', { bubbles: true, cancelable: true })
    summary.dispatchEvent(nativeEvent)
    expect(nativeEvent.defaultPrevented).toBe(false)
  })

  it('treats an unquoted default value as a literal', () => {
    const root = document.createElement('main')
    root.innerHTML = `
      <div data-accordion data-accordion-default-value="second">
        <details data-accordion-item data-value="first">
          <summary>First</summary>
        </details>
        <details data-accordion-item data-value="second">
          <summary>Second</summary>
        </details>
      </div>
    `

    const dispose = mountAccordions(root)
    const items = root.querySelectorAll('details')
    expect([...items].map(item => item.open)).toEqual([false, true])
    dispose()
  })
})
