import type { Preset } from 'unocss'

export function presetHibikilogyComponents(): Preset {
  return {
    name: 'hibikilogy-components',
    preflights: [
      {
        getCSS: () => `
          .joh-tag::before {
            content: var(--joh-header-anchor-symbol);
            color: var(--footer-directory-title-color);
            font-weight: 500;
            user-select: none;
            text-decoration: none;
          }
        `,
      },
    ],
  }
}
