import type { PreviewProps } from '../adapters'
import { getField } from '../adapters'
import { PreviewPage, SimpleHero } from '../components'
import { h } from '../runtime'

export function DocsPreview({ entry, widgetFor }: PreviewProps) {
  const title = getField(entry, 'title', '')

  return (
    <PreviewPage
      hero={<SimpleHero title={title} />}
      body={<article>{widgetFor('body')}</article>}
    />
  )
}
