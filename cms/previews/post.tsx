import type { PreviewProps } from '../adapters'
import { getField, resolveAsset, toArray } from '../adapters'
import { PostHero, PreviewPage } from '../components'
import { h } from '../runtime'
import { DEFAULT_COVER } from '../shared'

export function PostPreview({ entry, getAsset, widgetFor }: PreviewProps) {
  const title = getField(entry, 'title', '')
  const coverPath = getField(entry, ['extra', 'cover'], '')
  const cover = resolveAsset(coverPath || DEFAULT_COVER, getAsset)

  return (
    <PreviewPage
      hasAside
      hero={(
        <PostHero
          title={title}
          description={getField(entry, 'description', '')}
          date={getField(entry, 'date', '')}
          cover={cover}
          coverAlt={getField(entry, ['extra', 'cover_alt'], title)}
          authors={toArray(getField(entry, ['taxonomies', 'author'], null))}
          tags={toArray(getField(entry, ['taxonomies', 'tags'], null))}
        />
      )}
      body={<article>{widgetFor('body')}</article>}
    />
  )
}
