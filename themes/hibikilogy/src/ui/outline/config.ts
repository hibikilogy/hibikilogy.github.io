import { pageDom } from 'shared/selectors.ts'

export const outlineDom = {
  root: '.AsideOutline',
  marker: '.outline-marker',
  link: '.outline-link',
  headings: `${pageDom.content} :where(h1,h2)`,
} as const
