import type { PreviewProps } from '../adapters'
import { getField, resolveAsset } from '../adapters'
import { AuthorHero, PreviewPage } from '../components'
import { h } from '../runtime'
import { DEFAULT_AVATAR } from '../shared'

export function AuthorsPreview({ entry, getAsset }: PreviewProps) {
  const avatarPath = getField(entry, 'avatar', DEFAULT_AVATAR)

  return (
    <PreviewPage
      hero={(
        <AuthorHero
          title={getField(entry, 'title', '作者名')}
          bio={getField(entry, 'bio', '我是座右铭')}
          avatar={resolveAsset(avatarPath, getAsset)}
          link={getField(entry, 'link', 'blog.blogger.com')}
        />
      )}
    />
  )
}
