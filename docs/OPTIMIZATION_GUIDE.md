# 优化功能使用指南

本文档介绍最近添加的三个主要优化功能。

## 🧪 1. 自动化测试（Content Validation）

### 功能说明

每次提交或 PR 时，GitHub Actions 会自动运行以下检查：

1. **YAML Front Matter 验证**
   - 检查必需字段：`layout`, `title`
   - 警告缺失字段：`author`, `tags`

2. **文件命名规范检查**
   - 确保文件名符合 `YYYY-MM-DD-title.md` 格式

3. **图片引用验证**
   - 检查相对路径图片是否存在
   - 提示缺失的图片文件

4. **链接检查**
   - 验证文章中的外部链接是否有效
   - 仅检查变更的文件，避免超时

5. **Jekyll 构建测试**
   - 确保网站可以成功构建

### 查看测试结果

1. 提交代码后，访问 GitHub Actions 标签页
2. 查看 "Content Validation" 工作流
3. 如果测试失败，点击查看详细日志

### 本地运行测试

```bash
# 验证 YAML front matter
for file in _posts/*.md; do
  grep -q "^layout:" "$file" || echo "Missing layout: $file"
done

# 构建 Jekyll
jekyll build --verbose
```

## 🌙 2. 深色模式（Dark Mode）

### 功能说明

为网站添加了深色主题，保护眼睛，提升夜间阅读体验。

### 使用方法

1. **切换主题**
   - 点击导航栏右上角的月亮/太阳图标
   - 主题会自动保存到浏览器

2. **自动记忆**
   - 下次访问时自动应用上次选择的主题

3. **无闪烁加载**
   - 页面加载时立即应用保存的主题，避免闪烁

### 技术实现

- **CSS 变量**：使用 `data-theme` 属性控制主题
- **LocalStorage**：保存用户偏好
- **LESS 预处理**：模块化样式管理

### 自定义颜色

编辑 `less/dark-mode.less` 文件中的颜色变量：

```less
@dark-bg: #1a1a1a;              // 背景色
@dark-text: #e0e0e0;            // 文字色
@dark-link: #6eb5ff;            // 链接色
```

### 编译样式

```bash
# 安装 Less
npm install -g less less-plugin-clean-css

# 编译深色模式样式
lessc less/dark-mode.less css/dark-mode.css
lessc --clean-css less/dark-mode.less css/dark-mode.min.css

# 或使用 Grunt（如果有 package.json）
grunt less
```

## 📝 3. 文章模板（Article Templates）

### 功能说明

提供了标准化的投稿流程和文章模板，降低贡献门槛。

### 投稿方式

#### 方式一：GitHub Issue（推荐新手）

1. 访问 [Issues](https://github.com/hibikilogy/hibikilogy.github.io/issues/new/choose)
2. 选择"📝 投稿文章"模板
3. 填写表单并提交

#### 方式二：Pull Request（推荐熟悉 Git 的用户）

1. Fork 仓库
2. 复制 `_posts/_TEMPLATE.md` 创建新文章
3. 按照模板填写内容
4. 提交 PR

### 文件结构

```
.github/
├── ISSUE_TEMPLATE/
│   ├── submit-article.md      # 投稿 Issue 模板
│   └── config.yml             # Issue 模板配置
├── pull_request_template.md   # PR 模板
└── workflows/
    └── content-validation.yml  # 自动化测试

_posts/
└── _TEMPLATE.md               # 文章模板

CONTRIBUTING.md                # 投稿指南
```

### 模板内容

**Issue 模板**包含：
- 文章信息表单
- 内容输入区
- 图片资源说明
- 提交前检查清单

**PR 模板**包含：
- 变更类型选择
- 变更说明
- 检查清单
- 截图区域

**文章模板**包含：
- 完整的 YAML front matter
- 常用 Markdown 语法示例
- 图片、表格、列表等示例
- 使用说明

### 使用文章模板

```bash
# 复制模板
cp _posts/_TEMPLATE.md _posts/2024-06-15-my-article.md

# 编辑文章
vim _posts/2024-06-15-my-article.md

# 提交
git add _posts/2024-06-15-my-article.md
git commit -m "Add: 新文章标题"
git push
```

## 🚀 快速开始

### 1. 编译深色模式样式

```bash
# 如果还没有安装 Less
npm install -g less less-plugin-clean-css

# 编译样式
lessc less/dark-mode.less css/dark-mode.css
lessc --clean-css less/dark-mode.less css/dark-mode.min.css
```

### 2. 测试深色模式

```bash
# 启动本地服务器
jekyll serve

# 访问 http://127.0.0.1:4000
# 点击导航栏的月亮图标测试主题切换
```

### 3. 提交第一篇文章

```bash
# 使用模板创建文章
cp _posts/_TEMPLATE.md _posts/2024-06-15-test-article.md

# 编辑文章内容
# ...

# 提交
git add _posts/2024-06-15-test-article.md
git commit -m "Add: 测试文章"
git push
```

## 📊 效果展示

### 自动化测试

- ✅ 每次提交自动运行
- ✅ 5 种验证检查
- ✅ 详细的错误报告
- ✅ 防止错误内容合并

### 深色模式

- 🌙 护眼深色主题
- 💾 自动保存偏好
- ⚡ 无闪烁加载
- 🎨 完整的样式适配

### 文章模板

- 📋 标准化投稿流程
- 📝 详细的使用说明
- ✅ 提交前检查清单
- 🎯 降低贡献门槛

## 🔧 故障排除

### 深色模式不生效

1. 检查是否编译了 CSS：`css/dark-mode.css` 是否存在
2. 清除浏览器缓存
3. 检查浏览器控制台是否有错误

### 自动化测试失败

1. 查看 GitHub Actions 日志
2. 检查文件命名是否正确
3. 验证 YAML front matter 格式
4. 确保所有图片文件存在

### Jekyll 构建失败

```bash
# 查看详细错误信息
jekyll build --verbose

# 检查 Ruby 和 Jekyll 版本
ruby --version
jekyll --version
```

## 📚 相关文档

- [投稿指南](CONTRIBUTING.md)
- [README](README.md)
- [Jekyll 文档](https://jekyllrb.com/)
- [Markdown 语法](https://www.markdownguide.org/)

---

如有问题，请在 [Issues](https://github.com/hibikilogy/hibikilogy.github.io/issues) 中反馈。
