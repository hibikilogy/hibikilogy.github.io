# TS 构建脚本

这里的 TypeScript 脚本只在构建/开发时运行，不参与网站运行时。Rust 构建工具（`hibikilogy-tools` crate）已迁往 [`scripts/rust/`](rust/)，见其 README。

通过根目录 `pnpm` 命令调用，Node 24 直接以类型擦除方式运行 `.ts` 入口。

## 目录

- `beasties/` — 关键 CSS 内联（`pnpm build:beasties`，在 `pnpm build:all` 中于 Zola 构建后运行）。`stylesheetPublicPath.ts` 决定样式表 href 如何映射到 `public/` 下的文件。
- `benchmark-search/` — 搜索运行时基准（`pnpm benchmark:search`）。
- `dev-cms/` — 监听 `static/` 并把变更同步到 `public/`（`pnpm dev:cms`），供 CMS 配置开发。
- `og-render/` — 构建期 OG 卡片图渲染器（`pnpm build:og`，在 Zola 构建前运行）：遍历 `content/articles/` 的 front matter，用仓库内 Source Han VF 实例化+子集化的本地静态字体渲染 1200×630 `.jpg` 卡片到 `static/og/articles/`；按内容摘要 + 渲染器指纹增量渲染（字体/素材/渲染器源码任一变化都会全量失效），清单缓存于 `static/_cache/og-render-manifest.json`。资产与字体在同目录 `assets/`、`fonts/` 下（字体为本地 Source Han VF 一次性实例化+子集化产物；渲染器自带缺字形检查）。
- `verify-commit/` — commit-msg 钩子校验（Angular 约定式提交）。
- `vite/` — Vite 插件：`hibikilogy-config`（站点/i18n 配置烘焙为 `virtual:hibikilogy-config`）、`entries`、`sync-build-output`。
- `checkI18nKeys.test.ts` — 校验模板 i18n key、JS 翻译引用与 CMS `config.yml` 字段同 `i18n/zh.toml` 保持同步（随 `pnpm test:ts` 运行）。

测试与代码同目录（`*.test.ts`），验证门槛：`pnpm typecheck && pnpm test:ts && pnpm lint:ts`，或一次跑 `pnpm verify:ts`。
