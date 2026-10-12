/** Page-level DOM selectors shared across features. */
export const pageDom = {
  app: '#app',
  article: '.content-container > article',
  /** Article content wrapper; shared with outline heading queries. */
  content: '.content-container',
  hero: '.Hero',
  journal: '.Journal',
  search: '#search',
} as const
