import type { createElement } from 'react'
// Isolate the React-compatible runtime exposed by Sveltia CMS.
import CMS from '@sveltia/cms'

interface CmsWindow extends Window {
  h?: typeof createElement
}

const cmsWindow = window as CmsWindow

if (!cmsWindow.h) {
  throw new Error('Sveltia CMS did not expose its React-compatible JSX runtime')
}

export const h = cmsWindow.h
export { CMS }
