import { AuthorsPreview } from './previews/authors'
import { DocsPreview } from './previews/docs'
import { PostPreview } from './previews/post'
import { CMS } from './runtime'
import { PREVIEW_FONT_STYLES } from './shared'
import 'virtual:uno.css'
import './preview.css'

registerPreviewStyles()
PREVIEW_FONT_STYLES.forEach(style => CMS.registerPreviewStyle(style))

CMS.registerPreviewTemplate('posts', PostPreview)
CMS.registerPreviewTemplate('docs', DocsPreview)
CMS.registerPreviewTemplate('authors', AuthorsPreview)

void CMS.init()

function registerPreviewStyles(): void {
  if (!import.meta.env.DEV) {
    CMS.registerPreviewStyle('/admin/admin.css')
    return
  }

  const styles = [...document.querySelectorAll<HTMLStyleElement>('style[data-vite-dev-id]')]
    .map(style => style.textContent ?? '')
    .filter(Boolean)

  if (!styles.length) {
    throw new Error('Vite did not inject the CMS preview stylesheets')
  }

  CMS.registerPreviewStyle(styles.join('\n'), { raw: true })
}

if (import.meta.hot) {
  import.meta.hot.accept([
    'virtual:uno.css',
    './preview.css',
  ], () => window.location.reload())
}
