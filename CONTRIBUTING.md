# 贡献指南

## 项目简介

《京吹学报》网站使用 [Zola](https://www.getzola.org/) 构建，部署在 [GitHub Pages](https://hibikilogy.github.io/)。

## 贡献方式

### 投稿文章

如果你有吹学文章想投稿，请参阅[我要投稿](https://hibikilogy.vercel.app/docs/contribute/)页面。

### 参与开发

## 环境准备

- **Node.js** >= 24
- **pnpm** >= 10（`npm i -g pnpm`）
- **Rust** 工具链（`cargo`，用于字体子集化等脚本）
- **Zola** >= 0.18（[官方安装指南](https://www.getzola.org/documentation/getting-started/installation/)）

## 快速开始

```bash
git clone https://github.com/hibikilogy/hibikilogy.github.io.git
cd hibikilogy.github.io

# 安装依赖
pnpm install

# 启动开发服务器（同时编译前端组件和 UnoCSS）
pnpm dev:all

# 仅启动 Zola 开发服务器
pnpm dev
```

开发服务器默认运行在 `http://127.0.0.1:1111`。

## 项目结构

```
hibikilogy/
├── content/               # 文章内容（Markdown + TOML front matter）
│   └── docs/              # 静态文档页（投稿、加入我们等）
├── templates/             # Zola Tera 模板
│   ├── components/        # 可复用模板片段
│   └── shortcodes/        # 自定义 shortcode
├── sass/                  # Sass 样式（按 base/components/layouts 分层）
├── components/            # Lit Web Components（TypeScript）
├── lib/                   # TypeScript 工具库（搜索、UI 组件）
│   ├── search/            # 基于 fuse.js 的搜索实现
│   └── ui/                # UI 小组件
├── static/                # 静态资源（字体、图片、编译产物）
├── scripts/               # Rust 构建脚本
├── tests/                 # 测试文件
├── config.toml            # Zola 配置文件
├── vite.config.ts         # Vite 打包配置
└── unocss.config.ts       # UnoCSS 配置
```

## 开发工作流

### 分支策略

- `next` — 主开发分支，推送即触发部署
- `main` — （保留）
- `dev` — 开发分支
- 功能分支从 `next` 拉出，完成后提交 PR 合入 `next`

### 构建

```bash
pnpm build:all     # 完整构建：组件 → UnoCSS → 字体子集 → Zola → 图片链接重写
pnpm build         # 仅 Zola 构建
pnpm typecheck     # TypeScript 类型检查
```
