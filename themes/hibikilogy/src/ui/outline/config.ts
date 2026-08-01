import { pageDom } from 'shared/selectors.ts'

export const outlineDom = {
  root: '.AsideOutline',
  marker: '.outline-marker',
  link: '.outline-link',
  headings: `${pageDom.content} :where(h1,h2,h3,h4,h5,h6)`,
} as const
