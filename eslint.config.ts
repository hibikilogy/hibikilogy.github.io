import antfu from '@antfu/eslint-config'

export default antfu({
  unocss: true,
  pnpm: true,
  typescript: true,
  react: true,
  ignores: [
    '**/*.md',
    '**/*.yaml',
    '**/*.yml',
    '**/dist',
    '**/node_modules',
    '**/public',
    '**/temp',
    '**/cache',
    'themes/hibikilogy/static/**',
    'static/admin/admin.js',
    'static/admin/admin.js.map',
    'static/admin/index.html',
  ],
  formatters: {
    css: true,
  },
  stylistic: {
    indent: 2,
    quotes: 'single',
    jsx: false,
  },

  rules: {
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'warn',
  },

  overrides: {
    javascript: {
      'no-console': 'warn',
      'default-param-last': 'error',
    },
    typescript: {
      'ts/no-explicit-any': 'warn',

      // 禁止未使用的值
      'ts/no-unused-vars': [
        'warn',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
    toml: {
      'toml/padding-line-between-pairs': 'warn',
    },
  },
}, {
  files: ['themes/hibikilogy/src/ui/**/*.ts'],
  rules: {
    'react/rules-of-hooks': 'off',
    'react/no-unnecessary-use-prefix': 'off',
    'react/purity': 'off',
  },
}, {
  files: ['static/admin/**/*.{js,jsx,ts,tsx,html}', 'cms/**/*.tsx'],
  rules: {
    'unused-imports/no-unused-imports': 'off',
    'ts/no-unused-vars': 'off',
  },
})
