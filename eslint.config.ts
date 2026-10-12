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

    // 文件名统一 camelCase（目录使用 kebab-case；非代码文件除外——
    // CSS/toml/json 等沿用各自生态惯例，如 Cargo.toml、*.css）
    'unicorn/filename-case': [
      'error',
      {
        cases: {
          camelCase: true,
        },
        ignore: [
          '^(short-link-reservations|artifact-rewrite)',
          '\\.(?:css|toml|json|md|svg|png|jpe?g|webp|gif|woff2?|ttf|otf|eot|ico|yaml|yml|html)$',
        ],
      },
    ],
  },

  overrides: {
    javascript: {
      'no-console': 'warn',
      'default-param-last': 'error',
    },
    typescript: {
      'ts/no-explicit-any': 'warn',

      // 命名约定：变量/函数 camelCase，魔法常量 UPPER_SNAKE，
      // 类型 PascalCase。豁免：含 `/` 的键（构建输入/测试路径）、
      // `__` 前缀（Node 全局惯例）、JSX 组件函数 PascalCase、
      // 镜像外部 API 的类型属性名（Intl.Segmenter 等）。
      'ts/naming-convention': [
        'error',
        {
          selector: 'default',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          // 被更具体 selector 过滤后回落到 default 的名字仍需豁免：
          // 含 `/` 的键（构建输入映射、测试数据路径）、含 `-` 的键
          // （DOM 自定义元素注册名）、`__` 前缀（Node 全局惯例）
          filter: { regex: '^__|[-/]', match: false },
        },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
          leadingUnderscore: 'allow',
          // 跳过 `__` 前缀（Node 全局惯例，如 __dirname）
          filter: { regex: '^__', match: false },
        },
        { selector: 'function', format: ['camelCase', 'PascalCase'] },
        { selector: 'typeLike', format: ['PascalCase'] },
        {
          selector: 'typeProperty',
          format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
          // 跳过含 `-` 的键（DOM 自定义元素注册名）
          filter: { regex: '^(?!.*-)', match: true },
        },
        { selector: 'import', format: ['camelCase', 'PascalCase'] },
      ],

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
  files: ['themes/hibikilogy/src/**/*.ts'],
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
}, {
  // 声明文件镜像外部契约（DOM 注册名、库类型），豁免命名约定
  files: ['**/*.d.ts'],
  rules: {
    'ts/naming-convention': 'off',
  },
}, {
  // heti.ts 为移植的三方库代码，保持原命名
  files: ['themes/hibikilogy/src/ui/article/heti.ts'],
  rules: {
    'ts/naming-convention': 'off',
  },
})
