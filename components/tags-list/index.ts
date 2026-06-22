import type { TagItem } from './types'
import { css, html, LitElement, nothing } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { readItemsFromChildren, sortTagItems } from './utils'

/**
 * `<tags-list>` — a sorted list of tag links, rendered into Shadow DOM.
 *
 * On connect it hydrates from any server-rendered light-DOM `<a>` children
 * (footer tags), re-renders them sorted into the shadow root, and leaves the
 * original anchors in place as a no-JS fallback. {@link setItems} replaces the
 * list imperatively — used by `static/js/search/related-tags.js`.
 */
@customElement('tags-list')
export class TagsList extends LitElement {
  static override readonly styles = css`
    @unocss-placeholder

    :host {
      display: block;
      font: inherit;
      color: inherit;
      line-height: inherit;
    }
  `

  @state()
  private items: TagItem[] = []

  override connectedCallback(): void {
    super.connectedCallback()

    // Hydrate from light-DOM children only when no items were set imperatively
    // (e.g. the footer instance). The search instance starts empty and is fed
    // via setItems().
    const hydrated = readItemsFromChildren(this)
    if (hydrated.length > 0) {
      this.items = hydrated
    }
  }

  /** Replace the rendered tag list (called by search/related-tags.js). */
  setItems(items: TagItem[]): void {
    this.items = Array.isArray(items) ? items : []
  }

  override render() {
    const sorted = sortTagItems(this.items)
    this.hidden = sorted.length === 0

    if (sorted.length === 0)
      return nothing

    return html`
      <div class="flex flex-wrap justify-start gap-y-2">
        ${sorted.map(item => this.renderTag(item))}
      </div>
    `
  }

  private renderTag(item: TagItem) {
    const count = item.count

    return html`
      <a
        class="joh-tag mr-2 font-700 text-inherit no-underline"
        href=${item.href || '#'}
        target="_blank"
        title=${item.name}
      >
        <span>${item.name}</span>
        ${typeof count === 'number' && Number.isFinite(count) && count > 0
          ? html`<span class="hidden text-[0.8rem] text-[var(--footer-directory-title-color)]">
              ${String(count)}
            </span>`
          : nothing}
      </a>
    `
  }
}

// Re-export so `search/tags.js`'s `import { sortTagItems } from '../components/tags-list.js'`
// keeps resolving after the Vite build.
export { sortTagItems }
export type { TagItem }
