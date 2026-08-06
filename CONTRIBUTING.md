# 贡献指南

《京吹学报》网站使用 [Zola](https://www.getzola.org/) 构建，部署在 [GitHub Pages](https://hibikilogy.github.io/)。其内容以 Markdown 格式编写，存放在 content 目录中。对于简单的修改，你可以直接在 GitHub 上编辑相应文件并创建 Pull Request。

## 内容贡献

如果你有吹学文章想投稿，请参阅[我要投稿](https://hibikilogy.vercel.app/docs/contribute/)页面。

转载文章可让Agent使用[【article-import】 Skill](./.agents/skills/article-import/SKILL.md)辅助导入。

## 开发环境

- **[Node.js](https://nodejs.org/en/download)** >= 24
- **[pnpm](https://pnpm.io/installation)** >= 10
- **[Rust](https://rust-lang.org/tools/install/)** >= 1.97.1(仓库通过 `rust-toolchain.toml` 固定版本)
- **[Zola](https://www.getzola.org/)** >= 0.23.1

> [!NOTE]
> **Windows 用户**：官方 Zola 0.23.x Windows 二进制有上游 bug——`canonicalize()` 产生 `\\?\` UNC 路径导致模板无法加载（CI 为 Linux 不受影响）。本地开发需用应用了 `strip_unc` 补丁重新编译的二进制。

```bash
git clone https://github.com/hibikilogy/hibikilogy.github.io.git
cd hibikilogy.github.io
pnpm install
pnpm dev:all
```

本地站点默认运行在 `http://127.0.0.1:1111`。

```bash
pnpm dev:zola    # Zola
pnpm dev:vite    # 主题资源 watch
pnpm dev:admin   # CMS 预览
pnpm dev:all     # Zola + Vite
```

## 项目结构

```text
├─ content/                         # Markdown 内容
├─ static/                          # 站点静态资源、CMS 产物
├─ cms/                             # Sveltia CMS 预览源码
├─ scripts/                         # Rust/TypeScript 构建工具
├─ themes/hibikilogy/
│  ├─ templates/                    # Tera 模板和 shortcode
│  ├─ styles/                       # CSS 源码
│  ├─ components/                   # Lit Web Components
│  ├─ src/
│  │  ├─ app/                       # 生命周期和组合
│  │  ├─ features/                  # Search、Waterfall
│  │  ├─ infrastructure/            # Swup、运行时配置
│  │  ├─ ui/                        # DOM adapter 和动画
│  │  └─ shared/                    # 通用函数、DOM 契约
│  └─ static/                       # 主题构建产物
├─ config.toml
├─ vite.config.ts
├─ vite.admin.config.ts
└─ vitest.config.ts
```

TypeScript 分层和 review 规则见 [themes/hibikilogy/src/README.md](./themes/hibikilogy/src/README.md)。

### 路径别名

| 别名 | 路径 |
|------|------|
| `shared` | `themes/hibikilogy/src/shared` |
| `app` | `themes/hibikilogy/src/app` |
| `ui` | `themes/hibikilogy/src/ui` |
| `features` | `themes/hibikilogy/src/features` |
| `infra` | `themes/hibikilogy/src/infrastructure` |
| `components` | `themes/hibikilogy/components` |

## 验证

### TypeScript

```bash
pnpm verify:ts
```

包含 typecheck、Vitest、TS scoped lint、主题和 CMS 构建。

### 模板、样式、导航

```bash
pnpm lint
zola build
```

### Rust 脚本

```bash
pnpm test:rust      # cargo nextest + 文档测试
pnpm verify:rust    # fmt + clippy + test
```

### 完整构建

```bash
pnpm build:all
```

## 提交与 PR

- `main`：GitHub Pages 部署。
- `dev`、`Refactor/zola`：Vercel Development 部署。
- 提交格式见 [commit convention](./.github/commit-convention.md)。
- scope 使用 `theme`、`scripts`、`content`、`docs`、`build`。

```text
refactor(theme): simplify search state flow
fix(theme): preserve native outline scrolling
docs(theme): document typescript architecture
```

PR 说明修改目标、影响范围、验证结果和已知限制；可见变化附截图或录屏。不要提交密钥、临时目录和无关生成产物。
