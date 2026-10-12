import type { TagItem } from './types'
import { css, html, LitElement, nothing } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { readItemsFromChildren, sortTagItems } from './utils'

/**
 * `<tags-list>` — sorted tag links in Shadow DOM. Hydrates from light-DOM
 * `<a>` children (kept as a no-JS fallback); {@link setItems} replaces the
 * list imperatively (search page).
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

    .joh-tag {
      display: inline-flex;
      align-items: baseline;
      column-gap: 0.1em;
    }

    .joh-tag::before {
      content: var(--joh-header-anchor-symbol);
      color: var(--joh-c-text-muted);
      font-weight: 500;
      user-select: none;
      text-decoration: none;
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

  /** Replace the rendered tag list (called by the search page). */
  setItems(items: TagItem[]): void {
    this.items = items
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
    return html`
      <a
        class="joh-tag mr-2 font-700 text-inherit no-underline"
        href=${item.href || '#'}
        title=${item.name}
      >
        <span>${item.name}</span>
      </a>
    `
  }
}
