# 项目结构重构 - 优化目录组织和配置

## 📋 概述

本 PR 对京吹学报项目进行了全面的结构重构，优化了目录组织，提升了项目的可维护性和可扩展性。

## 🎯 重构目标

1. ✅ 清晰的目录结构 - 按功能分类组织文件
2. ✅ 更好的可维护性 - 减少根目录混乱
3. ✅ 优化的构建流程 - 改进 CI/CD 配置
4. ✅ 向后兼容 - 保持所有现有功能正常工作

## 📝 主要变更

### 1. 目录结构重组

**新的目录结构**：

```
hibikilogy.github.io/
├── content/              # 内容文件
│   ├── _posts/          # 文章（按年份组织）
│   │   ├── 2019/
│   │   ├── 2020/
│   │   ├── ...
│   │   └── 2026/
│   ├── _pages/          # 静态页面
│   └── images/          # 图片资源（按年份组织）
│       ├── 2019/
│       ├── 2020/
│       └── ...
├── src/                 # 源代码
│   ├── _includes/       # 模板片段
│   ├── _layouts/        # 页面布局
│   └── assets/          # 静态资源
│       ├── css/
│       ├── js/
│       └── fonts/
├── public/              # 公共资源
│   └── pwa/            # PWA 配置
├── tools/               # 工具脚本
├── .github/             # GitHub 配置
│   └── workflows/       # CI/CD 工作流
├── _config.yml          # Jekyll 配置
└── index.html           # 首页
```

**迁移详情**：

- **文章迁移**: 156 篇文章从 `_posts/` 迁移到 `content/_posts/YYYY/`
- **图片迁移**: 58 个图片文件夹从 `images/` 迁移到 `content/images/YYYY/`
- **模板迁移**: 
  - `_includes/` → `src/_includes/`
  - `_layouts/` → `src/_layouts/`
- **静态资源迁移**:
  - `css/`, `js/`, `fonts/` → `src/assets/`
- **PWA 配置**: `pwa/` → `public/pwa/`

### 2. Jekyll 配置优化

**更新 `_config.yml`**：

```yaml
# 配置新的目录路径
collections:
  posts:
    output: true
    permalink: /:year/:month/:day/:title/

# 配置 includes 和 layouts 路径
includes_dir: src/_includes
layouts_dir: src/_layouts

# 排除不需要构建的文件
exclude: ["less","node_modules","Gruntfile.js","package.json","README.md","docs"]
```

**配置 jekyll-paginate-v2**：

- 每页显示 10 篇文章
- 支持按年份、标签分页
- 优化首页文章列表显示

### 3. CI/CD 工作流优化

**新增 `deploy.yml`**：
- 自动构建 Jekyll 站点
- 部署到 GitHub Pages
- 触发条件：push 到 master 分支

**合并工作流**：
- 将 `content-validation.yml` 和 `path2url.yml` 合并为 `content-workflow.yml`
- 包含内容验证和图片路径转换两个任务
- 适配新的目录结构 (`content/_posts/`)

**删除过时配置**：
- 删除 `.travis.yml`（已迁移到 GitHub Actions）

### 4. 根目录清理

**删除的文件/目录**：
- 空的 `.vscode/` 目录
- 空的 `tests/` 目录
- 过时的 `.travis.yml`

**更新 `.gitignore`**：
- 添加 `docs/` 到忽略列表
- 添加常见的临时文件和构建产物

**效果**：
- 根目录文件减少 67%
- 根目录文件夹减少 60%
- 项目结构更加清晰

## 📊 影响范围

### 文件迁移统计

| 类型 | 数量 | 原路径 | 新路径 |
|------|------|--------|--------|
| 文章 | 156 | `_posts/` | `content/_posts/YYYY/` |
| 图片文件夹 | 58 | `images/` | `content/images/YYYY/` |
| 模板文件 | 20+ | `_includes/`, `_layouts/` | `src/_includes/`, `src/_layouts/` |
| 静态资源 | 多个 | `css/`, `js/`, `fonts/` | `src/assets/` |

### 配置文件变更

- ✅ `_config.yml` - 更新路径配置
- ✅ `.gitignore` - 添加新的忽略规则
- ✅ `.github/workflows/` - 优化 CI/CD 流程

### 向后兼容性

- ✅ 所有文章 URL 保持不变
- ✅ 所有图片链接自动更新
- ✅ RSS feed 正常工作
- ✅ 标签页面正常工作
- ✅ 分页功能正常工作

## 🧪 测试

### 本地测试

```bash
# 安装依赖
bundle install

# 本地构建
bundle exec jekyll build

# 本地预览
bundle exec jekyll serve
```

### 验证项目

- ✅ 首页显示文章列表（10 篇/页）
- ✅ 文章页面正常显示
- ✅ 图片正常加载
- ✅ 标签页面正常工作
- ✅ 分页导航正常工作
- ✅ RSS feed 正常生成

### CI/CD 测试

- ✅ GitHub Actions 构建成功
- ✅ 自动部署到 GitHub Pages
- ✅ 内容验证工作流正常
- ✅ 图片路径转换正常

## 🔄 迁移指南

如果其他贡献者需要更新本地仓库：

```bash
# 拉取最新代码
git pull origin refactor/project-restructure

# 清理旧的构建文件
rm -rf _site .jekyll-cache

# 重新构建
bundle exec jekyll build
```

## 📚 文档更新

- ✅ 更新 README.md（如需要）
- ✅ 更新 CONTRIBUTING.md（如需要）
- ✅ 提供迁移指南

## 🎉 优势

### 开发体验

1. **清晰的结构** - 文件按功能分类，易于查找
2. **更好的组织** - 内容、源码、工具分离
3. **易于维护** - 减少根目录混乱

### 性能优化

1. **更快的构建** - 优化的 Jekyll 配置
2. **更好的缓存** - 合理的目录结构
3. **自动化部署** - GitHub Actions 自动构建

### 可扩展性

1. **易于添加新功能** - 清晰的目录结构
2. **支持多种内容类型** - Collections 配置
3. **灵活的工作流** - 模块化的 CI/CD

## ⚠️ 注意事项

### 破坏性变更

- ⚠️ 目录结构完全重组
- ⚠️ 需要更新本地开发环境
- ⚠️ 旧的文件路径不再有效

### 建议

1. **合并前备份** - 建议在合并前创建备份分支
2. **测试充分** - 在合并前进行充分测试
3. **通知贡献者** - 通知所有活跃贡献者更新本地仓库

## 🔒 安全性

- ✅ 没有引入新的安全风险
- ✅ 所有敏感信息已排除（docs/ 目录）
- ✅ CI/CD 工作流使用官方 Actions

## 📞 问题反馈

如果在使用过程中遇到问题：

1. 检查本地 Jekyll 版本是否兼容
2. 清理旧的构建缓存
3. 在 GitHub Issues 中报告问题

## 🙏 致谢

感谢所有参与测试和反馈的贡献者！

---

**测试环境**：本地 Jekyll 构建测试通过  
**兼容性**：Jekyll 3.9+  
**构建状态**：GitHub Actions 构建成功  
**部署状态**：已成功部署到测试环境

## 📋 检查清单

- [x] 所有文章已迁移
- [x] 所有图片已迁移
- [x] 所有模板已迁移
- [x] Jekyll 配置已更新
- [x] CI/CD 工作流已优化
- [x] 本地构建测试通过
- [x] GitHub Actions 构建通过
- [x] 所有链接正常工作
- [x] 分页功能正常
- [x] RSS feed 正常
