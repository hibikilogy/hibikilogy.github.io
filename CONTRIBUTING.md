# 贡献指南

## 项目简介

《京吹学报》网站使用 [Zola](https://www.getzola.org/) 构建，部署在 [GitHub Pages](https://hibikilogy.github.io/)。其内容以 Markdown 格式编写，存放在 content 目录中。对于简单的修改，你可以直接在 GitHub 上编辑相应文件并创建 Pull Request。

## 贡献方式

### 投稿文章

如果你有吹学文章想投稿，请参阅[我要投稿](https://hibikilogy.vercel.app/docs/contribute/)页面。

### 参与开发

#### 环境准备

- **[Node.js](https://nodejs.org/en/download)** >= 24
- **[pnpm](https://pnpm.io/installation)** >= 10
- **[Rust](https://rust-lang.org/tools/install/)** 工具链（用于字体子集化等脚本）
- **[Zola](https://www.getzola.org/)** >= 0.18

#### 快速开始

```bash
git clone https://github.com/hibikilogy/hibikilogy.github.io.git
cd hibikilogy.github.io

# 安装依赖
pnpm install

# 启动开发服务器（同时编译前端组件和 UnoCSS）
pnpm dev:all

# 或者仅启动 Zola 开发服务器
pnpm dev
```

开发服务器默认运行在 `http://127.0.0.1:1111`。

#### 项目结构

```
hibikilogy.github.io/
├── content/               # 文章内容（Markdown + TOML front matter）
│   ├── articles/          # Markdown 格式文章
│   └── docs/              # 静态文档页（投稿、加入我们等）
├── templates/             # Zola Tera 模板
│   ├── components/        # 可复用模板片段
│   ├── shortcodes/        # 自定义 shortcode 模板
├── sass/                  # 网站 ass 样式
├── components/            # Lit Web Components
├── lib/                   # 网页交互和搜索相关逻辑实现
│   ├── search/            # 基于 fuse.js 的站内搜索
│   └── ui/                # UI 小组件
├── static/                # 静态资源
│   ├── fonts/             # 网站字体，其中文件后缀中带有 hash 的字体文件为脚本自动生成，无需提交
│   ├── imgs/              # 文章配图（按日期或文章分组）
│   └── svg/               # 自定义 SVG 图标（UnoCSS icons 来源）
├── scripts/               # Rust 构建脚本（字体子集、图片链接重写、短链生成）
├── config.toml            # Zola 配置文件
├── vite.config.ts         # Vite 打包配置
└── unocss.config.ts       # UnoCSS 配置
```

#### 开发工作流

#### 分支策略

- `main` — 主分支，推送即触发 [GitHub Pages 部署](https://github.com/hibikilogy/hibikilogy.github.io/actions/workflows/pages.yml)
- 功能分支从 `main` 拉出，完成后提交 PR 合入 `main`

#### 构建

```bash
pnpm build:all     # 完整构建：Vite → UnoCSS → 字体子集 → Zola → 图片链接重写 → 短链生成
pnpm build         # 仅 Zola 构建
pnpm typecheck     # TypeScript 类型检查
```
