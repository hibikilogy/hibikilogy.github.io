import antfu from '@antfu/eslint-config'

export default antfu({
  unocss: true,
  pnpm: true,
  typescript: true,
  ignores: [
    '**/*.md',
    '**/*.yaml',
    '**/*.yml',
    '**/dist',
    '**/node_modules',
    '**/public',
    '**/temp',
    '**/cache',
    '**/static',
  ],
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
})
