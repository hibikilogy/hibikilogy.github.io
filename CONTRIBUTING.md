# 贡献指南

## 项目简介

《京吹学报》网站使用 [Zola](https://www.getzola.org/) 构建，部署在 [GitHub Pages](https://hibikilogy.github.io/)。其内容以 Markdown 格式编写，存放在 content 目录中。对于简单的修改，你可以直接在 GitHub 上编辑相应文件并创建 Pull Request。

## 贡献方式

### 投稿文章

如果你有吹学文章想投稿，请参阅[我要投稿](https://hibikilogy.vercel.app/docs/contribute/)页面。

#### 使用 Agent 辅助导入转载文章

如果需要将已经发布在其他网站的文章转载到本项目，可以在本仓库中使用 [`article-import` Skill](./.agents/skills/article-import/SKILL.md) 完成整理和导入。请仅在确实取得正文及图片转载授权后使用，并在请求中明确说明授权情况，例如：

```text
使用 $article-import 导入这篇已取得全文及图片转载授权的文章：<原文 URL>
```

除原文 URL 外，也可以提供复制的网页正文、HTML、Markdown、纯文本或本地提取文件。Skill 会检查重复文章、整理 Markdown 与 Zola 元数据、规划图片本地化，并提供两种后续方式：

- **本地导入**：写入仓库后检查 front matter、链接和图片路径，并执行本地构建验证；
- **CMS 交接**：使用系统默认浏览器打开预填的 Sveltia CMS 页面，随后由用户在 CMS 中完成余下操作。

### 参与开发

#### 环境准备

- **[Node.js](https://nodejs.org/en/download)** >= 24
- **[pnpm](https://pnpm.io/installation)** >= 10
- **[Rust](https://rust-lang.org/tools/install/)** >= 1.70
- **[Zola](https://www.getzola.org/)** >= 0.22.1

#### 快速开始

```bash
git clone https://github.com/hibikilogy/hibikilogy.github.io.git
cd hibikilogy.github.io

# 安装依赖
pnpm install

# 启动全部开发服务器（Zola + Vite watch）
pnpm dev:all

# 或者仅启动 Zola 开发服务器
pnpm dev

# CMS 预览界面开发
pnpm dev:admin
```

开发服务器默认运行在 `http://127.0.0.1:1111`。

#### 项目结构

```
hibikilogy.github.io/
├── content/                    # 文章内容（Markdown + TOML front matter）
│   ├── articles/               # Markdown 格式文章
│   └── docs/                   # 静态文档页（投稿、加入我们等）
├── themes/
│   └── hibikilogy/             # 站点主题（Zola Theme）
│       ├── templates/          # Zola Tera 模板
│       │   ├── base.html       # 全局基础布局
│       │   ├── page.html       # 文章详情页模板
│       │   ├── section.html    # 文章列表/分区页模板
│       │   ├── index.html      # 首页模板
│       │   ├── docs.html       # 文档页模板
│       │   ├── search.html     # 搜索页模板
│       │   ├── 404.html        # 404 错误页
│       │   ├── robots.txt      # robots.txt 模板
│       │   ├── macros/         # Tera 宏（可复用逻辑函数）
│       │   ├── components/     # 可复用 UI 组件模板
│       │   ├── shortcodes/     # Zola Shortcode 模板
│       │   ├── tags/           # 标签分类页面模板
│       │   │   ├── list.html   # 标签列表页
│       │   │   └── single.html # 单个标签的文章列表页
│       │   └── author/         # 作者分类页面模板
│       │       ├── list.html   # 作者列表页
│       │       └── single.html # 单个作者的文章列表页
      │       ├── styles/               # CSS 样式（base/components/layouts，Lightning CSS 编译）
      │       ├── src/                # TypeScript 源码（搜索、UI 组件）
│       │   ├── search/         # 基于 fuse.js 的站内搜索
│       │   └── ui/             # UI 交互逻辑
│       ├── components/         # Lit Web Components（lazy-image 等）
│       ├── static/             # 主题静态资源
│       │   ├── fonts/          # 字体子集文件（脚本自动生成）
│       │   ├── js/             # Vite 构建的 JS bundle
      │       │   ├── styles/         # 构建生成的 CSS（Lightning CSS + UnoCSS）
│       │   └── svg/            # 自定义 SVG 图标
│       ├── i18n/               # 多语言翻译文件
│       │   └── zh.toml         # 中文翻译（站点可通过 config.toml 覆写）
│       └── theme.toml          # 主题元数据及默认配置
├── static/                     # 站点专属静态资源（覆盖主题）
│   ├── admin/                   # Sveltia CMS 入口及构建产出
│   │   ├── index.html           # CMS 入口页
│   │   ├── config.yml           # CMS 配置（集合定义、后端、预览）
│   │   ├── admin.js             # 构建产出的 CMS 预览 JS
│   │   └── admin.css            # 构建产出的 CMS 预览样式
│   ├── imgs/                    # 文章配图（按日期或文章分组）
├── cms/                         # CMS 预览界面源码（TypeScript + JSX）
│   ├── bootstrap.ts             # 入口：初始化 CMS、注册预览模板和样式
│   ├── components.tsx           # 预览用展示组件（PreviewPage、PostHero 等）
│   ├── previews/                # 各集合的预览模板适配器
│   ├── adapters.ts              # CMS Immutable.js 数据访问适配层
│   ├── runtime.ts               # Sveltia CMS JSX 运行时桥接
│   └── shared.ts                # 共享常量和格式化工具
├── scripts/                     # Rust 构建脚本（字体子集、图片链接重写、短链生成）
│   └── vite/                    # Vite 插件
├── config.toml                  # Zola 站点配置
├── vite.config.ts               # Vite 打包配置（主题 JS）
├── vite.admin.config.ts         # Vite 打包配置（CMS 预览）
└── unocss.config.ts             # UnoCSS 配置
```

#### 开发工作流

#### 分支策略

- `main` — 主分支，推送即触发 [GitHub Pages 部署](https://github.com/hibikilogy/hibikilogy.github.io/actions/workflows/pages.yml)
- 功能分支从 `main` 拉出，完成后提交 PR 合入 `main`

#### 构建

```bash
pnpm build:all     # 完整构建：Vite (JS + UnoCSS + CSS) → CMS → 字体子集 → Zola → Beasties → 图片链接重写 → 短链生成
pnpm build         # 构建 Vite 资源与 Zola 站点
```
